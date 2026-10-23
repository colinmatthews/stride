// Creates a fresh demo athlete with one activity per elevation-correction case, for
// local testing and demos. Needs the server running with TERRAIN_PROVIDER=open-meteo.
//   npx tsx scripts/elevation-demo.ts            (API at http://localhost:3002)
//   API_URL=http://localhost:3012 npx tsx scripts/elevation-demo.ts
// Uses real Boulder, CO coordinates: terrain is looked up from Open-Meteo, and the
// "recorded" elevation is built from it with the device fault each case needs.
import { randomBytes } from "node:crypto";
import {
  interpolateByDistance,
  rawElevationGain,
  terrainSampleIndices,
} from "../server/elevation.js";
import { OpenMeteoTerrainProvider } from "../server/terrain.js";

const API_URL = process.env.API_URL ?? "http://localhost:3002";

type Waypoint = [lat: number, lng: number];

const ROUTES: Record<string, Waypoint[]> = {
  flagstaff: [
    [39.999, -105.281],
    [40.004, -105.296],
    [40.002, -105.311],
    [39.996, -105.32],
    [39.99, -105.331],
  ],
  mesa: [
    [39.999, -105.281],
    [39.985, -105.283],
    [39.97, -105.279],
    [39.958, -105.275],
  ],
  sunshine: [
    [40.023, -105.295],
    [40.027, -105.307],
    [40.03, -105.32],
  ],
};

// ~10 m between points.
function track(waypoints: Waypoint[]) {
  const points: Waypoint[] = [];
  for (let w = 0; w < waypoints.length - 1; w += 1) {
    const [from, to] = [waypoints[w], waypoints[w + 1]];
    const steps = 130;
    for (let s = 0; s < steps; s += 1) {
      points.push([
        from[0] + ((to[0] - from[0]) * s) / steps,
        from[1] + ((to[1] - from[1]) * s) / steps,
      ]);
    }
  }
  points.push(waypoints[waypoints.length - 1]);
  return points;
}

function haversineKm([lat1, lng1]: Waypoint, [lat2, lng2]: Waypoint) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

// The free terrain API is flaky (rate limits, timeouts): retry with generous waits.
async function withRetries<T>(label: string, attempt: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (i >= tries) throw error;
      const wait = String(error).includes("429") ? 65 : 30;
      console.log(
        `${label} failed (${error instanceof Error ? error.message : error}); retrying in ${wait}s…`,
      );
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }
}

function rng(seed: number) {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

function gpx(name: string, creator: string, points: Waypoint[], elevation: number[]) {
  const start = Date.UTC(2026, 9, 12, 7, 0, 0);
  const trkpts = points
    .map(
      ([lat, lng], i) =>
        `<trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><ele>${elevation[i].toFixed(1)}</ele>` +
        `<time>${new Date(start + i * 6000).toISOString()}</time></trkpt>`,
    )
    .join("");
  return `<?xml version="1.0"?><gpx version="1.1" creator="${creator}"><trk><name>${name}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
}

async function main() {
  const terrainProvider = new OpenMeteoTerrainProvider();
  // Same sampling as the server (TERRAIN_MAX_SAMPLES=120), so an "accurate" recording
  // really matches what the server will look up. Spaced out for the free API's rate limit.
  let lookups = 0;
  const terrainFor = async (points: Waypoint[]) => {
    if (lookups++ > 0) await new Promise((resolve) => setTimeout(resolve, 20_000));
    const indices = terrainSampleIndices(points.length, 120);
    const lookup = () =>
      terrainProvider.elevations(indices.map((i) => ({ lat: points[i][0], lng: points[i][1] })));
    const values = await withRetries("Terrain lookup", lookup);
    const byIndex = points.map((_, i) => i);
    return interpolateByDistance(byIndex, indices, values);
  };

  const email = `elevation-demo-${Date.now().toString(36)}@test.local`;
  const password = randomBytes(9).toString("base64url");
  const register = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alex Carter", email, password }),
  });
  if (register.status !== 201) {
    throw new Error(
      `Registration failed (${register.status}). Is the server running at ${API_URL}?`,
    );
  }
  const cookie = register.headers.get("set-cookie")!.split(";")[0];

  const importGpx = async (sport: string, body: string) => {
    const response = await fetch(`${API_URL}/api/activities/import?sport=${sport}`, {
      method: "POST",
      headers: { "Content-Type": "application/gpx+xml", Cookie: cookie },
      body,
    });
    if (response.status !== 201) throw new Error(`Import failed: ${await response.text()}`);
    return (await response.json()) as { id: string; title: string };
  };

  // What a synced watch sends: the recording, GPS track and its own total ascent
  // (a raw sum of every rise, which is how spikes inflate it).
  const uploadRecording = async (
    title: string,
    device: Record<string, string>,
    points: Waypoint[],
    elevation: number[],
    withGps = true,
  ) => {
    const distanceKm = [0];
    for (let i = 1; i < points.length; i += 1) {
      distanceKm.push(distanceKm[i - 1] + haversineKm(points[i - 1], points[i]));
    }
    const response = await fetch(`${API_URL}/api/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        sport: "Run",
        title,
        distanceKm: Math.round(distanceKm[distanceKm.length - 1] * 100) / 100,
        movingSeconds: points.length * 6,
        elevationM: rawElevationGain(elevation),
        routeSeed: 1,
        device,
        elevationStream: {
          distanceKm: distanceKm.map((d) => Math.round(d * 1000) / 1000),
          elevationM: elevation.map((e) => Math.round(e * 10) / 10),
          ...(withGps
            ? { latitude: points.map((p) => p[0]), longitude: points.map((p) => p[1]) }
            : {}),
        },
      }),
    });
    if (response.status !== 201) throw new Error(`Upload failed: ${await response.text()}`);
    return (await response.json()) as { id: string; title: string };
  };

  const created: { label: string; id: string; title: string }[] = [];
  const garmin = {
    name: "Garmin Forerunner 965",
    manufacturer: "garmin",
    model: "forerunner_965",
    firmware: "18.16",
    elevationSource: "barometric",
  };

  // 1. Missing climbing: the altimeter freezes ~30% into the climb.
  const flagstaff = track(ROUTES.flagstaff);
  const flagstaffTerrain = await terrainFor(flagstaff);
  const freezeAt = Math.round(flagstaff.length * 0.3);
  const frozen = flagstaffTerrain.map((value, i) =>
    i < freezeAt ? value : flagstaffTerrain[freezeAt],
  );
  created.push({
    label: "Missing climbing (frozen altimeter)",
    ...(await uploadRecording("Flagstaff Mountain climb", garmin, flagstaff, frozen)),
  });

  // 2. Extra climbing: barometer jitter plus upward spikes.
  const mesa = track(ROUTES.mesa);
  const mesaTerrain = await terrainFor(mesa);
  const random = rng(7);
  const spiky = mesaTerrain.map(
    (value, i) => value + (random() - 0.5) * 0.6 + (i % 45 === 20 ? 22 + random() * 8 : 0),
  );
  const appleWatch = {
    name: "Apple Watch Series 9",
    manufacturer: "apple",
    model: "watch_series_9",
    firmware: "11.2",
    elevationSource: "barometric",
  };
  created.push({
    label: "Extra climbing (spikes)",
    ...(await uploadRecording("Mesa Trail tempo", appleWatch, mesa, spiky)),
  });

  // 3. Accurate: matches the terrain. Imported as a GPX file (Stride counts the climbing).
  const sunshine = track(ROUTES.sunshine);
  const sunshineTerrain = await terrainFor(sunshine);
  const clean = sunshineTerrain;
  created.push({
    label: "Looks accurate",
    ...(await importGpx("Ride", gpx("Sunshine Canyon spin", "Garmin Edge 840", sunshine, clean))),
  });

  // 4. Missing climbing on an old watch with no GPS track: can't be corrected.
  const polar = {
    name: "Polar M200",
    manufacturer: "polar",
    model: "m200",
    elevationSource: "barometric",
  };
  created.push({
    label: "Missing climbing, no GPS",
    ...(await uploadRecording("Lunch run (no GPS)", polar, flagstaff, frozen, false)),
  });

  // Preview each one now so the server caches its terrain lookup: the demo then
  // never waits on (or gets rate-limited by) the terrain provider.
  console.log("Pre-loading terrain for each activity (2–3 minutes, paced for the rate limit)…");
  const outcomes: string[] = [];
  for (const [index, activity] of created.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 20_000));
    const { response, preview } = await withRetries("Pre-loading", async () => {
      const response = await fetch(`${API_URL}/api/activities/${activity.id}/elevation/preview`, {
        method: "POST",
        headers: { Cookie: cookie },
      });
      const preview = await response.json();
      if (response.status === 503) throw new Error(preview.error);
      return { response, preview };
    });
    outcomes.push(
      response.ok
        ? preview.changed
          ? `${preview.elevationBeforeM} → ${preview.elevationAfterM} m (${preview.method})`
          : preview.blockedReason
            ? `no fix offered (${preview.blockedReason})`
            : `looks accurate (${preview.elevationBeforeM} vs ${preview.elevationAfterM} m)`
        : `preview failed: ${preview.error}`,
    );
  }

  const web = process.env.WEB_URL ?? API_URL.replace(/:\d+$/, ":5173");
  console.log(`\nDemo athlete created\n  Email:    ${email}\n  Password: ${password}\n`);
  for (const [index, activity] of created.entries()) {
    console.log(`  ${activity.label}: ${outcomes[index]}\n    ${web}/activity/${activity.id}`);
  }
  console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
