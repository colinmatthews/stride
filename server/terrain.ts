// Terrain (digital elevation model) lookups along a GPS track.

export type LatLng = { lat: number; lng: number };

export interface TerrainProvider {
  /** Stored with cached results, e.g. "open-meteo". */
  name: string;
  /** Ground elevation in metres for each point, in order. Throws TerrainUnavailableError. */
  elevations(points: LatLng[]): Promise<number[]>;
}

export class TerrainUnavailableError extends Error {}

/**
 * Max points looked up per activity (then interpolated). Providers rate-limit per
 * coordinate; Open-Meteo's free tier allows only a few hundred per minute.
 */
export function terrainSampleLimit(environment: NodeJS.ProcessEnv = process.env) {
  const value = Number(environment.TERRAIN_MAX_SAMPLES);
  return Number.isFinite(value) && value > 0
    ? Math.min(2000, Math.max(20, Math.floor(value)))
    : 500;
}

const DEFAULT_OPEN_METEO_URL = "https://api.open-meteo.com/v1/elevation";
const MAX_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 5000;

function round5(n: number): string {
  return String(Math.round(n * 1e5) / 1e5);
}

function assertValidPoints(points: LatLng[]): void {
  for (const p of points) {
    if (
      !p ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      Math.abs(p.lat) > 90 ||
      Math.abs(p.lng) > 180
    ) {
      throw new TerrainUnavailableError("Invalid coordinate for terrain lookup");
    }
  }
}

/** Free Open-Meteo Elevation API (sends coordinates to a third party). */
export class OpenMeteoTerrainProvider implements TerrainProvider {
  readonly name = "open-meteo";

  async elevations(points: LatLng[]): Promise<number[]> {
    if (points.length === 0) return [];
    assertValidPoints(points);

    // Sequential on purpose: be polite to the free API.
    const result: number[] = [];
    for (let i = 0; i < points.length; i += MAX_BATCH_SIZE) {
      result.push(...(await this.fetchBatch(points.slice(i, i + MAX_BATCH_SIZE))));
    }
    return result;
  }

  private async fetchBatch(batch: LatLng[]): Promise<number[]> {
    try {
      return await this.requestBatch(batch);
    } catch (err) {
      if (err instanceof NonRetryableError) throw err.inner;
      return this.requestBatch(batch).catch((retryErr: unknown) => {
        throw retryErr instanceof NonRetryableError ? retryErr.inner : retryErr;
      });
    }
  }

  private async requestBatch(batch: LatLng[]): Promise<number[]> {
    const base = process.env.OPEN_METEO_ELEVATION_URL || DEFAULT_OPEN_METEO_URL;
    const lat = batch.map((p) => round5(p.lat)).join(",");
    const lng = batch.map((p) => round5(p.lng)).join(",");
    const url = `${base}?latitude=${lat}&longitude=${lng}`;

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new TerrainUnavailableError(`Open-Meteo elevation request failed: ${reason}`);
    }

    if (!res.ok) {
      const error = new TerrainUnavailableError(
        `Open-Meteo elevation request failed with HTTP ${res.status}`,
      );
      // Client errors won't succeed on retry.
      if (res.status >= 400 && res.status < 500) throw new NonRetryableError(error);
      throw error;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new NonRetryableError(
        new TerrainUnavailableError("Open-Meteo elevation response was not valid JSON"),
      );
    }

    const elevation = (body as { elevation?: unknown } | null)?.elevation;
    if (!Array.isArray(elevation) || elevation.length !== batch.length) {
      throw new NonRetryableError(
        new TerrainUnavailableError(
          `Open-Meteo elevation response malformed: expected ${batch.length} values`,
        ),
      );
    }
    if (!elevation.every((v) => typeof v === "number" && Number.isFinite(v))) {
      throw new NonRetryableError(
        new TerrainUnavailableError("Open-Meteo elevation response contained non-numeric values"),
      );
    }
    return elevation as number[];
  }
}

// Internal marker: wraps an error that must not be retried.
class NonRetryableError extends Error {
  constructor(readonly inner: TerrainUnavailableError) {
    super(inner.message);
  }
}

let provider: TerrainProvider | null = null;
let resolved = false;

/** The configured provider, or null when terrain lookups are disabled (the default). */
export function getTerrainProvider(): TerrainProvider | null {
  if (resolved) return provider;
  resolved = true;
  const choice = (process.env.TERRAIN_PROVIDER ?? "").trim().toLowerCase();
  if (choice === "" || choice === "none") {
    provider = null;
  } else if (choice === "open-meteo") {
    provider = new OpenMeteoTerrainProvider();
  } else {
    console.warn(`Unknown TERRAIN_PROVIDER "${choice}"; terrain lookups are disabled.`);
    provider = null;
  }
  return provider;
}

/** Tests only: replace the provider (null disables terrain lookups). */
export function setTerrainProvider(next: TerrainProvider | null): void {
  provider = next;
  resolved = true;
}

/** Tests only: forget the singleton so the env is re-read on next get. */
export function resetTerrainProviderForTests(): void {
  provider = null;
  resolved = false;
}
