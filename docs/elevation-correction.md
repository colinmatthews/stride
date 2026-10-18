# Elevation correction ("Fix my elevation")

## Why

Power users' top complaint is wrong elevation (25% of their support tickets), mostly
**missing** climbing: "an 840 m climb recorded as 120 m", usually a barometric altimeter
that stopped updating. Some recordings have the opposite problem: spikes that add
climbing that didn't happen.

## What it does

On their own activity, an athlete taps **Fix my elevation** (or **Review fix** on a
proactive prompt). Stride compares the recording with a correction, shows both profiles
stacked with an explanation, and the athlete keeps either version. They can switch back
at any time.

Two correction methods, chosen per activity:

| Method | When | Can fix |
|---|---|---|
| **Terrain** | The recording has a GPS track and `TERRAIN_PROVIDER` is set | Missing climbing (frozen altimeter) and extra climbing (spikes) |
| **Cleanup** | No GPS track, or terrain lookups are off | Extra climbing only (spikes, sensor noise) |

When the recording shows a frozen altimeter but terrain isn't available, no correction
is offered and the athlete is told why ("needs a GPS track" / "terrain correction isn't
available right now"). Cleanup would otherwise lower an already-too-low number.

Corrected activities show a "Terrain-corrected" (or "Corrected") tag to everyone.

## How it works

- **Ingestion.** `POST /api/activities` accepts an optional `device` and
  `elevationStream` (`distanceKm`, `elevationM`, optional `latitude`/`longitude`).
  `POST /api/activities/import?sport=Run` takes a GPX file as the body
  (`application/gpx+xml`, max 15 MB) and stores the track, timing and the GPX `creator`
  as the device name. The device-reported total ascent is kept as the activity's
  elevation. Without one (e.g. GPX), Stride counts the stream the same way it counts
  corrections (±50 m smoothing, 3 m threshold), so a clean recording compares as equal.
- **Detection** (`server/elevation.ts`). A frozen altimeter is a stretch of at least 3 km
  and 15% of the activity where the recorded altitude stays within 1 m. Terrain decides
  whether that stretch was really flat. Spikes are found with a Hampel filter.
- **Terrain** (`server/terrain.ts`). Looked up at up to `TERRAIN_MAX_SAMPLES` (default
  500) evenly spaced points,
  interpolated by distance to every sample, and cached on the stream
  (`terrain_elevation_m`), so preview and save hit the provider once. The lookup happens
  before the save transaction takes its row lock. Provider failures return 503
  `terrain_unavailable`.
- **Thresholds.** Terrain corrections are offered at a difference of 5% or more (terrain
  models disagree with a good barometer by a few percent); cleanup at 2%.

### API

| Route | Who | Notes |
|---|---|---|
| `GET /api/activities/:id/elevation` | Any signed-in user | Chart samples (corrected if kept), device, `hasGps`, `correction`. The owner also gets `canCorrect` and `issue` (suspected problem, for the prompt) |
| `POST /api/activities/:id/elevation/preview` | Owner | Computes the correction without saving. 403 / 404 / 422 (`unsupported_sport`, `no_stream`) / 503 |
| `PUT /api/activities/:id/elevation/correction` | Owner | `{ keptVersion: "corrected" \| "original", trigger?: "self" \| "prompted" }`. Idempotent; "original" always restores the device-reported value |

### Data (`drizzle/0002_elevation_correction.sql`)

- `activities`: device name, manufacturer, model, firmware, elevation source.
- `activity_streams`: recorded distance/elevation, optional GPS track, terrain cache.
- `activity_elevation_corrections`: original and corrected elevation, method, error
  type, direction, kept version.

### Analytics

- `activity_corrected` (server-side, distinct id = user email, as the web client
  identifies): device fields, `elevation_before_m`, `elevation_after_m`,
  `elevation_delta_pct`, `kept_version`, `method`, `correction_direction`, `error_type`,
  `flatline_from_km`, `trigger`, `spike_count`, `sample_count`, `moving_seconds`,
  `distance_km`.
- `elevation_fix_opened` and `elevation_prompt_dismissed` (client): device,
  `has_gps`, `suspected_error`, `trigger`.
- Feature flag `elevation-fix-prompt`: shows the proactive prompt. Off = button only.

## Configuration

- `TERRAIN_PROVIDER=open-meteo` turns terrain lookups on. **Off by default** because it
  sends users' GPS coordinates to a third party. Open-Meteo's free API is for
  non-commercial use; production needs their commercial plan or a self-hosted instance
  (`OPEN_METEO_ELEVATION_URL`).
- `TERRAIN_MAX_SAMPLES` caps points per lookup (default 500). Open-Meteo's free tier
  rate-limits per coordinate: in testing, a second ~400-point lookup within a minute got
  HTTP 429, and the API also returned a 503 and timeouts. Users then see "Terrain data is
  temporarily unavailable". Use 120 locally.
- Create the `elevation-fix-prompt` flag in PostHog to run the prompt experiment.

## Before enabling for users

- [ ] Privacy review: storing GPS tracks and sending coordinates to a terrain provider.
- [ ] Terrain provider decision (commercial Open-Meteo plan, self-hosted, or another).
      The free tier's rate limits and outages are not production-grade; consider retrying
      429s with backoff or a job queue.
- [ ] Compare device-reported totals with Stride's counting on real files: devices count
      ascent differently, so the 5% threshold may flag accurate devices.
- [ ] Calibrate thresholds (flatline 1 m / 3 km / 15%, terrain 5%, Hampel 8 m) on real
      recordings per device type.
- [ ] Decide challenge and leaderboard rules: a correction that raises elevation raises
      elevation-challenge progress.
- [ ] Engineering review of GPX parsing (untrusted input) and the migration.
- [x] Run migration `0002` on this branch's Neon test database (2026-10-18; all 123 tests
      pass against it).
- [ ] Run migration `0002` on the production database.

## Not in this branch

- Upload UI for GPX (API only) and FIT files, and direct device sync (Garmin, Wahoo,
  Apple need partner programs or a native app).
- Mapping FIT manufacturer/product ids to readable device names.
- Barometric drift correction without a GPS track.
- Pre-existing issues noticed: `src/utils/posthog-server.ts` reads `import.meta.env` and
  would fail under Node (unused); the activity page keeps stale kudos/comment state when
  navigating between activities.

## Testing locally

```bash
docker start stride-postgres   # local Postgres on 5433
TEST_DB_URL=postgresql://<user>:<password>@localhost:5433/stride npx vitest run
```

Without `TEST_DB_URL` the 34 API integration tests are skipped. They use a fake terrain
provider, so they never call the network, and delete the athletes they create. They
refuse non-local database hosts unless `TEST_DB_ALLOW_REMOTE=1`, for a database used
only for testing (such as this branch's Neon database). A remote database is slower,
so raise the timeouts:

```bash
TEST_DB_URL=<neon url> TEST_DB_ALLOW_REMOTE=1 npx vitest run --hookTimeout=60000 --testTimeout=60000
```

To try it by hand, run the server against the local database with
`TERRAIN_PROVIDER=open-meteo TERRAIN_MAX_SAMPLES=120`, then create a demo athlete with
one activity per case (it pre-loads terrain, so the demo doesn't depend on the API):

```bash
API_URL=http://localhost:3002 npm run demo:elevation
```

Or import your own GPX:

```bash
curl -X POST "http://localhost:3002/api/activities/import?sport=Run" \
  -H "Content-Type: application/gpx+xml" -H "Cookie: stride_session=<session>" \
  --data-binary @ride.gpx
```
