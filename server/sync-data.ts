import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createActivity, getActivityById } from "./data.js";
import { db, type DbExecutor } from "./db.js";
import { workoutSyncs } from "./db/schema.js";
import {
  createSyncRef,
  decideRetry,
  parseWorkoutPayload,
  statusAfterFailedRetry,
  toWorkoutSyncDto,
  type IngestInput,
  type Sport,
  type SyncErrorCode,
  type WorkoutSyncDto,
} from "./sync.js";
import { reportServerEvent } from "./telemetry.js";

type SyncRow = typeof workoutSyncs.$inferSelect;
type ImportOutcome = { ok: true; activityId: string } | { ok: false; errorCode: SyncErrorCode };

// Turns the delivered payload into a feed activity. The insert runs in a
// savepoint so a failed import still lets us record the failure.
async function importWorkout(
  tx: DbExecutor,
  userId: string,
  workout: { sport: Sport; title: string; startedAt: Date },
  payload: unknown,
  reportedError: SyncErrorCode | null,
): Promise<ImportOutcome> {
  const parsed = parseWorkoutPayload(payload);

  if (!parsed) {
    // Prefer the device's own explanation when it told us why it couldn't deliver.
    return { ok: false, errorCode: reportedError ?? "upload_interrupted" };
  }

  try {
    const activityId = await tx.transaction((savepoint) =>
      createActivity(
        { userId, sport: workout.sport, title: workout.title, date: workout.startedAt, ...parsed },
        savepoint,
      ),
    );
    return { ok: true, activityId };
  } catch (error) {
    console.error("Workout import failed", error);
    return { ok: false, errorCode: "import_failed" };
  }
}

function report(row: SyncRow, source: "ingest" | "retry") {
  const synced = row.status === "synced";
  reportServerEvent(
    row.userId,
    synced ? "workout_sync_recovered" : "workout_sync_failed",
    {
      sync_ref: row.ref,
      provider: row.provider,
      device: row.deviceName,
      error_code: row.errorCode,
      status: row.status,
      attempt: row.attempts,
      source,
    },
    synced ? "info" : "warn",
  );
}

function outcomeValues(outcome: ImportOutcome) {
  return outcome.ok
    ? { status: "synced", errorCode: null, activityId: outcome.activityId }
    : { errorCode: outcome.errorCode };
}

export async function listWorkoutSyncs(userId: string) {
  const rows = await db
    .select()
    .from(workoutSyncs)
    .where(and(eq(workoutSyncs.userId, userId), inArray(workoutSyncs.status, ["failed", "stuck"])))
    .orderBy(desc(workoutSyncs.startedAt))
    .limit(20);

  return rows.map(toWorkoutSyncDto);
}

// Records a workout reported by a device integration. Re-delivery of the same
// externalId updates the existing row, so a device that re-sends the data
// resolves the sync without the athlete doing anything.
export async function recordWorkoutSync(userId: string, input: IngestInput) {
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(workoutSyncs)
      .where(
        and(
          eq(workoutSyncs.userId, userId),
          eq(workoutSyncs.provider, input.provider),
          eq(workoutSyncs.externalId, input.externalId),
        ),
      )
      .for("update");

    if (existing?.status === "synced") return existing;

    const payload = input.payload ?? existing?.payload ?? null;
    const outcome = await importWorkout(tx, userId, input, payload, input.errorCode ?? null);
    const values = {
      deviceName: input.deviceName,
      sport: input.sport,
      title: input.title,
      startedAt: input.startedAt,
      payload,
      updatedAt: new Date(),
      ...outcomeValues(outcome),
    };

    if (existing) {
      const [updated] = await tx
        .update(workoutSyncs)
        .set(values)
        .where(eq(workoutSyncs.id, existing.id))
        .returning();
      return updated;
    }

    const [inserted] = await tx
      .insert(workoutSyncs)
      .values({
        id: `sync-${randomUUID()}`,
        userId,
        ref: createSyncRef(),
        provider: input.provider,
        externalId: input.externalId,
        status: "failed",
        ...values,
      })
      .returning();
    return inserted;
  });

  if (row.status !== "synced") report(row, "ingest");
  return toWorkoutSyncDto(row);
}

export type RetryResult =
  | { kind: "not_found" }
  | { kind: "retry_exhausted"; sync: WorkoutSyncDto }
  | {
      kind: "done";
      sync: WorkoutSyncDto;
      activity: Awaited<ReturnType<typeof getActivityById>> | null;
    };

// Athlete-initiated retry. The row lock serialises double-clicks and
// concurrent tabs: the second request sees the first one's result.
export async function retryWorkoutSync(userId: string, syncId: string): Promise<RetryResult> {
  const { decision, row } = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workoutSyncs)
      .where(eq(workoutSyncs.id, syncId))
      .for("update");
    const decision = decideRetry(current, userId);

    if (decision.kind !== "attempt") return { decision, row: current };

    const outcome = await importWorkout(
      tx,
      userId,
      { sport: current.sport as Sport, title: current.title, startedAt: current.startedAt },
      current.payload,
      current.errorCode as SyncErrorCode | null,
    );
    const [updated] = await tx
      .update(workoutSyncs)
      .set({
        attempts: decision.attempts,
        updatedAt: new Date(),
        status: outcome.ok ? "synced" : statusAfterFailedRetry(decision.attempts),
        ...outcomeValues(outcome),
      })
      .where(eq(workoutSyncs.id, current.id))
      .returning();
    return { decision, row: updated };
  });

  if (decision.kind === "not_found" || !row) return { kind: "not_found" };
  if (decision.kind === "retry_exhausted") {
    return { kind: "retry_exhausted", sync: toWorkoutSyncDto(row) };
  }
  if (decision.kind === "attempt") report(row, "retry");

  const activity = row.activityId ? await getActivityById(userId, row.activityId) : null;
  return { kind: "done", sync: toWorkoutSyncDto(row), activity };
}
