import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { activities, activityKudos, follows, notificationPreferences, users } from "./db/schema.js";
import {
  getNotificationPreferences,
  getNotificationSummary,
  setNotificationPreference,
} from "./data.js";
import { createApp } from "./app.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const createdUserIds: string[] = [];
const createdActivityIds: string[] = [];

async function makeUser(createdAt: Date) {
  const id = `test-notif-user-${randomUUID()}`;
  await db.insert(users).values({
    id,
    name: "Test Athlete",
    handle: `test-notif-${randomUUID()}`,
    avatarUrl: "https://example.com/avatar.png",
    city: "Toronto",
    country: "CA",
    bio: "",
    createdAt,
  });
  createdUserIds.push(id);
  return id;
}

async function makeActivity(athleteId: string) {
  const id = `test-notif-activity-${randomUUID()}`;
  await db.insert(activities).values({
    id,
    athleteId,
    sport: "Run",
    title: "Test run",
    date: new Date(),
    distanceKm: "5",
    movingSeconds: 1800,
    elevationM: 10,
    routeSeed: 1,
  });
  createdActivityIds.push(id);
  return id;
}

afterEach(async () => {
  for (const activityId of createdActivityIds.splice(0)) {
    await db.delete(activityKudos).where(eq(activityKudos.activityId, activityId));
    await db.delete(activities).where(eq(activities.id, activityId));
  }
  for (const userId of createdUserIds.splice(0)) {
    await db.delete(follows).where(eq(follows.followedId, userId));
    await db.delete(follows).where(eq(follows.followerId, userId));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
});

describe("getNotificationSummary", () => {
  it("flags a fresh user over the weekly volume threshold", async () => {
    const userId = await makeUser(new Date(Date.now() - 5 * DAY_MS));
    const activityId = await makeActivity(userId);
    const kudoGivers = await Promise.all(
      Array.from({ length: 26 }, () => makeUser(new Date(Date.now() - 20 * DAY_MS))),
    );

    for (const giverId of kudoGivers) {
      await db.insert(activityKudos).values({ userId: giverId, activityId });
    }

    const summary = await getNotificationSummary(userId);

    expect(summary.isInFirstTwoWeeks).toBe(true);
    expect(summary.kudosThisWeek).toBe(26);
    expect(summary.totalThisWeek).toBe(26);
    expect(summary.overThreshold).toBe(true);
    expect(summary.challengeRemindersThisWeek).toBe(0);
  });

  it("does not flag an old user even with high volume", async () => {
    const userId = await makeUser(new Date(Date.now() - 60 * DAY_MS));
    const giverId = await makeUser(new Date(Date.now() - 60 * DAY_MS));

    for (let i = 0; i < 30; i += 1) {
      const otherActivity = await makeActivity(userId);
      await db.insert(activityKudos).values({ userId: giverId, activityId: otherActivity });
    }

    const summary = await getNotificationSummary(userId);

    expect(summary.isInFirstTwoWeeks).toBe(false);
    expect(summary.overThreshold).toBe(false);
  });

  it("excludes kudos and follows older than the 7-day window", async () => {
    const userId = await makeUser(new Date(Date.now() - 3 * DAY_MS));
    const activityId = await makeActivity(userId);
    const giverId = await makeUser(new Date(Date.now() - 3 * DAY_MS));

    await db
      .insert(activityKudos)
      .values({ userId: giverId, activityId, createdAt: new Date(Date.now() - 10 * DAY_MS) });
    await db.insert(follows).values({
      followerId: giverId,
      followedId: userId,
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });

    const summary = await getNotificationSummary(userId);

    expect(summary.kudosThisWeek).toBe(0);
    expect(summary.followsThisWeek).toBe(0);
  });

  it("defaults every preference to instant when no rows exist", async () => {
    const userId = await makeUser(new Date());

    const preferences = await getNotificationPreferences(userId);

    expect(preferences).toEqual({
      kudos: "instant",
      follow: "instant",
      challenge_reminder: "instant",
    });
  });
});

describe("setNotificationPreference", () => {
  it("upserts a preference and round-trips through getNotificationPreferences", async () => {
    const userId = await makeUser(new Date());

    await setNotificationPreference(userId, "kudos", "digest");
    let preferences = await getNotificationPreferences(userId);
    expect(preferences.kudos).toBe("digest");

    await setNotificationPreference(userId, "kudos", "off");
    preferences = await getNotificationPreferences(userId);
    expect(preferences.kudos).toBe("off");
  });

  it("rejects an invalid notification type", async () => {
    const userId = await makeUser(new Date());
    await expect(setNotificationPreference(userId, "not-a-type", "instant")).rejects.toThrow(
      "Invalid notification type",
    );
  });

  it("rejects an invalid notification mode", async () => {
    const userId = await makeUser(new Date());
    await expect(setNotificationPreference(userId, "kudos", "not-a-mode")).rejects.toThrow(
      "Invalid notification mode",
    );
  });
});

describe("PATCH /api/notifications/preferences route", () => {
  let baseUrl: string;
  let server: ReturnType<typeof createServer>;
  let sessionCookie: string;
  let routeUserDbId: string;
  const routeUserId = `test-notif-route-${randomUUID()}`;

  beforeAll(async () => {
    server = createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${routeUserId}@example.com`,
        password: "testpass123",
        name: "Route Test",
      }),
    });
    const setCookie = registerResponse.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error("Register did not return a session cookie");
    }
    sessionCookie = setCookie.split(";")[0];

    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, `${routeUserId}@example.com`))
      .limit(1);
    routeUserDbId = userRows[0]!.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Cleaned up here, not via the shared `afterEach`/`createdUserIds` queue —
    // that queue drains after every `it`, which would delete this user (and
    // cascade its session) after the first test in this block, breaking the rest.
    await db.delete(users).where(eq(users.id, routeUserDbId));
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await fetch(`${baseUrl}/api/notifications/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "kudos", mode: "digest" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid type with 400", async () => {
    const response = await fetch(`${baseUrl}/api/notifications/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ type: "not-a-type", mode: "instant" }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects an invalid mode with 400", async () => {
    const response = await fetch(`${baseUrl}/api/notifications/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ type: "kudos", mode: "not-a-mode" }),
    });

    expect(response.status).toBe(400);
  });

  it("accepts a valid request and persists the preference", async () => {
    const response = await fetch(`${baseUrl}/api/notifications/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ type: "follow", mode: "off" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preferences.follow).toBe("off");
  });
});
