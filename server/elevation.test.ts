import { describe, expect, it } from "vitest";
import {
  correctElevation,
  correctWithTerrain,
  detectFlatline,
  directionOf,
  interpolateByDistance,
  parseElevationStream,
  rawElevationGain,
  removeSpikes,
  robustElevationGain,
  terrainSampleIndices,
  thresholdElevationGain,
} from "./elevation.js";

// 1 sample every 10 m, like a device recording every few seconds.
function distances(count: number, stepKm = 0.01) {
  return Array.from({ length: count }, (_, i) => Math.round(i * stepKm * 1000) / 1000);
}

function hill(count: number, heightM: number) {
  // Climb to the top over the first half, descend over the second.
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return 1000 + heightM * (t < 0.5 ? t * 2 : (1 - t) * 2);
  });
}

describe("rawElevationGain", () => {
  it("sums every rise and ignores descents", () => {
    expect(rawElevationGain([100, 110, 105, 120, 90])).toBe(25);
  });

  it("returns 0 for empty or flat input", () => {
    expect(rawElevationGain([])).toBe(0);
    expect(rawElevationGain([50, 50, 50])).toBe(0);
  });
});

describe("thresholdElevationGain", () => {
  it("ignores jitter smaller than the threshold", () => {
    const jitter = Array.from({ length: 100 }, (_, i) => 200 + (i % 2 ? 0.9 : -0.9));
    expect(rawElevationGain(jitter)).toBeGreaterThan(80);
    expect(thresholdElevationGain(jitter)).toBe(0);
  });

  it("keeps real climbs", () => {
    expect(thresholdElevationGain(hill(200, 300))).toBeGreaterThanOrEqual(297);
  });
});

describe("removeSpikes", () => {
  it("replaces single-sample spikes with the local median", () => {
    const elevation = hill(200, 100);
    elevation[50] += 30;
    elevation[120] -= 25;
    const { cleaned, spikeIndices } = removeSpikes(elevation);

    expect(spikeIndices).toEqual([50, 120]);
    expect(Math.abs(cleaned[50] - hill(200, 100)[50])).toBeLessThan(2);
  });

  it("does not flag steep but smooth terrain", () => {
    // 40% grade: 4 m per 10 m sample.
    const steep = Array.from({ length: 100 }, (_, i) => 500 + i * 4);
    expect(removeSpikes(steep).spikeIndices).toEqual([]);
  });

  it("does not flag small bumps on flat ground", () => {
    const flat = Array.from({ length: 100 }, (_, i) => 300 + (i === 40 ? 5 : 0));
    expect(removeSpikes(flat).spikeIndices).toEqual([]);
  });
});

describe("correctElevation", () => {
  it("removes climbing added by spikes and noise", () => {
    const count = 500;
    const clean = hill(count, 200);
    const noisy = clean.map((value, i) => value + (i % 2 ? 1 : -1) + (i % 97 === 0 ? 25 : 0));
    const result = correctElevation({ distanceKm: distances(count), elevationM: noisy });

    expect(result.originalGainM).toBeGreaterThan(600);
    expect(result.correctedGainM).toBeGreaterThan(190);
    expect(result.correctedGainM).toBeLessThan(215);
    expect(result.spikeIndices.length).toBe(6); // i = 0, 97, 194, 291, 388, 485
    expect(result.deltaPct).toBeLessThan(-50);
    expect(result.changed).toBe(true);
  });

  it("reports no change for a clean recording", () => {
    const count = 300;
    const result = correctElevation({ distanceKm: distances(count), elevationM: hill(count, 150) });

    expect(result.spikeIndices).toEqual([]);
    expect(Math.abs(result.deltaPct)).toBeLessThan(2);
    expect(result.changed).toBe(false);
  });

  it("keeps real hills on sparse recordings", () => {
    // 1 sample every 250 m: smoothing must not average neighbouring hills together.
    const count = 60;
    const rolling = Array.from({ length: count }, (_, i) => 800 + 40 * Math.sin(i / 2));
    const result = correctElevation({ distanceKm: distances(count, 0.25), elevationM: rolling });

    expect(result.correctedGainM).toBeGreaterThan(rawElevationGain(rolling) * 0.95);
  });

  it("keeps the corrected stream index-aligned with the original", () => {
    const count = 120;
    const result = correctElevation({ distanceKm: distances(count), elevationM: hill(count, 80) });
    expect(result.correctedElevationM).toHaveLength(count);
  });

  it("handles a recording with no climbing", () => {
    const result = correctElevation({
      distanceKm: distances(20),
      elevationM: Array(20).fill(10),
    });
    expect(result).toMatchObject({
      originalGainM: 0,
      correctedGainM: 0,
      deltaPct: 0,
      changed: false,
    });
  });
});

describe("parseElevationStream", () => {
  const valid = { distanceKm: distances(20), elevationM: hill(20, 50) };

  it("accepts a valid stream", () => {
    expect(parseElevationStream(valid)).toEqual({ stream: valid });
  });

  it.each([
    ["not an object", "nope"],
    ["missing arrays", { distanceKm: [] }],
    ["mismatched lengths", { distanceKm: distances(20), elevationM: hill(19, 50) }],
    ["too few samples", { distanceKm: distances(5), elevationM: hill(5, 50) }],
    ["non-numbers", { distanceKm: distances(20), elevationM: [...hill(19, 50), "x"] }],
    ["NaN", { distanceKm: distances(20), elevationM: [...hill(19, 50), Number.NaN] }],
    ["decreasing distance", { distanceKm: [...distances(19), 0], elevationM: hill(20, 50) }],
    ["impossible altitude", { distanceKm: distances(20), elevationM: [...hill(19, 50), 12000] }],
  ])("rejects %s", (_label, input) => {
    expect(parseElevationStream(input)).toHaveProperty("error");
  });
});

describe("directionOf", () => {
  it("ignores differences below the threshold", () => {
    expect(directionOf(800, 820, 5)).toBe("none");
    expect(directionOf(800, 770, 5)).toBe("none");
  });

  it("reports missing and extra climbing", () => {
    expect(directionOf(150, 800, 5)).toBe("up");
    expect(directionOf(985, 800, 5)).toBe("down");
    expect(directionOf(0, 50, 5)).toBe("up");
  });
});

describe("detectFlatline", () => {
  // 10 m per sample: 500 samples = 5 km.
  const count = 500;
  const km = distances(count);

  it("finds a frozen altimeter", () => {
    const frozen = hill(count, 200).map((value, i) => (i >= 100 ? 1040 : value));
    expect(detectFlatline({ distanceKm: km, elevationM: frozen })).toEqual({
      fromKm: 1,
      toKm: 4.99,
    });
  });

  it("ignores short flat stretches", () => {
    const shortFlat = hill(count, 200).map((value, i) => (i >= 300 && i < 450 ? 1100 : value));
    expect(detectFlatline({ distanceKm: km, elevationM: shortFlat })).toBeNull();
  });

  it("ignores a normal hilly recording", () => {
    expect(detectFlatline({ distanceKm: km, elevationM: hill(count, 200) })).toBeNull();
  });
});

describe("terrain lookups", () => {
  it("samples evenly, always including the first and last point", () => {
    expect(terrainSampleIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
    const indices = terrainSampleIndices(1001, 5);
    expect(indices).toEqual([0, 250, 500, 750, 1000]);
  });

  it("interpolates looked-up values back to every sample by distance", () => {
    const km = [0, 1, 2, 3, 4];
    expect(interpolateByDistance(km, [0, 2, 4], [100, 200, 100])).toEqual([
      100, 150, 200, 150, 100,
    ]);
  });
});

describe("correctWithTerrain", () => {
  const count = 500;
  const km = distances(count);
  const terrain = hill(count, 200);

  it("adds climbing a frozen altimeter missed", () => {
    const frozen = terrain.map((value, i) => (i >= 40 ? terrain[40] : value));
    const reported = rawElevationGain(frozen);
    const result = correctWithTerrain({ distanceKm: km, elevationM: frozen }, terrain, reported);

    expect(reported).toBeLessThan(40);
    expect(result.correctedGainM).toBeGreaterThan(190);
    expect(result).toMatchObject({ direction: "up", errorType: "flatline", changed: true });
    expect(result.flatRegion?.fromKm).toBeCloseTo(0.4, 1);
  });

  it("does not blame the altimeter when the terrain really is flat", () => {
    const flatTerrain = Array(count).fill(1500);
    const result = correctWithTerrain(
      { distanceKm: km, elevationM: [...flatTerrain] },
      flatTerrain,
      0,
    );
    expect(result).toMatchObject({ direction: "none", errorType: "none", flatRegion: null });
  });

  it("removes climbing added by spikes", () => {
    const spiky = terrain.map((value, i) => value + (i % 50 === 25 ? 30 : 0));
    const reported = rawElevationGain(spiky);
    const result = correctWithTerrain({ distanceKm: km, elevationM: spiky }, terrain, reported);

    expect(result).toMatchObject({ direction: "down", errorType: "spikes", changed: true });
    expect(result.spikeIndices).toHaveLength(10);
  });

  it("leaves an accurate recording alone", () => {
    const result = correctWithTerrain(
      { distanceKm: km, elevationM: [...terrain] },
      terrain,
      rawElevationGain(terrain),
    );
    expect(result).toMatchObject({ direction: "none", errorType: "none", changed: false });
  });
});

describe("parseElevationStream with a GPS track", () => {
  const base = { distanceKm: distances(20), elevationM: hill(20, 50) };
  const latitude = Array.from({ length: 20 }, (_, i) => 40 + i * 0.0001);
  const longitude = Array(20).fill(-105.3);

  it("accepts matching coordinates", () => {
    expect(parseElevationStream({ ...base, latitude, longitude })).toEqual({
      stream: { ...base, latitude, longitude },
    });
  });

  it.each([
    ["only one coordinate array", { latitude }],
    ["a length mismatch", { latitude: latitude.slice(1), longitude }],
    ["an invalid latitude", { latitude: [...latitude.slice(1), 95], longitude }],
  ])("rejects %s", (_label, extra) => {
    expect(parseElevationStream({ ...base, ...extra })).toHaveProperty("error");
  });
});

describe("robustElevationGain", () => {
  it("counts a clean recording and its terrain identically", () => {
    const km = distances(500);
    const rolling = km.map((d) => 1500 + 150 * Math.sin(d * 3) + 1.2 * Math.sin(d * 400));
    const stream = { distanceKm: km, elevationM: rolling };
    const result = correctWithTerrain(stream, rolling, robustElevationGain(stream));
    expect(result).toMatchObject({ direction: "none", deltaPct: 0, changed: false });
    // The raw sum also counts the 1 m micro-bumps, so it can't be compared directly.
    expect(rawElevationGain(rolling)).toBeGreaterThan(robustElevationGain(stream));
  });
});
