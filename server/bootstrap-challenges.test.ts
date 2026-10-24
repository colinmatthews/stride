import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// server/db.ts throws at import time without DB_URL, so server modules are loaded inside the suite.
describe.skipIf(!process.env.DB_URL)("buildBootstrap challenges (database)", () => {
  type DbModule = typeof import("./db.js");
  type DataModule = typeof import("./data.js");
  type SchemaModule = typeof import("./db/schema.js");

  let dbModule: DbModule;
  let data: DataModule;
  let schema: SchemaModule;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;

  const suffix = randomUUID();
  const distanceId = `test-distance-${suffix}`;
  const elevationId = `test-elevation-${suffix}`;
  const endedId = `test-ended-${suffix}`;
  const unjoinedId = `test-unjoined-${suffix}`;
  const day = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number) => new Date(Date.now() - days * day);
  let userId: string | undefined;

  type BootstrapChallenge = Awaited<ReturnType<DataModule["buildBootstrap"]>>["challenges"][number];
  let challenges: Map<string, BootstrapChallenge>;

  beforeAll(async () => {
    [dbModule, data, schema, { eq, inArray }] = await Promise.all([
      import("./db.js"),
      import("./data.js"),
      import("./db/schema.js"),
      import("drizzle-orm"),
    ]);

    const user = await data.createUser({
      email: `test-${suffix}@example.com`,
      passwordHash: "test",
      passwordSalt: "test",
      name: "Bootstrap Test",
    });
    userId = user.id;

    const future = new Date(Date.now() + 30 * day).toISOString().slice(0, 10);
    const challenge = { participants: 1, badge: "T", goalKm: "100" };
    await dbModule.db.insert(schema.challenges).values([
      {
        ...challenge,
        id: distanceId,
        name: "Run distance",
        sport: "Run",
        endsAt: future,
        metricType: "distance_km",
      },
      {
        ...challenge,
        id: elevationId,
        name: "Any-sport climbing",
        sport: "Multisport",
        goalKm: "1000",
        endsAt: future,
        metricType: "elevation_m",
      },
      {
        ...challenge,
        id: endedId,
        name: "Ended run",
        sport: "Run",
        endsAt: "2020-01-31",
        metricType: "distance_km",
      },
      {
        ...challenge,
        id: unjoinedId,
        name: "Not joined",
        sport: "Run",
        endsAt: future,
        metricType: "distance_km",
      },
    ]);

    const joinedAt = daysAgo(3);
    await dbModule.db.insert(schema.challengeEntries).values(
      [distanceId, elevationId, endedId].map((challengeId) => ({
        userId: userId!,
        challengeId,
        createdAt: joinedAt,
      })),
    );

    const activity = {
      athleteId: userId,
      title: "Test",
      movingSeconds: 1800,
      routeSeed: 1,
    };
    await dbModule.db.insert(schema.activities).values([
      // Before joining: counts toward nothing.
      {
        ...activity,
        id: `a1-${suffix}`,
        sport: "Run",
        date: daysAgo(5),
        distanceKm: "10",
        elevationM: 400,
      },
      {
        ...activity,
        id: `a2-${suffix}`,
        sport: "Run",
        date: daysAgo(1),
        distanceKm: "5.5",
        elevationM: 50,
      },
      // Wrong sport for the run challenge, but any sport counts toward Multisport.
      {
        ...activity,
        id: `a3-${suffix}`,
        sport: "Ride",
        date: daysAgo(1),
        distanceKm: "20",
        elevationM: 300,
      },
    ]);

    const bootstrap = await data.buildBootstrap(userId);
    challenges = new Map(bootstrap.challenges.map((c) => [c.id, c]));
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
      .where(inArray(schema.challenges.id, [distanceId, elevationId, endedId, unjoinedId]));
    await dbModule.pool.end();
  });

  it("counts only matching-sport distance logged after joining", () => {
    expect(challenges.get(distanceId)).toMatchObject({
      joined: true,
      ended: false,
      metricType: "distance_km",
      myProgressKm: 5.5,
    });
  });

  it("sums elevation from every sport for a Multisport climbing challenge", () => {
    expect(challenges.get(elevationId)).toMatchObject({
      joined: true,
      metricType: "elevation_m",
      myProgressKm: 350,
    });
  });

  it("marks past challenges as ended and ignores activity after the end date", () => {
    expect(challenges.get(endedId)).toMatchObject({ joined: true, ended: true, myProgressKm: 0 });
  });

  it("reports zero progress for challenges the user has not joined", () => {
    expect(challenges.get(unjoinedId)).toMatchObject({ joined: false, myProgressKm: 0 });
  });
});
