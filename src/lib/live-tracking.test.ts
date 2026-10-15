import { describe, expect, it } from "vitest";
import {
  addGpsSample,
  emptyGpsTrack,
  resetTrackingBaseline,
  type GpsSample,
} from "./live-tracking";

const sample = (latitude: number, altitude: number | null, timestamp: number): GpsSample => ({
  latitude,
  longitude: -79.3832,
  accuracy: 5,
  altitude,
  altitudeAccuracy: altitude === null ? null : 5,
  timestamp,
});

describe("GPS accumulation", () => {
  it("counts movement and real ascent, but not downhill or stationary noise", () => {
    let track = addGpsSample(emptyGpsTrack, sample(43.6532, 100, 1000), "Run");
    track = addGpsSample(track, sample(43.6533, 108, 3000), "Run");
    track = addGpsSample(track, sample(43.6534, 103, 5000), "Run");
    track = addGpsSample(track, sample(43.6534, 109, 6000), "Run");
    expect(track.distanceM).toBeGreaterThan(20);
    expect(track.distanceM).toBeLessThan(25);
    expect(track.elevationGainM).toBe(8);
    expect(track.points).toBe(3);
  });

  it("rejects inaccurate jumps and starts a new segment after a pause", () => {
    let track = addGpsSample(emptyGpsTrack, sample(43.6532, 100, 1000), "Ride");
    track = addGpsSample(track, { ...sample(43.66, 200, 2000), accuracy: 80 }, "Ride");
    expect(track.distanceM).toBe(0);
    track = resetTrackingBaseline(track);
    track = addGpsSample(track, sample(43.66, 200, 3000), "Ride");
    expect(track.distanceM).toBe(0);
    expect(track.elevationGainM).toBe(0);
  });
});
