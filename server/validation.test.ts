import { describe, expect, it } from "vitest";
import { parseActivityInput } from "./validation.js";

const valid = {
  sport: "Run",
  title: "Morning run",
  description: "Easy loop",
  distanceKm: 10.5,
  movingSeconds: 3000,
  elevationM: 84,
  avgHr: 148,
  avgPaceSecPerKm: 286,
  routeSeed: 42,
};

function rejects(overrides: Record<string, unknown>) {
  const result = parseActivityInput({ ...valid, ...overrides });
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("parseActivityInput", () => {
  it("accepts a valid activity", () => {
    expect(parseActivityInput(valid)).toEqual({
      ok: true,
      value: {
        sport: "Run",
        title: "Morning run",
        description: "Easy loop",
        distanceKm: 10.5,
        movingSeconds: 3000,
        elevationM: 84,
        avgHr: 148,
        avgPaceSecPerKm: 286,
        avgSpeedKmh: undefined,
        routeSeed: 42,
      },
    });
  });

  it("applies defaults and normalizes optional fields", () => {
    const result = parseActivityInput({
      sport: "Ride",
      title: "  Lunch ride  ",
      description: "   ",
      distanceKm: "42.123",
      movingSeconds: "5400",
      elevationM: 310.6,
      avgSpeedKmh: 28.1,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        sport: "Ride",
        title: "Lunch ride",
        description: undefined,
        distanceKm: 42.12,
        movingSeconds: 5400,
        elevationM: 311,
        avgHr: undefined,
        avgPaceSecPerKm: undefined,
        avgSpeedKmh: 28.1,
        routeSeed: 1,
      },
    });
  });

  it("defaults elevation to 0 when omitted", () => {
    const result = parseActivityInput({ ...valid, elevationM: undefined });
    expect(result.ok && result.value.elevationM).toBe(0);
  });

  it("rejects a missing or non-object body", () => {
    expect(parseActivityInput(undefined).ok).toBe(false);
    expect(parseActivityInput(null).ok).toBe(false);
    expect(parseActivityInput([valid]).ok).toBe(false);
  });

  it("rejects unknown sports", () => {
    expect(rejects({ sport: "Banana" })).toMatch(/Sport/);
    expect(rejects({ sport: undefined })).toMatch(/Sport/);
    expect(rejects({ sport: "run" })).toMatch(/Sport/);
  });

  it("rejects empty or overly long titles", () => {
    expect(rejects({ title: "" })).toMatch(/Title/);
    expect(rejects({ title: "   " })).toMatch(/Title/);
    expect(rejects({ title: undefined })).toMatch(/Title/);
    expect(rejects({ title: "x".repeat(121) })).toMatch(/Title/);
  });

  it("rejects non-text or overly long descriptions", () => {
    expect(rejects({ description: 12 })).toMatch(/Description/);
    expect(rejects({ description: "x".repeat(2001) })).toMatch(/Description/);
  });

  it("rejects non-positive, non-finite or absurd distances", () => {
    expect(rejects({ distanceKm: -3 })).toMatch(/Distance/);
    expect(rejects({ distanceKm: 0 })).toMatch(/Distance/);
    expect(rejects({ distanceKm: 0.001 })).toMatch(/Distance/);
    expect(rejects({ distanceKm: Number.POSITIVE_INFINITY })).toMatch(/Distance/);
    expect(rejects({ distanceKm: "ten" })).toMatch(/Distance/);
    expect(rejects({ distanceKm: undefined })).toMatch(/Distance/);
    expect(rejects({ distanceKm: 1000.01 })).toMatch(/Distance/);
  });

  it("rejects invalid moving times", () => {
    expect(rejects({ movingSeconds: 0 })).toMatch(/Moving time/);
    expect(rejects({ movingSeconds: -60 })).toMatch(/Moving time/);
    expect(rejects({ movingSeconds: 12.5 })).toMatch(/Moving time/);
    expect(rejects({ movingSeconds: undefined })).toMatch(/Moving time/);
    expect(rejects({ movingSeconds: 7 * 24 * 3600 + 1 })).toMatch(/Moving time/);
  });

  it("rejects negative or absurd elevation", () => {
    expect(rejects({ elevationM: -1 })).toMatch(/Elevation/);
    expect(rejects({ elevationM: Number.NaN })).toMatch(/Elevation/);
    expect(rejects({ elevationM: 100_001 })).toMatch(/Elevation/);
  });

  it("rejects out-of-range heart rates", () => {
    expect(rejects({ avgHr: 29 })).toMatch(/heart rate/);
    expect(rejects({ avgHr: 251 })).toMatch(/heart rate/);
    expect(rejects({ avgHr: 150.5 })).toMatch(/heart rate/);
  });

  it("rejects non-positive pace and speed", () => {
    expect(rejects({ avgPaceSecPerKm: 0 })).toMatch(/pace/);
    expect(rejects({ avgPaceSecPerKm: -200 })).toMatch(/pace/);
    expect(rejects({ avgSpeedKmh: 0 })).toMatch(/speed/);
    expect(rejects({ avgSpeedKmh: Number.POSITIVE_INFINITY })).toMatch(/speed/);
  });

  it("rejects non-integer route seeds", () => {
    expect(rejects({ routeSeed: 1.5 })).toMatch(/Route seed/);
    expect(rejects({ routeSeed: "abc" })).toMatch(/Route seed/);
  });
});
