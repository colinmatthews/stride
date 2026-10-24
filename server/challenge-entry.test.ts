import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// server/db.ts throws at import time without DB_URL, so server modules are loaded inside the suite.
describe.skipIf(!process.env.DB_URL)("toggleChallengeEntry (database)", () => {
  type DbModule = typeof import("./db.js");
  type DataModule = typeof import("./data.js");
  type SchemaModule = typeof import("./db/schema.js");
  type ErrorsModule = typeof import("./errors.js");

  let dbModule: DbModule;
  let data: DataModule;
  let schema: SchemaModule;
  let errors: ErrorsModule;
  let eq: typeof import("drizzle-orm").eq;
  let and: typeof import("drizzle-orm").and;
  let inArray: typeof import("drizzle-orm").inArray;

  const suffix = randomUUID();
  const activeId = `test-active-${suffix}`;
  const endedId = `test-ended-${suffix}`;
  const startingParticipants = 10;
  let userId: string | undefined;

  async function participantsOf(challengeId: string) {
    const rows = await dbModule.db
      .select({ participants: schema.challenges.participants })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId));
    return rows[0]?.participants;
  }

  async function entriesFor(challengeId: string) {
    return dbModule.db
      .select()
      .from(schema.challengeEntries)
      .where(
        and(
          eq(schema.challengeEntries.userId, userId!),
          eq(schema.challengeEntries.challengeId, challengeId),
        ),
      );
  }

  beforeAll(async () => {
    [dbModule, data, schema, errors, { eq, and, inArray }] = await Promise.all([
      import("./db.js"),
      import("./data.js"),
      import("./db/schema.js"),
      import("./errors.js"),
      import("drizzle-orm"),
    ]);

    const user = await data.createUser({
      email: `test-${suffix}@example.com`,
      passwordHash: "test",
      passwordSalt: "test",
      name: "Challenge Test",
    });
    userId = user.id;

    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await dbModule.db.insert(schema.challenges).values([
      {
        id: activeId,
        name: "Test active challenge",
        sport: "Run",
        goalKm: "100",
        participants: startingParticipants,
        endsAt: future,
        badge: "T",
        metricType: "distance_km",
      },
      {
        id: endedId,
        name: "Test ended challenge",
        sport: "Run",
        goalKm: "100",
        participants: startingParticipants,
        endsAt: "2020-01-31",
        badge: "T",
        metricType: "distance_km",
      },
    ]);
  });

  afterAll(async () => {
    if (!dbModule) {
      return;
    }

    if (userId) {
      await dbModule.db.delete(schema.users).where(eq(schema.users.id, userId));
    }

    await dbModule.db
      .delete(schema.challenges)
      .where(inArray(schema.challenges.id, [activeId, endedId]));
    await dbModule.pool.end();
  });

  it("joins an active challenge and increments participants", async () => {
    const result = await data.toggleChallengeEntry(userId!, activeId);

    expect(result).toEqual({ joined: true, participants: startingParticipants + 1 });
    expect(await participantsOf(activeId)).toBe(startingParticipants + 1);
    expect(await entriesFor(activeId)).toHaveLength(1);
  });

  it("leaves and restores the participant count", async () => {
    const result = await data.toggleChallengeEntry(userId!, activeId);

    expect(result).toEqual({ joined: false, participants: startingParticipants });
    expect(await participantsOf(activeId)).toBe(startingParticipants);
    expect(await entriesFor(activeId)).toHaveLength(0);
  });

  it("keeps entries and participants consistent under concurrent toggles", async () => {
    const results = await Promise.all([
      data.toggleChallengeEntry(userId!, activeId),
      data.toggleChallengeEntry(userId!, activeId),
    ]);
    const entries = await entriesFor(activeId);

    // Whether the second request joins too or toggles back out depends on timing, but the
    // participant count must always match the number of entry rows.
    expect(entries.length).toBeLessThanOrEqual(1);
    expect(await participantsOf(activeId)).toBe(startingParticipants + entries.length);
    if (results.every((result) => result.joined)) {
      expect(entries).toHaveLength(1);
    }

    if (entries.length > 0) {
      await data.toggleChallengeEntry(userId!, activeId);
    }
    expect(await participantsOf(activeId)).toBe(startingParticipants);
  });

  it("does not double count a join that races with another join", async () => {
    const competing = await dbModule.pool.connect();

    try {
      await competing.query("BEGIN");
      await competing.query(
        "INSERT INTO challenge_entries (user_id, challenge_id) VALUES ($1, $2)",
        [userId, activeId],
      );
      await competing.query("UPDATE challenges SET participants = participants + 1 WHERE id = $1", [
        activeId,
      ]);

      const join = data.toggleChallengeEntry(userId!, activeId);

      // Wait until the join is blocked on the uncommitted competing entry before committing.
      for (let attempt = 0; ; attempt += 1) {
        const { rows } = await dbModule.pool.query(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE wait_event_type = 'Lock' AND query ILIKE '%insert into "challenge_entries"%'`,
        );
        if (rows[0].waiting > 0) break;
        if (attempt > 100) throw new Error("join never blocked on the competing entry");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      await competing.query("COMMIT");

      expect(await join).toEqual({ joined: true, participants: startingParticipants + 1 });
      expect(await entriesFor(activeId)).toHaveLength(1);
      expect(await participantsOf(activeId)).toBe(startingParticipants + 1);
    } finally {
      await competing.query("ROLLBACK").catch(() => undefined);
      competing.release();
    }

    const left = await data.toggleChallengeEntry(userId!, activeId);
    expect(left).toEqual({ joined: false, participants: startingParticipants });
  });

  it("throws a not-found error for unknown challenges", async () => {
    await expect(data.toggleChallengeEntry(userId!, `missing-${suffix}`)).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
  });

  it("refuses to join an ended challenge", async () => {
    await expect(data.toggleChallengeEntry(userId!, endedId)).rejects.toBeInstanceOf(
      errors.ConflictError,
    );
    expect(await entriesFor(endedId)).toHaveLength(0);
    expect(await participantsOf(endedId)).toBe(startingParticipants);
  });

  it("still allows leaving an ended challenge", async () => {
    await dbModule.db
      .insert(schema.challengeEntries)
      .values({ userId: userId!, challengeId: endedId });

    const result = await data.toggleChallengeEntry(userId!, endedId);

    expect(result).toEqual({ joined: false, participants: startingParticipants - 1 });
    expect(await entriesFor(endedId)).toHaveLength(0);
  });
});
