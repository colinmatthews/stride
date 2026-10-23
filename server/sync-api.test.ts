import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// HTTP-level tests for the sync endpoints against a real, migrated Postgres.
// Opt-in via TEST_DB_URL so the suite never touches the database in .env.
const testDbUrl = process.env.TEST_DB_URL;

describe.skipIf(!testDbUrl)("sync API", () => {
  let server: Server;
  let baseUrl: string;
  let pool: { end(): Promise<void> };
  const emails: string[] = [];

  async function signUp() {
    const email = `sync-api-${randomUUID()}@stride.test`;
    emails.push(email);
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sync API", email, password: randomUUID() }),
    });
    expect(response.status).toBe(201);
    return response.headers.get("set-cookie")!.split(";")[0];
  }

  function call(cookie: string | null, path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: body === undefined && path === "/api/bootstrap" ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  const report = (externalId: string, extra: Record<string, unknown> = {}) => ({
    provider: "garmin",
    deviceName: "Garmin Forerunner 265",
    externalId,
    sport: "Run",
    title: "Morning tempo",
    startedAt: "2026-10-12T06:30:00.000Z",
    ...extra,
  });

  beforeAll(async () => {
    process.env.DB_URL = testDbUrl;
    const { createApp } = await import("./app.js");
    ({ pool } = await import("./db.js"));
    server = createApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    const { db } = await import("./db.js");
    const { users } = await import("./db/schema.js");
    const { inArray } = await import("drizzle-orm");
    if (emails.length > 0) await db.delete(users).where(inArray(users.email, emails));
    await pool.end();
  });

  it("requires a signed-in athlete", async () => {
    expect((await call(null, "/api/syncs", report("x"))).status).toBe(401);
    expect((await call(null, "/api/syncs/sync-x/retry", {})).status).toBe(401);
  });

  it("rejects an incomplete device report", async () => {
    const cookie = await signUp();
    const response = await call(cookie, "/api/syncs", { ...report("x"), sport: "Rowing" });
    expect(response.status).toBe(400);
  });

  it("records a failure, tells the team, and walks retries to stuck", async () => {
    const cookie = await signUp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const created = await call(cookie, "/api/syncs", report(`ext-${randomUUID()}`));
    expect(created.status).toBe(201);
    const { sync } = await created.json();
    expect(sync).toMatchObject({ status: "failed", errorCode: "upload_interrupted" });

    const logged = warn.mock.calls.map((args) => JSON.parse(String(args[0])));
    expect(logged).toContainEqual(
      expect.objectContaining({ event: "workout_sync_failed", sync_ref: sync.ref }),
    );
    warn.mockRestore();

    const bootstrap = await (await call(cookie, "/api/bootstrap")).json();
    expect(bootstrap.workoutSyncs).toContainEqual(expect.objectContaining({ id: sync.id }));

    const first = await call(cookie, `/api/syncs/${sync.id}/retry`, {});
    expect(first.status).toBe(200);
    expect((await first.json()).sync).toMatchObject({ status: "failed", attempts: 1 });

    const second = await call(cookie, `/api/syncs/${sync.id}/retry`, {});
    expect((await second.json()).sync).toMatchObject({ status: "stuck", attempts: 2 });

    const third = await call(cookie, `/api/syncs/${sync.id}/retry`, {});
    expect(third.status).toBe(409);
    expect((await third.json()).sync).toMatchObject({ status: "stuck" });
  });

  it("hides one athlete's sync from another", async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const { sync } = await (await call(owner, "/api/syncs", report(`ext-${randomUUID()}`))).json();

    expect((await call(stranger, `/api/syncs/${sync.id}/retry`, {})).status).toBe(404);
    expect((await call(owner, "/api/syncs/sync-does-not-exist/retry", {})).status).toBe(404);
  });

  it("returns the activity once a workout is in the feed", async () => {
    const cookie = await signUp();
    const payload = { distanceKm: 8.2, movingSeconds: 2460, elevationM: 40 };
    const { sync } = await (
      await call(cookie, "/api/syncs", report(`ext-${randomUUID()}`, { payload }))
    ).json();
    expect(sync.status).toBe("synced");

    const retry = await (await call(cookie, `/api/syncs/${sync.id}/retry`, {})).json();
    expect(retry.activity).toMatchObject({ id: sync.activityId, athleteId: "me", distanceKm: 8.2 });
  });
});
