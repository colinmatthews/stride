import { describe, expect, it } from "vitest";
import {
  bestWeek,
  deriveBadgeMetrics,
  earnedBadgeIds,
  longestStreak,
  type BadgeActivity,
} from "./badge-rules";

function activity(overrides: Partial<BadgeActivity> = {}): BadgeActivity {
  return {
    sport: "Run",
    distanceKm: 10,
    elevationM: 100,
    movingSeconds: 3000,
    avgPaceSecPerKm: 300,
    kudos: 0,
    date: new Date("2026-04-01T09:00:00.000Z"),
    ...overrides,
  };
}

describe("longestStreak", () => {
  it("returns 0 for no activity", () => {
    expect(longestStreak([])).toBe(0);
  });

  it("counts consecutive days and ignores same-day duplicates", () => {
    const dates = [
      "2026-04-01T09:00:00.000Z",
      "2026-04-01T18:00:00.000Z", // same day
      "2026-04-02T09:00:00.000Z",
      "2026-04-03T09:00:00.000Z",
      "2026-04-05T09:00:00.000Z", // gap resets
    ];
    expect(longestStreak(dates)).toBe(3);
  });
});

describe("bestWeek", () => {
  it("finds the best rolling 7-day distance and elevation", () => {
    const acts = [
      { date: "2026-04-01T00:00:00.000Z", distanceKm: 40, elevationM: 2000 },
      { date: "2026-04-04T00:00:00.000Z", distanceKm: 40, elevationM: 2000 },
      { date: "2026-04-06T00:00:00.000Z", distanceKm: 40, elevationM: 2000 }, // within 7d of Apr 1
      { date: "2026-04-20T00:00:00.000Z", distanceKm: 10, elevationM: 500 }, // separate week
    ];
    expect(bestWeek(acts)).toEqual({ km: 120, elev: 6000 });
  });
});

describe("earnedBadgeIds", () => {
  it("unlocks first-activity and polar-bear for a single swim", () => {
    const metrics = deriveBadgeMetrics([activity({ sport: "Swim" })], 0);
    const earned = earnedBadgeIds(metrics);
    expect(earned).toContain("first-activity");
    expect(earned).toContain("polar-bear");
    expect(earned).not.toContain("triathlete");
  });

  it("unlocks triathlete once run, swim, and ride are all logged", () => {
    const metrics = deriveBadgeMetrics(
      [activity({ sport: "Run" }), activity({ sport: "Swim" }), activity({ sport: "Ride" })],
      0,
    );
    expect(earnedBadgeIds(metrics)).toContain("triathlete");
  });

  it("unlocks first-challenge from a joined challenge with no activities", () => {
    const metrics = deriveBadgeMetrics([], 1);
    expect(earnedBadgeIds(metrics)).toEqual(["first-challenge"]);
  });

  it("unlocks marathoner on a single 42km+ effort but not on shorter runs", () => {
    expect(earnedBadgeIds(deriveBadgeMetrics([activity({ distanceKm: 42.2 })], 0))).toContain(
      "marathoner",
    );
    expect(earnedBadgeIds(deriveBadgeMetrics([activity({ distanceKm: 41 })], 0))).not.toContain(
      "marathoner",
    );
  });

  it("unlocks speed-demon only for a sub-4:00/km run", () => {
    expect(earnedBadgeIds(deriveBadgeMetrics([activity({ avgPaceSecPerKm: 239 })], 0))).toContain(
      "speed-demon",
    );
    expect(
      earnedBadgeIds(deriveBadgeMetrics([activity({ avgPaceSecPerKm: 240 })], 0)),
    ).not.toContain("speed-demon");
  });

  it("unlocks power-hour for a 40km+ ride under an hour, not for a slow one", () => {
    expect(
      earnedBadgeIds(
        deriveBadgeMetrics([activity({ sport: "Ride", distanceKm: 41, movingSeconds: 3500 })], 0),
      ),
    ).toContain("power-hour");
    expect(
      earnedBadgeIds(
        deriveBadgeMetrics([activity({ sport: "Ride", distanceKm: 41, movingSeconds: 3700 })], 0),
      ),
    ).not.toContain("power-hour");
  });

  it("counts early-bird activities in UTC", () => {
    const dawn = [1, 2, 3, 4, 5].map((day) =>
      activity({ date: new Date(`2026-04-0${day}T06:30:00.000Z`) }),
    );
    expect(earnedBadgeIds(deriveBadgeMetrics(dawn, 0))).toContain("early-bird");
    const daytime = [1, 2, 3, 4, 5].map((day) =>
      activity({ date: new Date(`2026-04-0${day}T09:00:00.000Z`) }),
    );
    expect(earnedBadgeIds(deriveBadgeMetrics(daytime, 0))).not.toContain("early-bird");
  });
});

describe("deriveBadgeMetrics progress inputs", () => {
  it("aggregates all-time totals used by trailblazer/sky-high/dedicated", () => {
    const rows = Array.from({ length: 10 }, () =>
      activity({ distanceKm: 120, elevationM: 3000, kudos: 12 }),
    );
    const m = deriveBadgeMetrics(rows, 0);
    expect(m.count).toBe(10);
    expect(m.totalKm).toBe(1200);
    expect(m.totalElev).toBe(30000);
    expect(m.totalKudos).toBe(120);
    const earned = earnedBadgeIds(m);
    expect(earned).toEqual(
      expect.arrayContaining(["dedicated", "trailblazer", "sky-high", "kudos-magnet"]),
    );
  });
});
