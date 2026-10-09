import { describe, expect, it } from "vitest";
import { addGpsPoint, type GpsAccumulator, type GpsPoint } from "./recording-measurements";

const point = (
  latitude: number,
  timestamp: number,
  accuracy = 5,
  altitude: number | null = 100,
): GpsPoint => ({
  latitude,
  longitude: 0,
  timestamp,
  accuracy,
  altitude,
  altitudeAccuracy: altitude === null ? null : 5,
});
const empty: GpsAccumulator = { previous: null, distanceMeters: 0, elevationGainM: null };

describe("GPS measurement filtering", () => {
  it("counts plausible movement and climbing", () => {
    const first = addGpsPoint(empty, point(0, 0));
    const next = addGpsPoint(first, point(0.0001, 10000, 5, 108));
    expect(next.distanceMeters).toBeGreaterThan(10);
    expect(next.elevationGainM).toBe(5);
  });

  it("ignores poor fixes and implausible jumps", () => {
    const first = addGpsPoint(empty, point(0, 0));
    expect(addGpsPoint(first, point(0.01, 1000, 100))).toEqual(first);
    expect(addGpsPoint(first, point(0.01, 1000))).toEqual(first);
  });

  it("keeps elevation unavailable without an altitude reading", () => {
    const first = addGpsPoint(empty, point(0, 0, 5, null));
    const next = addGpsPoint(first, point(0.0001, 10000, 5, null));
    expect(next.distanceMeters).toBeGreaterThan(0);
    expect(next.elevationGainM).toBeNull();
  });
});
