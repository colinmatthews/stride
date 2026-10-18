import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import {
  addComment,
  buildBootstrap,
  createActivity,
  createUser,
  ElevationError,
  findUserForAuth,
  getActivityById,
  getActivityElevation,
  getAnalyticsDistinctId,
  type CorrectionTrigger,
  listActivities,
  previewElevationCorrection,
  saveElevationCorrection,
  toggleChallengeEntry,
  toggleClubMembership,
  toggleFollow,
  toggleKudo,
  type DeviceInput,
} from "./data.js";
import { captureServerEvent } from "./analytics.js";
import { CORRECTABLE_SPORTS, parseElevationStream } from "./elevation.js";
import { GpxParseError, parseGpx } from "./gpx.js";
import {
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "./auth.js";

const ELEVATION_ERROR_STATUS = {
  not_found: 404,
  forbidden: 403,
  unsupported_sport: 422,
  no_stream: 422,
  terrain_unavailable: 503,
} as const;

const ELEVATION_ERROR_MESSAGE = {
  not_found: "Activity not found",
  forbidden: "Only the athlete who recorded this activity can correct it",
  unsupported_sport: "Elevation can't be corrected for this sport",
  no_stream: "This activity has no recorded elevation to correct",
  terrain_unavailable: "Terrain data is temporarily unavailable. Try again in a few minutes.",
} as const;

const IMPORT_SPORTS = new Set([...CORRECTABLE_SPORTS, "Swim"]);

function sendElevationError(error: unknown, response: express.Response) {
  if (!(error instanceof ElevationError)) return false;
  response
    .status(ELEVATION_ERROR_STATUS[error.code])
    .json({ error: ELEVATION_ERROR_MESSAGE[error.code], code: error.code });
  return true;
}

function parseDevice(input: unknown): { device?: DeviceInput } | { error: string } {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object") return { error: "device must be an object" };
  const raw = input as Record<string, unknown>;
  const device: DeviceInput = {};
  for (const key of ["name", "manufacturer", "model", "firmware"] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 100) {
      return { error: `device.${key} must be a string of up to 100 characters` };
    }
    device[key] = value.trim();
  }
  if (raw.elevationSource !== undefined) {
    if (raw.elevationSource !== "barometric" && raw.elevationSource !== "gps") {
      return { error: 'device.elevationSource must be "barometric" or "gps"' };
    }
    device.elevationSource = raw.elevationSource;
  }
  return { device };
}

export function createApp() {
  const app = express();
  const clientDistPath = path.resolve(process.cwd(), "dist");
  const clientIndexPath = path.join(clientDistPath, "index.html");

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/auth/register", async (request, response, next) => {
    try {
      const email = String(request.body.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(request.body.password ?? "");
      const name = String(request.body.name ?? "").trim();

      if (!name || !email || password.length < 8) {
        response
          .status(400)
          .json({ error: "Name, email, and an 8 character password are required" });
        return;
      }

      const existing = await findUserForAuth(email);

      if (existing) {
        response.status(409).json({ error: "An account already exists for that email" });
        return;
      }

      const { hash, salt } = await hashPassword(password);
      const user = await createUser({
        email,
        passwordHash: hash,
        passwordSalt: salt,
        name,
      });

      await createSession(user.id, response);
      response.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (request, response, next) => {
    try {
      const email = String(request.body.email ?? "")
        .trim()
        .toLowerCase();
      const password = String(request.body.password ?? "");
      const user = await findUserForAuth(email);

      if (!user || !user.password_hash || !user.password_salt) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, user.password_salt, user.password_hash);

      if (!valid) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }

      await createSession(user.id, response);
      response.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", async (request, response, next) => {
    try {
      await destroySession(request, response);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/bootstrap", requireAuth, async (request, response, next) => {
    try {
      response.json(await buildBootstrap(request.userId!));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activities", requireAuth, async (request, response, next) => {
    try {
      response.json(
        await listActivities(request.userId!, {
          athleteId: request.query.athleteId ? String(request.query.athleteId) : undefined,
          cursor: request.query.cursor ? String(request.query.cursor) : undefined,
          limit: request.query.limit,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activities/:id", requireAuth, async (request, response, next) => {
    try {
      const activity = await getActivityById(request.userId!, String(request.params.id));

      if (!activity) {
        response.status(404).json({ error: "Activity not found" });
        return;
      }

      response.json(activity);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/activities", requireAuth, async (request, response, next) => {
    try {
      const parsedDevice = parseDevice(request.body.device);
      if ("error" in parsedDevice) {
        response.status(400).json({ error: parsedDevice.error });
        return;
      }
      let elevationStream;
      if (request.body.elevationStream !== undefined) {
        const parsedStream = parseElevationStream(request.body.elevationStream);
        if ("error" in parsedStream) {
          response.status(400).json({ error: parsedStream.error });
          return;
        }
        elevationStream = parsedStream.stream;
      }

      const activityId = await createActivity({
        userId: request.userId!,
        sport: request.body.sport,
        title: String(request.body.title ?? ""),
        description: request.body.description ? String(request.body.description) : undefined,
        distanceKm: Number(request.body.distanceKm ?? 0),
        movingSeconds: Number(request.body.movingSeconds ?? 0),
        elevationM:
          request.body.elevationM === undefined ? undefined : Number(request.body.elevationM),
        avgHr: request.body.avgHr ? Number(request.body.avgHr) : undefined,
        avgPaceSecPerKm: request.body.avgPaceSecPerKm
          ? Number(request.body.avgPaceSecPerKm)
          : undefined,
        avgSpeedKmh: request.body.avgSpeedKmh ? Number(request.body.avgSpeedKmh) : undefined,
        routeSeed: Number(request.body.routeSeed ?? 1),
        device: parsedDevice.device,
        elevationStream,
      });

      const activity = await getActivityById(request.userId!, activityId);

      response.status(201).json(activity);
    } catch (error) {
      next(error);
    }
  });

  // GPX import: the raw file is the request body (Content-Type application/gpx+xml).
  app.post(
    "/api/activities/import",
    requireAuth,
    express.text({ type: ["application/gpx+xml", "application/xml", "text/xml"], limit: "15mb" }),
    async (request, response, next) => {
      try {
        const sport = String(request.query.sport ?? "");
        if (!IMPORT_SPORTS.has(sport)) {
          response.status(400).json({ error: "sport must be Run, Ride, Hike, Walk or Swim" });
          return;
        }
        if (typeof request.body !== "string" || request.body.length === 0) {
          response.status(400).json({ error: "Send the GPX file as the request body" });
          return;
        }

        let gpx;
        try {
          gpx = parseGpx(request.body);
        } catch (error) {
          if (error instanceof GpxParseError) {
            response.status(400).json({ error: error.message });
            return;
          }
          throw error;
        }

        const { distanceKm, movingSeconds } = gpx;
        const title = String(request.query.title ?? "").trim() || gpx.name || "Imported activity";
        const activityId = await createActivity({
          userId: request.userId!,
          sport: sport as Parameters<typeof createActivity>[0]["sport"],
          title: title.slice(0, 200),
          distanceKm,
          movingSeconds,
          date: gpx.startedAt ?? undefined,
          avgSpeedKmh:
            sport === "Ride" && movingSeconds > 0
              ? Math.round((distanceKm / (movingSeconds / 3600)) * 10) / 10
              : undefined,
          avgPaceSecPerKm:
            sport !== "Ride" && distanceKm > 0 && movingSeconds > 0
              ? Math.round(movingSeconds / distanceKm)
              : undefined,
          routeSeed: 1,
          // GPX names the recording app or device but not the elevation sensor.
          device: gpx.creator ? { name: gpx.creator.slice(0, 100) } : undefined,
          elevationStream: gpx.stream && sport !== "Swim" ? gpx.stream : undefined,
        });

        response.status(201).json(await getActivityById(request.userId!, activityId));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/activities/:id/elevation", requireAuth, async (request, response, next) => {
    try {
      response.json(await getActivityElevation(request.userId!, String(request.params.id)));
    } catch (error) {
      if (!sendElevationError(error, response)) next(error);
    }
  });

  app.post(
    "/api/activities/:id/elevation/preview",
    requireAuth,
    async (request, response, next) => {
      try {
        response.json(await previewElevationCorrection(request.userId!, String(request.params.id)));
      } catch (error) {
        if (!sendElevationError(error, response)) next(error);
      }
    },
  );

  app.put(
    "/api/activities/:id/elevation/correction",
    requireAuth,
    async (request, response, next) => {
      try {
        const keptVersion = request.body.keptVersion;
        if (keptVersion !== "corrected" && keptVersion !== "original") {
          response.status(400).json({ error: 'keptVersion must be "corrected" or "original"' });
          return;
        }
        const trigger: CorrectionTrigger = request.body.trigger ?? "self";
        if (trigger !== "self" && trigger !== "prompted") {
          response.status(400).json({ error: 'trigger must be "self" or "prompted"' });
          return;
        }

        const activityId = String(request.params.id);
        const result = await saveElevationCorrection(request.userId!, activityId, keptVersion);

        captureServerEvent(await getAnalyticsDistinctId(request.userId!), "activity_corrected", {
          activity_id: activityId,
          sport: result.sport,
          device: result.device?.name ?? null,
          device_manufacturer: result.device?.manufacturer ?? null,
          device_model: result.device?.model ?? null,
          device_firmware: result.device?.firmware ?? null,
          elevation_source: result.elevationSource,
          elevation_before_m: result.elevationBeforeM,
          elevation_after_m: result.elevationAfterM,
          elevation_delta_pct: result.deltaPct,
          kept_version: result.keptVersion,
          method: result.method,
          correction_direction: result.direction,
          error_type: result.errorType,
          flatline_from_km: result.flatlineFromKm,
          trigger,
          spike_count: result.spikeCount,
          sample_count: result.sampleCount,
          moving_seconds: result.movingSeconds,
          distance_km: result.distanceKm,
        });

        response.json({ elevationM: result.elevationM, keptVersion: result.keptVersion });
      } catch (error) {
        if (!sendElevationError(error, response)) next(error);
      }
    },
  );

  app.post("/api/activities/:id/kudos", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleKudo(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/activities/:id/comments", requireAuth, async (request, response, next) => {
    try {
      const activityId = String(request.params.id);
      const text = String(request.body.text ?? "").trim();

      if (!text) {
        response.status(400).json({ error: "Comment text is required" });
        return;
      }

      response.status(201).json(await addComment(request.userId!, activityId, text));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/athletes/:id/follow", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleFollow(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/clubs/:id/join", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleClubMembership(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/challenges/:id/join", requireAuth, async (request, response, next) => {
    try {
      response.json(await toggleChallengeEntry(request.userId!, String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  if (existsSync(clientIndexPath)) {
    app.use("/api", (_request, response) => {
      response.status(404).json({ error: "Not found" });
    });

    app.use(express.static(clientDistPath));

    app.get("/{*splat}", (_request, response) => {
      response.sendFile("index.html", { root: clientDistPath });
    });
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
