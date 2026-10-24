import { describe, expect, it } from "vitest";
import type { ActivityDto } from "./data.js";
import {
  buildSaveSummary,
  resolveTimeZone,
  type SameSportHistory,
  type SaveSummaryInput,
  type SummaryChallenge,
} from "./save-summary.js";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-17T15:00:00Z");

function activity(overrides: Partial<ActivityDto> = {}): ActivityDto {
  return {
    id: "act-new",
    athleteId: "me",
    sport: "Run",
    title: "Morning run",
    date: NOW.toISOString(),
    distanceKm: 10,
    movingSeconds: 3000,
    elevationM: 80,
    avgPaceSecPerKm: 300,
    kudos: 0,
    comments: [],
    achievements: 0,
    routeSeed: 1,
    ...overrides,
  };
}

const NO_HISTORY: SameSportHistory = {
  count: 0,
  avgDistanceKm: 0,
  avgElevationM: 0,
  avgPaceValue: 0,
  maxDistanceKm: 0,
  maxElevationM: 0,
  bestPaceValue: 0,
};

function history(overrides: Partial<SameSportHistory> = {}): SameSportHistory {
  return {
    count: 4,
    avgDistanceKm: 8,
    avgElevationM: 60,
    avgPaceValue: 320,
    maxDistanceKm: 12,
    maxElevationM: 150,
    bestPaceValue: 290,
    ...overrides,
  };
}

function input(overrides: Partial<SaveSummaryInput> = {}): SaveSummaryInput {
  return {
    activity: activity(),
    athleteName: "Jamie Rivera",
    ordinal: 5,
    // One activity last week keeps "busier week" out of tests that don't care about it.
    recentActivities: [recent("prev-week", new Date(NOW.getTime() - 8 * DAY_MS))],
    sameSportHistory: history(),
    challenges: [],
    challengeActivities: [],
    ...overrides,
  };
}

function recent(id: string, date: Date | string, movingSeconds = 1800) {
  return { id, date: new Date(date), movingSeconds };
}

const ids = (summary: { highlights: { id: string }[] }) => summary.highlights.map((h) => h.id);

describe("buildSaveSummary", () => {
  it("treats the first activity of a sport as a baseline", () => {
    const summary = buildSaveSummary(input({ ordinal: 1, sameSportHistory: NO_HISTORY }));

    expect(summary.ordinal).toBe(1);
    expect(summary.sportOrdinal).toBe(1);
    expect(summary.averages).toBeNull();
    expect(ids(summary)).toEqual(["first"]);
    expect(summary.highlights[0].label).toBe("First run");
    expect(summary.athleteFirstName).toBe("Jamie");
  });

  it("reports averages and sport ordinal from same-sport history", () => {
    const summary = buildSaveSummary(input());

    expect(summary.sportOrdinal).toBe(5);
    expect(summary.averages).toEqual({ distanceKm: 8, paceValue: 320, elevationM: 60 });
  });

  it("uses speed for rides, where higher is better", () => {
    const ride = (avgSpeedKmh: number) =>
      buildSaveSummary(
        input({
          activity: activity({
            sport: "Ride",
            avgPaceSecPerKm: undefined,
            avgSpeedKmh,
            distanceKm: 5,
          }),
          sameSportHistory: history({ bestPaceValue: 28, maxDistanceKm: 60 }),
        }),
      );

    expect(ids(ride(30))).toContain("fastest");
    expect(ids(ride(25))).not.toContain("fastest");
    expect(ids(ride(28))).not.toContain("fastest");
  });

  it("uses pace for runs, where lower is better", () => {
    const run = (avgPaceSecPerKm: number) =>
      buildSaveSummary(
        input({ activity: activity({ avgPaceSecPerKm, distanceKm: 5, elevationM: 0 }) }),
      );

    expect(ids(run(280))).toEqual(["fastest"]);
    expect(ids(run(300))).toEqual([]);
  });

  it("derives speed from distance and time when a ride has no average speed", () => {
    const summary = buildSaveSummary(
      input({
        activity: activity({
          sport: "Ride",
          avgPaceSecPerKm: undefined,
          distanceKm: 30,
          movingSeconds: 3600,
          elevationM: 0,
        }),
        sameSportHistory: history({ bestPaceValue: 29, maxDistanceKm: 60 }),
      }),
    );

    expect(ids(summary)).toEqual(["fastest"]);
  });

  it("never awards most climbing to a swim", () => {
    const climbHistory = history({ maxElevationM: 10, maxDistanceKm: 50, bestPaceValue: 1 });
    const swim = buildSaveSummary(
      input({
        activity: activity({ sport: "Swim", elevationM: 50 }),
        sameSportHistory: climbHistory,
      }),
    );
    const run = buildSaveSummary(
      input({ activity: activity({ elevationM: 50 }), sameSportHistory: climbHistory }),
    );

    expect(ids(swim)).not.toContain("climb");
    expect(ids(run)).toContain("climb");
  });

  it("counts the streak by local day in the athlete's time zone", () => {
    const base = input({
      activity: activity({ date: "2026-10-17T06:30:00Z" }),
      recentActivities: [recent("a", "2026-10-16T05:00:00Z")],
    });

    expect(buildSaveSummary(base, { timeZone: "America/Los_Angeles" }).streakDays).toBe(2);

    const sameLocalDay = { ...base, recentActivities: [recent("a", "2026-10-16T08:00:00Z")] };
    expect(buildSaveSummary(sameLocalDay, { timeZone: "UTC" }).streakDays).toBe(2);
    expect(buildSaveSummary(sameLocalDay, { timeZone: "America/Los_Angeles" }).streakDays).toBe(1);

    const previousLocalDay = { ...base, recentActivities: [recent("a", "2026-10-15T20:00:00Z")] };
    expect(buildSaveSummary(previousLocalDay, { timeZone: "UTC" }).streakDays).toBe(1);
    expect(buildSaveSummary(previousLocalDay, { timeZone: "America/Los_Angeles" }).streakDays).toBe(
      2,
    );
  });

  it("ignores activities logged after this one", () => {
    const summary = buildSaveSummary(
      input({
        recentActivities: [recent("later", new Date(NOW.getTime() + DAY_MS))],
      }),
    );

    expect(summary.thisWeek.count).toBe(1);
    expect(summary.streakDays).toBe(1);
  });

  it("buckets six rolling weeks ending at the activity", () => {
    const summary = buildSaveSummary(
      input({
        sameSportHistory: history({ maxDistanceKm: 50, maxElevationM: 500, bestPaceValue: 1 }),
        recentActivities: [
          recent("act-new", NOW, 3000),
          recent("a", new Date(NOW.getTime() - 2 * DAY_MS), 3600),
          recent("b", new Date(NOW.getTime() - 8 * DAY_MS), 1800),
          recent("c", new Date(NOW.getTime() - 41 * DAY_MS), 600),
        ],
      }),
      { timeZone: "UTC" },
    );

    expect(summary.weeks).toHaveLength(6);
    expect(summary.weeks.map((week) => week.label)).toEqual([
      "Sep 6",
      "Sep 13",
      "Sep 20",
      "Sep 27",
      "Oct 4",
      "This wk",
    ]);
    expect(summary.weeks.map((week) => week.count)).toEqual([1, 0, 0, 0, 1, 2]);
    expect(summary.weeks.map((week) => week.isCurrent)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(summary.thisWeek).toEqual({ count: 2, minutes: 110 });
    expect(summary.lastWeek).toEqual({ count: 1, minutes: 30 });
    expect(ids(summary)).toEqual(["busier"]);
  });

  it("caps highlights at three", () => {
    const summary = buildSaveSummary(
      input({
        activity: activity({ distanceKm: 20, elevationM: 300, avgPaceSecPerKm: 250 }),
        recentActivities: [recent("a", new Date(NOW.getTime() - DAY_MS))],
      }),
    );

    expect(summary.streakDays).toBe(2);
    expect(ids(summary)).toEqual(["longest", "fastest", "climb"]);
  });

  describe("challenges", () => {
    const joinedAt = new Date("2026-10-01T00:00:00Z");
    const challenge = (overrides: Partial<SummaryChallenge>): SummaryChallenge => ({
      id: "ch",
      name: "October 50K",
      sport: "Run",
      metricType: "distance_km",
      endsAt: "2026-10-31",
      goal: 50,
      joinedAt,
      ...overrides,
    });
    const earlierRun = {
      sport: "Run",
      date: new Date("2026-10-10T10:00:00Z"),
      distanceKm: 8,
      elevationM: 40,
    };

    it("reports progress before and after this activity, capped at the goal", () => {
      const summary = buildSaveSummary(
        input({
          challenges: [
            challenge({ id: "dist", goal: 50 }),
            challenge({ id: "capped", goal: 12 }),
            challenge({
              id: "climb",
              name: "Climb",
              sport: "Multisport",
              metricType: "elevation_m",
              goal: 1000,
            }),
          ],
          challengeActivities: [
            earlierRun,
            { ...earlierRun, date: new Date(NOW.getTime() + DAY_MS), distanceKm: 99 },
          ],
        }),
      );

      expect(summary.challenges).toEqual([
        { id: "dist", name: "October 50K", unit: "km", before: 8, after: 18, goal: 50 },
        { id: "capped", name: "October 50K", unit: "km", before: 8, after: 12, goal: 12 },
        { id: "climb", name: "Climb", unit: "m", before: 40, after: 120, goal: 1000 },
      ]);
    });

    it("skips ended, other-sport, and not-yet-joined challenges", () => {
      const summary = buildSaveSummary(
        input({
          challenges: [
            challenge({ id: "ended", endsAt: "2026-10-16" }),
            challenge({ id: "ride", sport: "Ride" }),
            challenge({ id: "late-join", joinedAt: new Date(NOW.getTime() + 1000) }),
            challenge({ id: "ends-today", endsAt: "2026-10-17" }),
          ],
          challengeActivities: [earlierRun],
        }),
      );

      expect(summary.challenges.map((c) => c.id)).toEqual(["ends-today"]);
    });
  });
});

describe("resolveTimeZone", () => {
  it("falls back to UTC for missing or invalid zones", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone("")).toBe("UTC");
    expect(resolveTimeZone(["America/Los_Angeles"])).toBe("UTC");
    expect(resolveTimeZone("Not/A_Zone")).toBe("UTC");
    expect(resolveTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
  });

  it("builds the same summary as UTC when the zone is invalid", () => {
    const base = input({
      activity: activity({ date: "2026-10-17T06:30:00Z" }),
      recentActivities: [recent("a", "2026-10-16T08:00:00Z")],
    });

    expect(buildSaveSummary(base, { timeZone: "Not/A_Zone" })).toEqual(
      buildSaveSummary(base, { timeZone: "UTC" }),
    );
    expect(buildSaveSummary(base, { timeZone: "Not/A_Zone" }).streakDays).toBe(2);
  });
});
