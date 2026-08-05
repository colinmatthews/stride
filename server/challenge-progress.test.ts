import { describe, expect, it } from "vitest";
import {
  computeChallengeProgress,
  endOfChallengeDay,
  type ProgressActivityRow,
} from "./challenge-progress.js";

function row(overrides: Partial<ProgressActivityRow> = {}): ProgressActivityRow {
  return {
    sport: "Run",
    distanceKm: 10,
    elevationM: 100,
    date: new Date("2026-04-15T12:00:00.000Z"),
    ...overrides,
  };
}

const runChallenge = {
  sport: "Run",
  metricType: "distance_km",
  endsAt: endOfChallengeDay("2026-04-30"),
};

describe("computeChallengeProgress", () => {
  it("sums matching-sport activities within the join-to-deadline window", () => {
    const joinedAt = new Date("2026-04-01T00:00:00.000Z");
    const rows = [row({ distanceKm: 10 }), row({ distanceKm: 15 })];

    expect(computeChallengeProgress(rows, runChallenge, joinedAt)).toBe(25);
  });

  it("excludes activities logged before the user joined the challenge", () => {
    const joinedAt = new Date("2026-04-10T00:00:00.000Z");
    const rows = [
      row({ distanceKm: 40, date: new Date("2026-03-20T00:00:00.000Z") }), // pre-join, excluded
      row({ distanceKm: 10, date: new Date("2026-04-15T00:00:00.000Z") }),
    ];

    expect(computeChallengeProgress(rows, runChallenge, joinedAt)).toBe(10);
  });

  it("excludes activities logged after the challenge's endsAt", () => {
    const joinedAt = new Date("2026-04-01T00:00:00.000Z");
    const rows = [
      row({ distanceKm: 10, date: new Date("2026-04-15T00:00:00.000Z") }),
      row({ distanceKm: 50, date: new Date("2026-05-01T00:00:00.000Z") }), // after endsAt, excluded
    ];

    expect(computeChallengeProgress(rows, runChallenge, joinedAt)).toBe(10);
  });

  it("includes an activity logged on the endsAt calendar day itself", () => {
    const joinedAt = new Date("2026-04-01T00:00:00.000Z");
    const rows = [row({ distanceKm: 10, date: new Date("2026-04-30T23:00:00.000Z") })];

    expect(computeChallengeProgress(rows, runChallenge, joinedAt)).toBe(10);
  });

  it("does not count activities from a different sport", () => {
    const joinedAt = new Date("2026-04-01T00:00:00.000Z");
    const rows = [row({ sport: "Ride", distanceKm: 40 }), row({ sport: "Run", distanceKm: 10 })];

    expect(computeChallengeProgress(rows, runChallenge, joinedAt)).toBe(10);
  });

  it("scopes an elevation challenge to its own sport, not elevation from every sport", () => {
    const climbChallenge = {
      sport: "Ride",
      metricType: "elevation_m",
      endsAt: endOfChallengeDay("2026-04-30"),
    };
    const joinedAt = new Date("2026-04-01T00:00:00.000Z");
    const rows = [
      row({ sport: "Ride", elevationM: 500 }),
      row({ sport: "Hike", elevationM: 800 }), // different sport, must not count
    ];

    expect(computeChallengeProgress(rows, climbChallenge, joinedAt)).toBe(500);
  });

  it("does not double count the same activity across two challenges with different join dates", () => {
    const joinedEarly = new Date("2026-04-01T00:00:00.000Z");
    const joinedLate = new Date("2026-04-20T00:00:00.000Z");
    const rows = [row({ distanceKm: 40, date: new Date("2026-04-10T00:00:00.000Z") })];

    expect(computeChallengeProgress(rows, runChallenge, joinedEarly)).toBe(40);
    expect(computeChallengeProgress(rows, runChallenge, joinedLate)).toBe(0);
  });
});

describe("challenge completion detection (before/after comparison)", () => {
  const joinedAt = new Date("2026-04-01T00:00:00.000Z");
  const goalKm = 100;

  function isNewlyCompleted(existingRows: ProgressActivityRow[], newRow: ProgressActivityRow) {
    const before = computeChallengeProgress(existingRows, runChallenge, joinedAt);
    const after = computeChallengeProgress([...existingRows, newRow], runChallenge, joinedAt);
    return before < goalKm && after >= goalKm;
  }

  it("flags completion when an activity crosses the goal", () => {
    const existing = [row({ distanceKm: 95 })];
    const newActivity = row({ distanceKm: 10, date: new Date("2026-04-16T00:00:00.000Z") });

    expect(isNewlyCompleted(existing, newActivity)).toBe(true);
  });

  it("does not re-flag a challenge that was already complete before this activity", () => {
    const existing = [row({ distanceKm: 120 })];
    const newActivity = row({ distanceKm: 5, date: new Date("2026-04-16T00:00:00.000Z") });

    expect(isNewlyCompleted(existing, newActivity)).toBe(false);
  });

  it("does not flag completion when the activity doesn't reach the goal", () => {
    const existing = [row({ distanceKm: 20 })];
    const newActivity = row({ distanceKm: 10, date: new Date("2026-04-16T00:00:00.000Z") });

    expect(isNewlyCompleted(existing, newActivity)).toBe(false);
  });
});
