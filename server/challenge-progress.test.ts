import { describe, expect, it } from "vitest";
import {
  computeChallengeProgress,
  isChallengeEnded,
  type ProgressActivity,
  type ProgressChallenge,
} from "./challenge-progress.js";

const runDistance: ProgressChallenge = {
  sport: "Run",
  metricType: "distance_km",
  endsAt: "2026-10-31",
};

const rideClimb: ProgressChallenge = {
  sport: "Ride",
  metricType: "elevation_m",
  endsAt: "2026-10-31",
};

const joinedAt = new Date("2026-10-10T12:00:00Z");

function activity(overrides: Partial<ProgressActivity> = {}): ProgressActivity {
  return {
    sport: "Run",
    date: new Date("2026-10-15T08:00:00Z"),
    distanceKm: 5,
    elevationM: 40,
    ...overrides,
  };
}

describe("computeChallengeProgress", () => {
  it("returns 0 when the athlete hasn't joined", () => {
    expect(computeChallengeProgress(runDistance, null, [activity()])).toBe(0);
  });

  it("sums distance for matching-sport activities after joining", () => {
    const activities = [activity({ distanceKm: 5.24 }), activity({ distanceKm: 3.12 })];
    expect(computeChallengeProgress(runDistance, joinedAt, activities)).toBe(8.4);
  });

  it("ignores activities of other sports", () => {
    const activities = [activity(), activity({ sport: "Ride", distanceKm: 40 })];
    expect(computeChallengeProgress(runDistance, joinedAt, activities)).toBe(5);
  });

  it("counts elevation, not distance, for climbing challenges", () => {
    const activities = [
      activity({ sport: "Ride", elevationM: 620 }),
      activity({ sport: "Run", elevationM: 300 }),
    ];
    expect(computeChallengeProgress(rideClimb, joinedAt, activities)).toBe(620);
  });

  it("ignores activities logged before joining", () => {
    const before = activity({ date: new Date("2026-10-10T11:59:59Z") });
    const atJoin = activity({ date: joinedAt, distanceKm: 2 });
    expect(computeChallengeProgress(runDistance, joinedAt, [before, atJoin])).toBe(2);
  });

  it("counts through the end of the final day in UTC, but not after", () => {
    const lastMinute = activity({ date: new Date("2026-10-31T23:59:00Z"), distanceKm: 1 });
    const nextDay = activity({ date: new Date("2026-11-01T00:00:00Z"), distanceKm: 9 });
    expect(computeChallengeProgress(runDistance, joinedAt, [lastMinute, nextDay])).toBe(1);
  });

  it("counts every sport for Multisport challenges", () => {
    const multisport: ProgressChallenge = { ...runDistance, sport: "Multisport" };
    const activities = [activity(), activity({ sport: "Swim", distanceKm: 1.5 })];
    expect(computeChallengeProgress(multisport, joinedAt, activities)).toBe(6.5);
  });
});

describe("isChallengeEnded", () => {
  it("is false through the last day and true after it", () => {
    expect(isChallengeEnded("2026-10-31", new Date("2026-10-31T23:59:59Z"))).toBe(false);
    expect(isChallengeEnded("2026-10-31", new Date("2026-11-01T00:00:00Z"))).toBe(true);
  });
});
