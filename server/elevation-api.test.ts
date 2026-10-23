// Integration tests for elevation correction and GPX import against a real Postgres.
// Runs only when TEST_DB_URL is set. It migrates and writes, so it refuses remote hosts
// unless TEST_DB_ALLOW_REMOTE=1 (for a database used only for testing, e.g. a Neon branch):
//   TEST_DB_URL=postgresql://user:pass@localhost:5433/stride npm test
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rawElevationGain, robustElevationGain } from "./elevation.js";
import type { TerrainProvider } from "./terrain.js";

vi.mock("./analytics.js", () => ({ captureServerEvent: vi.fn() }));

const TEST_DB_URL = process.env.TEST_DB_URL;

function assertLocalDatabase(url: string) {
  const host = new URL(url).hostname;
  if (process.env.TEST_DB_ALLOW_REMOTE === "1") return;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to run integration tests against non-local database host ${host}`);
  }
}

// A 4.4 km track heading north, one sample every ~11 m.
const SAMPLES = 400;
const START_LAT = 40.0;
const STEP_LAT = 0.0001;
const LNG = -105.3;
const distanceKm = Array.from({ length: SAMPLES }, (_, i) => Math.round(i * 11.12) / 1000);
const latitude = Array.from({ length: SAMPLES }, (_, i) => START_LAT + i * STEP_LAT);
const longitude = Array<number>(SAMPLES).fill(LNG);

// Terrain: a 200 m hill, climbing over the first half of the track.
function terrainAt(lat: number) {
  const t = Math.min(1, Math.max(0, (lat - START_LAT) / (STEP_LAT * (SAMPLES - 1))));
  return 1500 + 200 * (t < 0.5 ? t * 2 : (1 - t) * 2);
}
const terrain = latitude.map(terrainAt);
const FROZEN_FROM = 45; // ~0.5 km
const frozen = terrain.map((value, i) => (i >= FROZEN_FROM ? terrain[FROZEN_FROM] : value));
const SPIKES = [60, 150, 260, 330];
const spiky = terrain.map((value, i) => value + (SPIKES.includes(i) ? 28 : 0));

class FakeTerrain implements TerrainProvider {
  name = "fake-terrain";
  calls = 0;
  fail = false;

  async elevations(points: { lat: number; lng: number }[]) {
    this.calls += 1;
    if (this.fail) {
      const { TerrainUnavailableError } = await import("./terrain.js");
      throw new TerrainUnavailableError("fake outage");
    }
    return points.map((point) => terrainAt(point.lat));
  }
}

const DEVICE = {
  name: "Garmin Forerunner 965",
  manufacturer: "garmin",
  model: "forerunner_965",
  firmware: "18.16",
  elevationSource: "barometric",
};

function gpxTrack(creator: string) {
  const points = latitude
    .map(
      (lat, i) =>
        `<trkpt lat="${lat.toFixed(6)}" lon="${LNG}"><ele>${terrain[i].toFixed(1)}</ele>` +
        `<time>${new Date(Date.UTC(2026, 9, 1, 7, 0, i * 4)).toISOString()}</time></trkpt>`,
    )
    .join("");
  return `<?xml version="1.0"?><gpx version="1.1" creator="${creator}"><trk><name>Flagstaff climb</name><trkseg>${points}</trkseg></trk></gpx>`;
}

describe.skipIf(!TEST_DB_URL)("elevation correction API", () => {
  const runId = Date.now().toString(36);
  const ownerEmail = `elevation-owner-${runId}@test.local`;
  const otherEmail = `elevation-other-${runId}@test.local`;
  const fakeTerrain = new FakeTerrain();
  let server: Server;
  let baseUrl: string;
  let ownerCookie: string;
  let otherCookie: string;
  const ids: Record<string, string> = {};
  let captureServerEvent: ReturnType<typeof vi.fn>;
  let setTerrainProvider: (provider: TerrainProvider | null) => void;
  let cleanup: () => Promise<void>;

  async function api(path: string, init: RequestInit & { cookie?: string } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.cookie ? { Cookie: init.cookie } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = response.status === 204 ? null : await response.json();
    return { status: response.status, body };
  }

  async function register(email: string) {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Elevation Test", email, password: randomUUID() }),
    });
    expect(response.status).toBe(201);
    return response.headers.get("set-cookie")!.split(";")[0];
  }

  async function createActivity(body: Record<string, unknown>) {
    const { status, body: activity } = await api("/api/activities", {
      method: "POST",
      cookie: ownerCookie,
      body: JSON.stringify({
        title: "Test activity",
        distanceKm: 4.44,
        movingSeconds: 1500,
        routeSeed: 1,
        sport: "Run",
        ...body,
      }),
    });
    expect(status).toBe(201);
    return activity.id as string;
  }

  const withGps = (elevationM: number[]) => ({ distanceKm, elevationM, latitude, longitude });
  const withoutGps = (elevationM: number[]) => ({ distanceKm, elevationM });
  const preview = (id: string, cookie = ownerCookie) =>
    api(`/api/activities/${id}/elevation/preview`, { method: "POST", cookie });
  const save = (id: string, body: Record<string, unknown>, cookie = ownerCookie) =>
    api(`/api/activities/${id}/elevation/correction`, {
      method: "PUT",
      cookie,
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    assertLocalDatabase(TEST_DB_URL!);
    process.env.DB_URL = TEST_DB_URL;

    const { db, pool } = await import("./db.js");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "drizzle" });

    // Set before creating data, so a failed setup still removes what it created.
    cleanup = async () => {
      // Activities, streams and corrections cascade from the users.
      await pool.query("DELETE FROM users WHERE email = ANY($1)", [[ownerEmail, otherEmail]]);
      await pool.end();
    };

    ({ setTerrainProvider } = await import("./terrain.js"));
    setTerrainProvider(fakeTerrain);

    const { createApp } = await import("./app.js");
    captureServerEvent = (await import("./analytics.js")).captureServerEvent as ReturnType<
      typeof vi.fn
    >;
    server = createApp().listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    ownerCookie = await register(ownerEmail);
    otherCookie = await register(otherEmail);

    // Device-reported totals, as a watch would upload them.
    ids.frozen = await createActivity({
      device: DEVICE,
      elevationM: rawElevationGain(frozen),
      elevationStream: withGps(frozen),
    });
    ids.spiky = await createActivity({
      device: DEVICE,
      elevationM: rawElevationGain(spiky),
      elevationStream: withGps(spiky),
    });
    ids.accurate = await createActivity({ elevationM: 200, elevationStream: withGps(terrain) });
    ids.frozenNoGps = await createActivity({
      elevationM: rawElevationGain(frozen),
      elevationStream: withoutGps(frozen),
    });
    ids.spikyNoGps = await createActivity({
      elevationM: rawElevationGain(spiky),
      elevationStream: withoutGps(spiky),
    });
    ids.derived = await createActivity({ elevationStream: withGps(terrain) });
    ids.swim = await createActivity({ sport: "Swim", elevationStream: withGps(terrain) });
    ids.manual = await createActivity({ elevationM: 999 });
  });

  beforeEach(() => {
    setTerrainProvider?.(fakeTerrain);
    fakeTerrain.fail = false;
  });

  afterAll(async () => {
    setTerrainProvider?.(null);
    await new Promise((resolve) => server?.close(resolve));
    await cleanup?.();
  });

  describe("uploading a recorded activity", () => {
    it("keeps the device-reported elevation", async () => {
      const { body } = await api(`/api/activities/${ids.accurate}`, { cookie: ownerCookie });
      expect(body.elevationM).toBe(200);
    });

    it("derives elevation from the stream only when none is reported", async () => {
      const { body } = await api(`/api/activities/${ids.derived}`, { cookie: ownerCookie });
      expect(body.elevationM).toBe(robustElevationGain({ distanceKm, elevationM: terrain }));
    });

    it("needs no fix when it derived the elevation from a recording that matches the terrain", async () => {
      const { body } = await preview(ids.derived);
      expect(body).toMatchObject({ method: "terrain", changed: false, direction: "none" });
      expect(Math.abs(body.deltaPct)).toBeLessThanOrEqual(1);
    });

    it.each([
      ["a malformed stream", { elevationStream: { distanceKm: [0, 1], elevationM: [1] } }],
      [
        "coordinates that don't match the samples",
        { elevationStream: { ...withGps(terrain), latitude: latitude.slice(1) } },
      ],
      ["an unknown elevation source", { device: { name: "X", elevationSource: "radar" } }],
      ["an oversized device name", { device: { name: "x".repeat(101) } }],
    ])("rejects %s", async (_label, body) => {
      const { status } = await api("/api/activities", {
        method: "POST",
        cookie: ownerCookie,
        body: JSON.stringify({
          sport: "Run",
          title: "Bad",
          distanceKm: 1,
          movingSeconds: 1,
          ...body,
        }),
      });
      expect(status).toBe(400);
    });
  });

  describe("GPX import", () => {
    const importGpx = (query: string, body: string, cookie?: string) =>
      api(`/api/activities/import?${query}`, {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/gpx+xml" },
        body,
      });

    it("creates an activity with the GPS track, device and timing", async () => {
      const { status, body } = await importGpx(
        "sport=Ride",
        gpxTrack("Garmin Edge 840"),
        ownerCookie,
      );
      expect(status).toBe(201);
      expect(body).toMatchObject({ title: "Flagstaff climb", sport: "Ride", movingSeconds: 1596 });
      expect(body.distanceKm).toBeCloseTo(4.44, 1);

      const elevation = await api(`/api/activities/${body.id}/elevation`, { cookie: ownerCookie });
      expect(elevation.body).toMatchObject({
        hasGps: true,
        canCorrect: true,
        device: { name: "Garmin Edge 840" },
      });
    });

    it("requires a session", async () => {
      expect((await importGpx("sport=Run", gpxTrack("x"))).status).toBe(401);
    });

    it.each([
      ["an unknown sport", "sport=Kayak", gpxTrack("x")],
      ["a file that isn't GPX", "sport=Run", "<kml></kml>"],
      ["a GPX with no points", "sport=Run", '<gpx creator="x"><trk><trkseg></trkseg></trk></gpx>'],
    ])("rejects %s", async (_label, query, body) => {
      expect((await importGpx(query, body, ownerCookie)).status).toBe(400);
    });
  });

  describe("GET /api/activities/:id/elevation", () => {
    it("requires a session", async () => {
      expect((await api(`/api/activities/${ids.frozen}/elevation`)).status).toBe(401);
    });

    it("gives the owner the profile, device and a suspected stopped altimeter", async () => {
      const { status, body } = await api(`/api/activities/${ids.frozen}/elevation`, {
        cookie: ownerCookie,
      });
      expect(status).toBe(200);
      expect(body.samples).toHaveLength(SAMPLES);
      expect(body).toMatchObject({
        canCorrect: true,
        hasGps: true,
        correction: null,
        device: { name: DEVICE.name, model: DEVICE.model },
        issue: { errorType: "flatline" },
      });
      expect(body.issue.flatRegion.fromKm).toBeCloseTo(0.5, 1);
    });

    it("shows other athletes the profile without a fix or a prompt", async () => {
      const { body } = await api(`/api/activities/${ids.frozen}/elevation`, {
        cookie: otherCookie,
      });
      expect(body.samples.length).toBeGreaterThan(0);
      expect(body).toMatchObject({ canCorrect: false, issue: null });
    });

    it("returns no samples for a manual entry", async () => {
      const { body } = await api(`/api/activities/${ids.manual}/elevation`, {
        cookie: ownerCookie,
      });
      expect(body).toMatchObject({ samples: [], canCorrect: false, issue: null });
    });

    it("404s for an unknown activity", async () => {
      const response = await api("/api/activities/act-missing/elevation", { cookie: ownerCookie });
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/activities/:id/elevation/preview", () => {
    it("adds climbing a frozen altimeter missed, using terrain, and caches the lookup", async () => {
      const callsBefore = fakeTerrain.calls;
      const { status, body } = await preview(ids.frozen);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        method: "terrain",
        direction: "up",
        errorType: "flatline",
        changed: true,
        blockedReason: null,
        elevationBeforeM: rawElevationGain(frozen),
      });
      expect(body.elevationAfterM).toBeGreaterThanOrEqual(190);
      expect(body.flatRegion.fromKm).toBeCloseTo(0.5, 1);
      expect(fakeTerrain.calls).toBe(callsBefore + 1);

      await preview(ids.frozen);
      expect(fakeTerrain.calls).toBe(callsBefore + 1);

      const after = await api(`/api/activities/${ids.frozen}/elevation`, { cookie: ownerCookie });
      expect(after.body.correction).toBeNull();
    });

    it("removes climbing added by spikes, using terrain", async () => {
      const { body } = await preview(ids.spiky);
      expect(body).toMatchObject({
        method: "terrain",
        direction: "down",
        errorType: "spikes",
        spikeCount: 4,
      });
      expect(body.spikes).toHaveLength(4);
    });

    it("reports nothing to fix when the recording matches the terrain", async () => {
      const { body } = await preview(ids.accurate);
      expect(body).toMatchObject({ changed: false, direction: "none", errorType: "none" });
    });

    it("falls back to cleanup without a GPS track", async () => {
      const { body } = await preview(ids.spikyNoGps);
      expect(body).toMatchObject({ method: "cleanup", direction: "down", spikeCount: 4 });
    });

    it("explains it can't add missing climbing without a GPS track", async () => {
      const { body } = await preview(ids.frozenNoGps);
      expect(body).toMatchObject({
        method: "cleanup",
        changed: false,
        errorType: "flatline",
        blockedReason: "needs_gps",
      });
    });

    it("explains it can't add missing climbing while terrain lookups are off", async () => {
      setTerrainProvider(null);
      const id = await createActivity({
        elevationM: rawElevationGain(frozen),
        elevationStream: withGps(frozen),
      });
      const { body } = await preview(id);
      expect(body).toMatchObject({ changed: false, blockedReason: "terrain_off" });
    });

    it("returns 503 when the terrain service is down", async () => {
      fakeTerrain.fail = true;
      const id = await createActivity({ elevationStream: withGps(frozen) });
      const response = await preview(id);
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("terrain_unavailable");
    });

    it.each([
      ["another athlete's activity", "frozen", () => otherCookie, 403, "forbidden"],
      ["a swim", "swim", () => ownerCookie, 422, "unsupported_sport"],
      ["a manual entry", "manual", () => ownerCookie, 422, "no_stream"],
      ["an unknown activity", "missing", () => ownerCookie, 404, "not_found"],
    ])("refuses %s", async (_label, key, cookie, status, code) => {
      const response = await preview(ids[key] ?? "act-missing", cookie());
      expect(response.status).toBe(status);
      expect(response.body.code).toBe(code);
    });
  });

  describe("PUT /api/activities/:id/elevation/correction", () => {
    it.each([
      ["an unknown version", { keptVersion: "both" }],
      ["an unknown trigger", { keptVersion: "corrected", trigger: "email" }],
    ])("rejects %s", async (_label, body) => {
      expect((await save(ids.frozen, body)).status).toBe(400);
    });

    it("forbids correcting another athlete's activity", async () => {
      expect((await save(ids.frozen, { keptVersion: "corrected" }, otherCookie)).status).toBe(403);
    });

    it("keeps the terrain correction, raises the elevation and sends activity_corrected", async () => {
      const { body: plan } = await preview(ids.frozen);
      captureServerEvent.mockClear();

      const { status, body } = await save(ids.frozen, {
        keptVersion: "corrected",
        trigger: "prompted",
      });
      expect(status).toBe(200);
      expect(body).toEqual({ elevationM: plan.elevationAfterM, keptVersion: "corrected" });

      const activity = await api(`/api/activities/${ids.frozen}`, { cookie: ownerCookie });
      expect(activity.body.elevationM).toBe(plan.elevationAfterM);

      const elevation = await api(`/api/activities/${ids.frozen}/elevation`, {
        cookie: ownerCookie,
      });
      expect(elevation.body.correction).toMatchObject({
        keptVersion: "corrected",
        method: "terrain",
        direction: "up",
        originalElevationM: plan.elevationBeforeM,
      });
      expect(elevation.body.issue).toBeNull();
      // The chart now follows the terrain over the frozen stretch.
      expect(elevation.body.samples[200].elev).toBeGreaterThan(frozen[200] + 100);

      expect(captureServerEvent).toHaveBeenCalledTimes(1);
      expect(captureServerEvent).toHaveBeenCalledWith(ownerEmail, "activity_corrected", {
        activity_id: ids.frozen,
        sport: "Run",
        device: DEVICE.name,
        device_manufacturer: DEVICE.manufacturer,
        device_model: DEVICE.model,
        device_firmware: DEVICE.firmware,
        elevation_source: "barometric",
        elevation_before_m: plan.elevationBeforeM,
        elevation_after_m: plan.elevationAfterM,
        elevation_delta_pct: plan.deltaPct,
        kept_version: "corrected",
        method: "terrain",
        correction_direction: "up",
        error_type: "flatline",
        flatline_from_km: plan.flatRegion.fromKm,
        trigger: "prompted",
        spike_count: 0,
        sample_count: SAMPLES,
        moving_seconds: 1500,
        distance_km: 4.44,
      });
    });

    it("restores the device-reported value when switching back, however often it flips", async () => {
      const original = (
        await api(`/api/activities/${ids.frozen}/elevation`, { cookie: ownerCookie })
      ).body.correction.originalElevationM;

      for (const keptVersion of ["original", "corrected", "original"]) {
        await save(ids.frozen, { keptVersion });
      }

      const { body } = await api(`/api/activities/${ids.frozen}/elevation`, {
        cookie: ownerCookie,
      });
      expect(body.elevationM).toBe(original);
      expect(body.correction).toMatchObject({
        keptVersion: "original",
        originalElevationM: original,
      });
      expect(body.samples[200].elev).toBe(frozen[200]);
    });

    it("defaults the trigger to self", async () => {
      captureServerEvent.mockClear();
      await save(ids.spiky, { keptVersion: "corrected" });
      expect(captureServerEvent.mock.calls[0][2]).toMatchObject({
        trigger: "self",
        correction_direction: "down",
        error_type: "spikes",
      });
    });
  });
});
