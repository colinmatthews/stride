import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Exercises the sync data layer against a real, migrated Postgres. Opt-in via
// TEST_DB_URL so the suite never touches the database configured in .env.
const testDbUrl = process.env.TEST_DB_URL;

describe.skipIf(!testDbUrl)("workout sync data layer", () => {
  let syncData: typeof import("./sync-data.js");
  let dbModule: typeof import("./db.js");
  let schema: typeof import("./db/schema.js");
  let orm: typeof import("drizzle-orm");
  const userId = `test-${randomUUID()}`;
  const otherUserId = `test-${randomUUID()}`;
  const startedAt = new Date("2026-10-12T06:30:00.000Z");
  const validPayload = { distanceKm: 8.2, movingSeconds: 2460, elevationM: 40, routeSeed: 3 };

  function ingest(externalId: string, extra: Record<string, unknown> = {}, owner = userId) {
    return syncData.recordWorkoutSync(owner, {
      provider: "garmin",
      deviceName: "Garmin Forerunner 265",
      externalId,
      sport: "Run",
      title: "Morning tempo",
      startedAt,
      ...extra,
    });
  }

  async function createUser(id: string) {
    await dbModule.db.insert(schema.users).values({
      id,
      name: "Sync Test",
      handle: id,
      avatarUrl: "",
      city: "Toronto",
      country: "CA",
      bio: "",
    });
  }

  async function syncRow(id: string) {
    const rows = await dbModule.db
      .select()
      .from(schema.workoutSyncs)
      .where(orm.eq(schema.workoutSyncs.id, id));
    return rows[0];
  }

  beforeAll(async () => {
    process.env.DB_URL = testDbUrl;
    dbModule = await import("./db.js");
    schema = await import("./db/schema.js");
    syncData = await import("./sync-data.js");
    orm = await import("drizzle-orm");
    await createUser(userId);
    await createUser(otherUserId);
  });

  afterAll(async () => {
    if (!dbModule) return;
    await dbModule.db
      .delete(schema.users)
      .where(orm.inArray(schema.users.id, [userId, otherUserId]));
    await dbModule.pool.end();
  });

  it("records an interrupted upload and walks it to stuck after the retry limit", async () => {
    const failed = await ingest(`ext-${randomUUID()}`);
    expect(failed).toMatchObject({
      status: "failed",
      errorCode: "upload_interrupted",
      attempts: 0,
    });
    expect(failed.ref).toMatch(/^SYNC-/);
    expect(await syncData.listWorkoutSyncs(userId)).toContainEqual(failed);

    expect(await syncData.retryWorkoutSync(userId, failed.id)).toMatchObject({
      kind: "done",
      sync: { status: "failed", attempts: 1 },
    });
    expect(await syncData.retryWorkoutSync(userId, failed.id)).toMatchObject({
      kind: "done",
      sync: { status: "stuck", attempts: 2 },
    });
    expect(await syncData.retryWorkoutSync(userId, failed.id)).toMatchObject({
      kind: "retry_exhausted",
    });
  });

  it("imports a complete workout straight into the feed", async () => {
    const synced = await ingest(`ext-${randomUUID()}`, { payload: validPayload });
    expect(synced.status).toBe("synced");
    expect(synced.activityId).toBeDefined();
  });

  it("resolves a failed sync when the device re-delivers the workout", async () => {
    const externalId = `ext-${randomUUID()}`;
    const failed = await ingest(externalId, { errorCode: "source_permission_denied" });
    const redelivered = await ingest(externalId, { payload: validPayload });
    expect(redelivered).toMatchObject({ id: failed.id, ref: failed.ref, status: "synced" });

    // Retrying an already-synced workout is a no-op that returns the activity.
    expect(await syncData.retryWorkoutSync(userId, failed.id)).toMatchObject({
      kind: "done",
      sync: { status: "synced", attempts: 0 },
      activity: { id: redelivered.activityId, distanceKm: 8.2 },
    });
  });

  it("does not let another athlete retry the sync", async () => {
    const failed = await ingest(`ext-${randomUUID()}`);
    await expect(syncData.retryWorkoutSync(otherUserId, failed.id)).resolves.toEqual({
      kind: "not_found",
    });
  });

  it("serialises concurrent retries on the same sync", async () => {
    const failed = await ingest(`ext-${randomUUID()}`);
    await Promise.all([
      syncData.retryWorkoutSync(userId, failed.id),
      syncData.retryWorkoutSync(userId, failed.id),
    ]);
    expect((await syncRow(failed.id)).attempts).toBe(2);
  });

  describe("deleting existing data", () => {
    it("deleting a recovered activity is never blocked and leaves the sync record alone", async () => {
      const synced = await ingest(`ext-${randomUUID()}`, { payload: validPayload });

      await dbModule.db
        .delete(schema.activities)
        .where(orm.eq(schema.activities.id, synced.activityId!));

      expect(await syncRow(synced.id)).toMatchObject({
        status: "synced",
        activityId: synced.activityId,
      });
      // Retrying still answers cleanly; there is just no activity to return.
      expect(await syncData.retryWorkoutSync(userId, synced.id)).toMatchObject({
        kind: "done",
        activity: null,
      });
    });

    it("deleting a user is never blocked and removes only that user's syncs", async () => {
      const doomedUserId = `test-${randomUUID()}`;
      await createUser(doomedUserId);
      const doomed = await ingest(`ext-${randomUUID()}`, {}, doomedUserId);
      const kept = await ingest(`ext-${randomUUID()}`);

      await dbModule.db.delete(schema.users).where(orm.eq(schema.users.id, doomedUserId));

      expect(await syncRow(doomed.id)).toBeUndefined();
      expect(await syncRow(kept.id)).toBeDefined();
    });

    it("existing deletes (kudos, follows, sessions) are unaffected", async () => {
      const synced = await ingest(`ext-${randomUUID()}`, { payload: validPayload });
      const { toggleKudo, toggleFollow } = await import("./data.js");

      // Toggling twice inserts then deletes the existing rows.
      await toggleKudo(otherUserId, synced.activityId!);
      await expect(toggleKudo(otherUserId, synced.activityId!)).resolves.toMatchObject({
        kudoed: false,
      });
      await toggleFollow(otherUserId, userId);
      await expect(toggleFollow(otherUserId, userId)).resolves.toMatchObject({
        following: false,
      });
      expect(await syncRow(synced.id)).toMatchObject({ status: "synced" });
    });
  });
});
