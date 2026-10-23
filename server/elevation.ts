// Elevation correction for recorded activity streams. Two methods:
//
// Terrain (preferred, needs a GPS track): the altitude at every sample comes from a
// terrain model along the track, so it can add climbing a device missed (a frozen
// altimeter) or remove climbing it invented (spikes).
//
// Cleanup (fallback without GPS): works on the recorded stream itself, so it can only
// remove climbing:
//   1. Spikes: single-sample jumps far from their neighbours (Hampel filter) are
//      replaced with the local median.
//   2. Noise: a moving average over a short stretch of route (not a fixed number of
//      samples, so sparse recordings keep their real hills) removes sensor jitter.
//   3. Gain: climbing is counted with a small hysteresis threshold, so jitter
//      that survives smoothing does not add up to phantom metres.

export type ElevationStream = {
  distanceKm: number[];
  elevationM: number[];
};

export type ElevationCorrection = {
  correctedElevationM: number[];
  spikeIndices: number[];
  originalGainM: number;
  correctedGainM: number;
  deltaPct: number;
  changed: boolean;
};

export const MIN_STREAM_SAMPLES = 10;
export const MAX_STREAM_SAMPLES = 20_000;

const SPIKE_WINDOW = 3; // samples on each side
const SPIKE_SIGMAS = 3;
const SPIKE_MIN_M = 8; // never call anything under 8 m a spike, even on flat ground
const SMOOTH_RADIUS_KM = 0.025; // average over ±25 m of route
const GAIN_THRESHOLD_M = 2;
// Below this, the correction is within normal measurement noise: nothing to fix.
const MIN_MEANINGFUL_DELTA_PCT = 2;

// Terrain models (~30–90 m resolution) disagree with a good barometer by a few percent,
// so smaller differences are not worth offering as a fix.
const TERRAIN_MIN_DELTA_PCT = 5;
const TERRAIN_SMOOTH_RADIUS_KM = 0.05;
const TERRAIN_GAIN_THRESHOLD_M = 3;
// Terrain is looked up at most this many points, then interpolated by distance.
export const MAX_TERRAIN_SAMPLES = 500;
// A frozen altimeter: the recorded altitude stays within 1 m for at least 3 km and
// 15% of the activity. Genuinely flat ground looks the same, so terrain decides.
const FLATLINE_RANGE_M = 1;
const FLATLINE_MIN_KM = 3;
const FLATLINE_MIN_SHARE = 0.15;
const FLATLINE_MIN_TERRAIN_RELIEF_M = 20;

export type ErrorType = "flatline" | "spikes" | "other" | "none";
export type Direction = "up" | "down" | "none";

export const CORRECTABLE_SPORTS = new Set(["Run", "Ride", "Hike", "Walk"]);

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sum of every rise, as most devices report it. */
export function rawElevationGain(elevationM: number[]) {
  let gain = 0;
  for (let i = 1; i < elevationM.length; i += 1) {
    const diff = elevationM[i] - elevationM[i - 1];
    if (diff > 0) gain += diff;
  }
  return Math.round(gain);
}

/** Climbing counted only once it clears the threshold from the last turning point. */
export function thresholdElevationGain(elevationM: number[], thresholdM = GAIN_THRESHOLD_M) {
  if (elevationM.length === 0) return 0;
  let gain = 0;
  let reference = elevationM[0];
  for (const value of elevationM) {
    if (value > reference + thresholdM) {
      gain += value - reference;
      reference = value;
    } else if (value < reference - thresholdM) {
      reference = value;
    }
  }
  return Math.round(gain);
}

export function removeSpikes(elevationM: number[]) {
  const cleaned = [...elevationM];
  const spikeIndices: number[] = [];
  for (let i = 0; i < elevationM.length; i += 1) {
    const from = Math.max(0, i - SPIKE_WINDOW);
    const to = Math.min(elevationM.length, i + SPIKE_WINDOW + 1);
    const window = elevationM.slice(from, to);
    const localMedian = median(window);
    const mad = median(window.map((value) => Math.abs(value - localMedian)));
    const limit = Math.max(SPIKE_SIGMAS * 1.4826 * mad, SPIKE_MIN_M);
    if (Math.abs(elevationM[i] - localMedian) > limit) {
      cleaned[i] = localMedian;
      spikeIndices.push(i);
    }
  }
  return { cleaned, spikeIndices };
}

export function smooth(elevationM: number[], distanceKm: number[], radiusKm = SMOOTH_RADIUS_KM) {
  let from = 0;
  let to = 0;
  let total = 0;
  return elevationM.map((_, i) => {
    while (to < elevationM.length && distanceKm[to] <= distanceKm[i] + radiusKm) {
      total += elevationM[to];
      to += 1;
    }
    while (distanceKm[from] < distanceKm[i] - radiusKm) {
      total -= elevationM[from];
      from += 1;
    }
    return total / (to - from);
  });
}

export function correctElevation(stream: ElevationStream): ElevationCorrection {
  const { cleaned, spikeIndices } = removeSpikes(stream.elevationM);
  const corrected = smooth(cleaned, stream.distanceKm).map((value) => Math.round(value * 10) / 10);
  const originalGainM = rawElevationGain(stream.elevationM);
  const correctedGainM = thresholdElevationGain(corrected);
  const deltaPct =
    originalGainM === 0 ? 0 : Math.round(((correctedGainM - originalGainM) / originalGainM) * 100);

  return {
    correctedElevationM: corrected,
    spikeIndices,
    originalGainM,
    correctedGainM,
    deltaPct,
    changed: spikeIndices.length > 0 || Math.abs(deltaPct) >= MIN_MEANINGFUL_DELTA_PCT,
  };
}

/** Validates an untrusted stream from an API payload. Returns an error message or the stream. */
export function parseElevationStream(
  input: unknown,
): { stream: ElevationStream & { latitude?: number[]; longitude?: number[] } } | { error: string } {
  if (typeof input !== "object" || input === null) {
    return { error: "elevationStream must be an object" };
  }
  const { distanceKm, elevationM, latitude, longitude } = input as Record<string, unknown>;
  if (!Array.isArray(distanceKm) || !Array.isArray(elevationM)) {
    return { error: "elevationStream needs distanceKm and elevationM arrays" };
  }
  if (distanceKm.length !== elevationM.length) {
    return { error: "elevationStream arrays must be the same length" };
  }
  if (distanceKm.length < MIN_STREAM_SAMPLES || distanceKm.length > MAX_STREAM_SAMPLES) {
    return {
      error: `elevationStream must have between ${MIN_STREAM_SAMPLES} and ${MAX_STREAM_SAMPLES} samples`,
    };
  }
  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  if (!distanceKm.every(isFiniteNumber) || !elevationM.every(isFiniteNumber)) {
    return { error: "elevationStream values must be finite numbers" };
  }
  for (let i = 1; i < distanceKm.length; i += 1) {
    if (distanceKm[i] < distanceKm[i - 1]) {
      return { error: "elevationStream distances must not decrease" };
    }
  }
  if (elevationM.some((value) => value < -500 || value > 9000)) {
    return { error: "elevationStream elevations must be between -500 m and 9000 m" };
  }
  if (latitude === undefined && longitude === undefined) {
    return { stream: { distanceKm, elevationM } };
  }
  if (
    !Array.isArray(latitude) ||
    !Array.isArray(longitude) ||
    latitude.length !== distanceKm.length ||
    longitude.length !== distanceKm.length
  ) {
    return { error: "elevationStream latitude and longitude must both match the sample count" };
  }
  if (
    !latitude.every((value) => isFiniteNumber(value) && Math.abs(value) <= 90) ||
    !longitude.every((value) => isFiniteNumber(value) && Math.abs(value) <= 180)
  ) {
    return { error: "elevationStream coordinates must be valid latitude/longitude values" };
  }
  return { stream: { distanceKm, elevationM, latitude, longitude } };
}

export function percentChange(before: number, after: number) {
  // "+ 0" turns -0 into 0, so a tiny drop never shows as "-0%".
  return before === 0 ? 0 : Math.round(((after - before) / before) * 100) + 0;
}

export function directionOf(before: number, after: number, minDeltaPct: number): Direction {
  if (before === 0) return after > 0 ? "up" : "none";
  const pct = ((after - before) / before) * 100;
  if (pct >= minDeltaPct) return "up";
  if (pct <= -minDeltaPct) return "down";
  return "none";
}

/**
 * The longest stretch where the recorded altitude stays within FLATLINE_RANGE_M, if it
 * is long enough to look like a frozen altimeter. O(n) with monotonic min/max queues.
 */
export function detectFlatline(stream: ElevationStream): { fromKm: number; toKm: number } | null {
  const { distanceKm, elevationM } = stream;
  const total = distanceKm[distanceKm.length - 1] - distanceKm[0];
  if (elevationM.length < 2 || total <= 0) return null;

  const maxQueue: number[] = [];
  const minQueue: number[] = [];
  let start = 0;
  let best = { from: 0, to: 0 };
  for (let end = 0; end < elevationM.length; end += 1) {
    while (maxQueue.length && elevationM[maxQueue[maxQueue.length - 1]] <= elevationM[end]) {
      maxQueue.pop();
    }
    while (minQueue.length && elevationM[minQueue[minQueue.length - 1]] >= elevationM[end]) {
      minQueue.pop();
    }
    maxQueue.push(end);
    minQueue.push(end);
    while (elevationM[maxQueue[0]] - elevationM[minQueue[0]] > FLATLINE_RANGE_M) {
      start += 1;
      if (maxQueue[0] < start) maxQueue.shift();
      if (minQueue[0] < start) minQueue.shift();
    }
    if (distanceKm[end] - distanceKm[start] > distanceKm[best.to] - distanceKm[best.from]) {
      best = { from: start, to: end };
    }
  }

  const length = distanceKm[best.to] - distanceKm[best.from];
  if (length < FLATLINE_MIN_KM || length / total < FLATLINE_MIN_SHARE) return null;
  return { fromKm: distanceKm[best.from], toKm: distanceKm[best.to] };
}

/** Evenly spaced sample indices to look terrain up at (always first and last). */
export function terrainSampleIndices(count: number, max = MAX_TERRAIN_SAMPLES) {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

/** Expands terrain values at `indices` to every sample, interpolating by distance. */
export function interpolateByDistance(distanceKm: number[], indices: number[], values: number[]) {
  const result = new Array<number>(distanceKm.length);
  let segment = 0;
  for (let i = 0; i < distanceKm.length; i += 1) {
    while (segment < indices.length - 2 && indices[segment + 1] <= i) segment += 1;
    const leftIndex = indices[segment];
    const rightIndex = indices[Math.min(segment + 1, indices.length - 1)];
    const left = distanceKm[leftIndex];
    const right = distanceKm[rightIndex];
    const t = right > left ? Math.min(1, Math.max(0, (distanceKm[i] - left) / (right - left))) : 0;
    result[i] =
      values[segment] + t * (values[Math.min(segment + 1, values.length - 1)] - values[segment]);
  }
  return result;
}

/**
 * Climbing counted the way corrections are counted: smoothed over ±50 m and ignoring
 * swings under 3 m. Used for both sides of a terrain comparison, so a recording that
 * matches the terrain compares as equal.
 */
export function robustElevationGain(stream: ElevationStream) {
  return thresholdElevationGain(
    smooth(stream.elevationM, stream.distanceKm, TERRAIN_SMOOTH_RADIUS_KM),
    TERRAIN_GAIN_THRESHOLD_M,
  );
}

export type TerrainCorrection = {
  correctedElevationM: number[];
  correctedGainM: number;
  deltaPct: number;
  direction: Direction;
  errorType: ErrorType;
  flatRegion: { fromKm: number; toKm: number } | null;
  spikeIndices: number[];
  changed: boolean;
};

/**
 * Replaces the recorded altitude with terrain along the track and explains the
 * difference. `reportedGainM` is the device's own total, which is what users saw.
 */
export function correctWithTerrain(
  stream: ElevationStream,
  terrainElevationM: number[],
  reportedGainM: number,
): TerrainCorrection {
  const corrected = smooth(terrainElevationM, stream.distanceKm, TERRAIN_SMOOTH_RADIUS_KM).map(
    (value) => Math.round(value * 10) / 10,
  );
  const correctedGainM = robustElevationGain({
    distanceKm: stream.distanceKm,
    elevationM: terrainElevationM,
  });
  const direction = directionOf(reportedGainM, correctedGainM, TERRAIN_MIN_DELTA_PCT);
  const { spikeIndices } = removeSpikes(stream.elevationM);

  // A flat recording only counts as a frozen altimeter if the terrain there isn't flat.
  let flatRegion = detectFlatline(stream);
  if (flatRegion) {
    const region = corrected.filter(
      (_, i) =>
        stream.distanceKm[i] >= flatRegion!.fromKm && stream.distanceKm[i] <= flatRegion!.toKm,
    );
    if (Math.max(...region) - Math.min(...region) < FLATLINE_MIN_TERRAIN_RELIEF_M) {
      flatRegion = null;
    }
  }

  let errorType: ErrorType = "none";
  if (direction === "up") errorType = flatRegion ? "flatline" : "other";
  if (direction === "down") errorType = spikeIndices.length > 0 ? "spikes" : "other";

  return {
    correctedElevationM: corrected,
    correctedGainM,
    deltaPct: percentChange(reportedGainM, correctedGainM),
    direction,
    errorType,
    flatRegion: direction === "up" ? flatRegion : null,
    spikeIndices: direction === "down" ? spikeIndices : [],
    changed: direction !== "none",
  };
}
