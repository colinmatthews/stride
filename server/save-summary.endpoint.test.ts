import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(!process.env.DB_URL)("GET /api/activities/:id/summary", () => {
  const runId = randomUUID().slice(0, 8);
  const emails = [`summary-owner-${runId}@test.local`, `summary-other-${runId}@test.local`];
  const activityIds = { yesterday: `act-test-${runId}-1`, today: `act-test-${runId}-2` };
  const challengeIds = { active: `ch-test-${runId}-active`, ended: `ch-test-${runId}-ended` };
  let server: Server;
  let baseUrl: string;
  let ownerCookie: string;
  let otherCookie: string;
  let cleanup: () => Promise<void>;

  async function register(email: string) {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Summary Tester", email, password: "password123" }),
    });
    expect(response.status).toBe(201);
    return (response.headers.get("set-cookie") ?? "").split(";")[0];
  }

  beforeAll(async () => {
    const { createApp } = await import("./app.js");
    const { db, pool } = await import("./db.js");
    const { activities, challengeEntries, challenges, users } = await import("./db/schema.js");
    const { eq, inArray } = await import("drizzle-orm");

    cleanup = async () => {
      await db.delete(users).where(inArray(users.email, emails));
      await db.delete(challenges).where(inArray(challenges.id, Object.values(challengeIds)));
      await pool.end();
    };

    server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    ownerCookie = await register(emails[0]);
    otherCookie = await register(emails[1]);

    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.email, emails[0]));
    const base = {
      athleteId: owner.id,
      sport: "Run",
      title: "Test run",
      distanceKm: "5.00",
      movingSeconds: 1500,
      elevationM: 20,
      routeSeed: 1,
    };
    await db.insert(activities).values([
      { ...base, id: activityIds.yesterday, date: new Date("2026-10-16T12:00:00Z") },
      { ...base, id: activityIds.today, date: new Date("2026-10-17T12:00:00Z"), distanceKm: "8" },
    ]);

    const challenge = {
      sport: "Run",
      goalKm: "10",
      participants: 1,
      badge: "RUN",
      metricType: "distance_km",
    };
    await db.insert(challenges).values([
      { ...challenge, id: challengeIds.active, name: "Test 10K", endsAt: "2026-10-31" },
      { ...challenge, id: challengeIds.ended, name: "Ended 10K", endsAt: "2026-10-16" },
    ]);
    await db.insert(challengeEntries).values(
      Object.values(challengeIds).map((challengeId) => ({
        userId: owner.id,
        challengeId,
        createdAt: new Date("2026-10-01T00:00:00Z"),
      })),
    );
  });

  afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await cleanup?.();
  });

  function getSummary(activityId: string, cookie?: string) {
    return fetch(`${baseUrl}/api/activities/${activityId}/summary?tz=UTC`, {
      headers: cookie ? { cookie } : {},
    });
  }

  it("returns the recap for the owner", async () => {
    const response = await getSummary(activityIds.today, ownerCookie);
    expect(response.status).toBe(200);

    const summary = await response.json();
    expect(summary.activity.id).toBe(activityIds.today);
    expect(summary.athleteFirstName).toBe("Summary");
    expect(summary.ordinal).toBe(2);
    expect(summary.sportOrdinal).toBe(2);
    expect(summary.streakDays).toBe(2);
    expect(summary.weeks).toHaveLength(6);
    expect(summary.thisWeek).toEqual({ count: 2, minutes: 50 });
    expect(summary.averages).toEqual({ distanceKm: 5, paceValue: 300, elevationM: 20 });
    expect(summary.highlights.map((h: { id: string }) => h.id)).toEqual([
      "longest",
      "fastest",
      "busier",
    ]);
    expect(summary.challenges).toEqual([
      { id: challengeIds.active, name: "Test 10K", unit: "km", before: 5, after: 10, goal: 10 },
    ]);
  });

  it("is stable for earlier activities", async () => {
    const summary = await (await getSummary(activityIds.yesterday, ownerCookie)).json();

    expect(summary.ordinal).toBe(1);
    expect(summary.streakDays).toBe(1);
    expect(summary.highlights.map((h: { id: string }) => h.id)).toEqual(["first", "busier"]);
    expect(summary.challenges.map((c: { id: string }) => c.id)).toEqual([
      challengeIds.ended,
      challengeIds.active,
    ]);
  });

  it("hides other athletes' activities", async () => {
    const response = await getSummary(activityIds.today, otherCookie);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Activity not found" });
  });

  it("returns 404 for unknown activities", async () => {
    expect((await getSummary("act-does-not-exist", ownerCookie)).status).toBe(404);
  });

  it("requires a session", async () => {
    expect((await getSummary(activityIds.today)).status).toBe(401);
  });
});
