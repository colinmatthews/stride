import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Express, Response } from "express";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { db } from "./db.js";
import { activities, recordingSessions } from "./db/schema.js";
import { getActivityById } from "./data.js";

const sportSchema = z.enum(["Run", "Ride", "Swim", "Hike", "Walk"]);
const startSchema = z
  .object({
    sport: sportSchema,
    poolLengthM: z.union([z.literal(25), z.literal(50)]).optional(),
  })
  .strict()
  .refine((value) =>
    value.sport === "Swim" ? !!value.poolLengthM : value.poolLengthM === undefined,
  );
const snapshotSchema = z
  .object({
    status: z.enum(["recording", "paused", "stopped"]),
    movingSeconds: z.number().int().min(0).max(604800),
    distanceMeters: z.number().finite().min(0).max(1000000),
    elevationGainM: z.number().finite().min(0).max(50000).nullable(),
    poolLengths: z.number().int().min(0).max(40000).nullable(),
  })
  .strict();
const finishSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();
const openStatuses = ["recording", "paused", "stopped"];

type SessionRow = typeof recordingSessions.$inferSelect;

function sessionDto(row: SessionRow) {
  return {
    id: row.id,
    sport: row.sport,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    movingSeconds: row.movingSeconds,
    distanceMeters: Number(row.distanceMeters),
    elevationGainM: row.elevationGainM === null ? null : Number(row.elevationGainM),
    poolLengthM: row.poolLengthM,
    poolLengths: row.poolLengths,
    activityId: row.activityId,
  };
}

function fail(response: Response, status: number, error: string) {
  response.status(status).json({ error });
}

export function registerRecordingRoutes(app: Express) {
  app.get("/api/recordings/current", requireAuth, async (request, response, next) => {
    try {
      const [row] = await db
        .select()
        .from(recordingSessions)
        .where(
          and(
            eq(recordingSessions.userId, request.userId!),
            inArray(recordingSessions.status, openStatuses),
          ),
        )
        .orderBy(desc(recordingSessions.startedAt))
        .limit(1);
      response.json(row ? sessionDto(row) : null);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/recordings", requireAuth, async (request, response, next) => {
    try {
      const parsed = startSchema.safeParse(request.body);
      if (!parsed.success) return fail(response, 400, "Choose a valid sport and pool length");
      const [existing] = await db
        .select()
        .from(recordingSessions)
        .where(
          and(
            eq(recordingSessions.userId, request.userId!),
            inArray(recordingSessions.status, openStatuses),
          ),
        )
        .limit(1);
      if (existing) {
        return response.status(409).json({
          error: "Finish or discard your current recording",
          session: sessionDto(existing),
        });
      }
      const [row] = await db
        .insert(recordingSessions)
        .values({
          id: randomUUID(),
          userId: request.userId!,
          sport: parsed.data.sport,
          status: "recording",
          poolLengthM: parsed.data.poolLengthM ?? null,
          poolLengths: parsed.data.sport === "Swim" ? 0 : null,
        })
        .returning();
      response.status(201).json(sessionDto(row));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/recordings/:id", requireAuth, async (request, response, next) => {
    try {
      const parsed = snapshotSchema.safeParse(request.body);
      if (!parsed.success) return fail(response, 400, "Invalid recording measurements");
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(recordingSessions)
          .where(
            and(
              eq(recordingSessions.id, String(request.params.id)),
              eq(recordingSessions.userId, request.userId!),
            ),
          )
          .for("update")
          .limit(1);
        if (!row) return { status: 404, error: "Recording not found" };
        if (row.status === "stopped" && parsed.data.status === "stopped")
          return { session: sessionDto(row) };
        if (!openStatuses.includes(row.status))
          return { status: 409, error: "Recording is already finished" };
        const input = parsed.data;
        if (
          input.movingSeconds < row.movingSeconds ||
          (row.sport !== "Swim" && input.distanceMeters + 0.01 < Number(row.distanceMeters))
        ) {
          return { status: 409, error: "Recording measurements cannot decrease" };
        }
        if (row.sport === "Swim") {
          if (
            input.elevationGainM !== null ||
            input.poolLengths === null ||
            input.distanceMeters !== input.poolLengths * row.poolLengthM!
          ) {
            return { status: 400, error: "Swim distance must match completed pool lengths" };
          }
          if (input.poolLengths < (row.poolLengths ?? 0) - 1) {
            return { status: 400, error: "Only the last pool length can be undone" };
          }
        } else if (input.poolLengths !== null) {
          return { status: 400, error: "Pool lengths only apply to swims" };
        }
        const [updated] = await tx
          .update(recordingSessions)
          .set({
            status: input.status,
            movingSeconds: input.movingSeconds,
            distanceMeters: String(input.distanceMeters),
            elevationGainM: input.elevationGainM === null ? null : String(input.elevationGainM),
            poolLengths: input.poolLengths,
            updatedAt: new Date(),
          })
          .where(eq(recordingSessions.id, row.id))
          .returning();
        return { session: sessionDto(updated) };
      });
      if ("error" in result)
        return fail(response, result.status ?? 400, result.error ?? "Invalid recording");
      response.json(result.session);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/recordings/:id/finish", requireAuth, async (request, response, next) => {
    try {
      const parsed = finishSchema.safeParse(request.body);
      if (!parsed.success) return fail(response, 400, "Enter a title of at most 120 characters");
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(recordingSessions)
          .where(
            and(
              eq(recordingSessions.id, String(request.params.id)),
              eq(recordingSessions.userId, request.userId!),
            ),
          )
          .for("update")
          .limit(1);
        if (!row) return { status: 404, error: "Recording not found" };
        if (row.activityId) return { activityId: row.activityId };
        if (row.status !== "stopped")
          return { status: 409, error: "Stop the recording before saving" };
        const distanceKm = Number(row.distanceMeters) / 1000;
        if (row.movingSeconds < 1 || distanceKm <= 0)
          return { status: 400, error: "Record time and distance before saving" };
        const activityId = `act-${randomUUID()}`;
        const source =
          row.sport === "Swim"
            ? "manual-laps"
            : row.elevationGainM === null
              ? "gps-no-elevation"
              : "gps";
        await tx.insert(activities).values({
          id: activityId,
          athleteId: request.userId!,
          sport: row.sport,
          title: parsed.data.title,
          description: parsed.data.description || null,
          date: row.startedAt,
          distanceKm: distanceKm.toFixed(3),
          movingSeconds: row.movingSeconds,
          elevationM: Math.round(Number(row.elevationGainM ?? 0)),
          avgHr: null,
          avgPaceSecPerKm: row.sport === "Ride" ? null : Math.round(row.movingSeconds / distanceKm),
          avgSpeedKmh:
            row.sport === "Ride" ? (distanceKm / (row.movingSeconds / 3600)).toFixed(1) : null,
          routeSeed: 1,
          entryMode: "timer",
          measurementSource: source,
          poolLengthM: row.poolLengthM,
          poolLengths: row.poolLengths,
        });
        await tx
          .update(recordingSessions)
          .set({ status: "completed", activityId, updatedAt: new Date() })
          .where(eq(recordingSessions.id, row.id));
        return { activityId };
      });
      if ("error" in result)
        return fail(response, result.status ?? 400, result.error ?? "Invalid recording");
      response.json(await getActivityById(request.userId!, result.activityId));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/recordings/:id", requireAuth, async (request, response, next) => {
    try {
      const [row] = await db
        .update(recordingSessions)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(
          and(
            eq(recordingSessions.id, String(request.params.id)),
            eq(recordingSessions.userId, request.userId!),
            inArray(recordingSessions.status, openStatuses),
          ),
        )
        .returning();
      if (!row) return fail(response, 404, "Recording not found");
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
