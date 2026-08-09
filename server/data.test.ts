import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// Real data-layer integration test — no mocks. Hits the actual Postgres
// database configured via DB_URL, using a throwaway user created and torn
// down within the test so it never pollutes seeded/demo data. Deleting the
// user cascades to delete their activities (activities.athlete_id has
// onDelete: "cascade" in server/db/schema.ts).
//
// server/db.ts throws at import time if DB_URL is unset (correct for the
// real running server — fail fast on missing config). CI does not provision
// a database or set DB_URL, so every import in this file is deferred until
// inside a test body, and the whole suite is skipped up front when DB_URL
// isn't present — importing db.ts is what would crash, not just running it.
const hasDb = Boolean(process.env.DB_URL);

describe.skipIf(!hasDb)("createActivity (real database)", () => {
  afterAll(async () => {
    const { pool } = await import("./db.js");
    await pool.end();
  });

  it("round-trips a cross-training entry with no GPS fields", async () => {
    const { db } = await import("./db.js");
    const { users } = await import("./db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { createActivity, createUser, getActivityById } = await import("./data.js");

    const { id: userId } = await createUser({
      email: `test-cross-training-${randomUUID()}@example.test`,
      passwordHash: "unused",
      passwordSalt: "unused",
      name: "Cross Training Test User",
    });

    try {
      const activityId = await createActivity({
        userId,
        sport: "Yoga",
        title: "Recovery flow",
        description: "Slow vinyasa, hips and hamstrings.",
        distanceKm: 0,
        movingSeconds: 1500,
        elevationM: 0,
        routeSeed: 1,
      });

      const activity = await getActivityById(userId, activityId);

      expect(activity).not.toBeNull();
      expect(activity?.sport).toBe("Yoga");
      expect(activity?.title).toBe("Recovery flow");
      expect(activity?.distanceKm).toBe(0);
      expect(activity?.movingSeconds).toBe(1500);
      expect(activity?.elevationM).toBe(0);
      expect(activity?.avgPaceSecPerKm).toBeUndefined();
      expect(activity?.avgSpeedKmh).toBeUndefined();
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("round-trips a GPS entry alongside a cross-training one for the same user", async () => {
    const { db } = await import("./db.js");
    const { users } = await import("./db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { createActivity, createUser, getActivityById } = await import("./data.js");

    const { id: userId } = await createUser({
      email: `test-gps-${randomUUID()}@example.test`,
      passwordHash: "unused",
      passwordSalt: "unused",
      name: "GPS Test User",
    });

    try {
      const runId = await createActivity({
        userId,
        sport: "Run",
        title: "Tempo run",
        distanceKm: 8.4,
        movingSeconds: 2100,
        elevationM: 60,
        avgPaceSecPerKm: 250,
        routeSeed: 2,
      });
      const strengthId = await createActivity({
        userId,
        sport: "Strength",
        title: "Leg day",
        distanceKm: 0,
        movingSeconds: 2700,
        elevationM: 0,
        routeSeed: 3,
      });

      const run = await getActivityById(userId, runId);
      const strength = await getActivityById(userId, strengthId);

      expect(run?.distanceKm).toBe(8.4);
      expect(strength?.distanceKm).toBe(0);
      expect(strength?.sport).toBe("Strength");
    } finally {
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});

if (!hasDb) {
  // vitest requires at least one test per file when a describe block exists;
  // skipIf already skips the suite above, but make the "why" visible in output
  // rather than a silent zero-test file.
  it.skip("skipped: DB_URL not set, real-database tests require it", () => {});
}
