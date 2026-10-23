import { describe, expect, it } from "vitest";
import {
  WEEKLY_RECAP_RUN_THRESHOLD,
  isRun,
  qualifiesForRecap,
  recapTier,
  runsInRange,
  streakWeeksFor,
  summarizeWeek,
  weekRangeFor,
  type RecapActivity,
} from "./weekly-recap";

/**
 * Dates are built with the local-time `Date(y, m, d, ...)` constructor rather
 * than ISO strings so these assertions hold in any `TZ` — the week boundaries
 * under test are themselves local-time.
 */
function run(year: number, month: number, day: number, overrides: Partial<RecapActivity> = {}) {
  return {
    sport: "Run",
    date: new Date(year, month, day, 12, 0, 0),
    distanceKm: 5,
    movingSeconds: 1800,
    ...overrides,
  } satisfies RecapActivity;
}

// 2026-01-14 is a Wednesday; its Mon–Sun week is Jan 12 → Jan 18.
const WEDNESDAY = new Date(2026, 0, 14, 9, 30);

describe("weekRangeFor", () => {
  it("anchors the week on Monday midnight", () => {
    const { start } = weekRangeFor(WEDNESDAY);

    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(12);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("ends exclusively on the following Monday", () => {
    const { end } = weekRangeFor(WEDNESDAY);

    expect(end.getDay()).toBe(1);
    expect(end.getDate()).toBe(19);
  });

  it("keeps Sunday night inside the same week", () => {
    const sundayNight = new Date(2026, 0, 18, 23, 59, 59, 999);

    expect(weekRangeFor(sundayNight).start.getDate()).toBe(12);
  });

  it("treats Monday midnight as the start of the new week, not the end of the old one", () => {
    const mondayMidnight = new Date(2026, 0, 19, 0, 0, 0);

    expect(weekRangeFor(mondayMidnight).start.getDate()).toBe(19);
  });
});

describe("isRun", () => {
  it("matches regardless of casing or padding", () => {
    expect(isRun("Run")).toBe(true);
    expect(isRun("run")).toBe(true);
    expect(isRun("  RUN  ")).toBe(true);
  });

  it("rejects other sports", () => {
    expect(isRun("Ride")).toBe(false);
    expect(isRun("Swim")).toBe(false);
    expect(isRun("Trail Run")).toBe(false);
  });
});

describe("runsInRange", () => {
  const range = weekRangeFor(WEDNESDAY);

  it("keeps only runs inside the week", () => {
    const activities = [
      run(2026, 0, 12), // Monday, in
      run(2026, 0, 18), // Sunday, in
      run(2026, 0, 11), // previous Sunday, out
      run(2026, 0, 19), // next Monday, out
    ];

    expect(runsInRange(activities, range)).toHaveLength(2);
  });

  it("excludes non-run sports logged in the same week", () => {
    const activities = [run(2026, 0, 13), run(2026, 0, 14, { sport: "Ride" })];

    expect(runsInRange(activities, range)).toHaveLength(1);
  });

  it("ignores activities with an unparseable date", () => {
    const activities = [run(2026, 0, 13), run(2026, 0, 13, { date: "not-a-date" })];

    expect(runsInRange(activities, range)).toHaveLength(1);
  });
});

describe("summarizeWeek", () => {
  it("totals distance and time across the week's runs only", () => {
    const activities = [
      run(2026, 0, 12, { distanceKm: 5.05, movingSeconds: 1500 }),
      run(2026, 0, 14, { distanceKm: 10.1, movingSeconds: 3000 }),
      run(2026, 0, 14, { sport: "Ride", distanceKm: 40, movingSeconds: 4000 }),
      run(2026, 0, 5, { distanceKm: 8, movingSeconds: 2400 }),
    ];

    const recap = summarizeWeek(activities, WEDNESDAY);

    expect(recap.runCount).toBe(2);
    expect(recap.distanceKm).toBe(15.15);
    expect(recap.movingSeconds).toBe(4500);
  });

  it("rounds distance to the two decimals Postgres stores", () => {
    const activities = [
      run(2026, 0, 12, { distanceKm: 0.1 }),
      run(2026, 0, 13, { distanceKm: 0.2 }),
    ];

    expect(summarizeWeek(activities, WEDNESDAY).distanceKm).toBe(0.3);
  });

  it("classifies the tier and progress from the run count", () => {
    const four = Array.from({ length: 4 }, (_, index) => run(2026, 0, 12 + index));

    expect(summarizeWeek(four, WEDNESDAY).tier).toBe("power_runner");
    expect(summarizeWeek(four, WEDNESDAY).runsToUnlock).toBe(0);
    expect(summarizeWeek(four, WEDNESDAY).progressPct).toBe(100);

    const three = four.slice(0, 3);
    expect(summarizeWeek(three, WEDNESDAY).tier).toBe("standard");
    expect(summarizeWeek(three, WEDNESDAY).runsToUnlock).toBe(1);
    expect(summarizeWeek(three, WEDNESDAY).progressPct).toBe(75);
  });

  it("caps progress at 100 once past the threshold", () => {
    const six = Array.from({ length: 6 }, (_, index) => run(2026, 0, 12 + index));

    expect(summarizeWeek(six, WEDNESDAY).progressPct).toBe(100);
    expect(summarizeWeek(six, WEDNESDAY).runsToUnlock).toBe(0);
  });

  it("returns a zeroed recap for a week with no runs", () => {
    const recap = summarizeWeek([], WEDNESDAY);

    expect(recap.runCount).toBe(0);
    expect(recap.distanceKm).toBe(0);
    expect(recap.movingSeconds).toBe(0);
    expect(recap.streakWeeks).toBe(0);
    expect(recap.tier).toBe("standard");
    expect(recap.progressPct).toBe(0);
  });

  it("reports the week bounds it aggregated", () => {
    const recap = summarizeWeek([], WEDNESDAY);

    expect(recap.weekStart).toBe(new Date(2026, 0, 12).toISOString());
    expect(recap.weekEnd).toBe(new Date(2026, 0, 19).toISOString());
  });
});

describe("streakWeeksFor", () => {
  /** `count` runs spread across the Mon–Thu of the week starting `monday`. */
  function qualifyingWeek(monday: number, count = WEEKLY_RECAP_RUN_THRESHOLD) {
    return Array.from({ length: count }, (_, index) => run(2026, 0, monday + index));
  }

  it("is zero while the current week is still short of the threshold", () => {
    expect(streakWeeksFor(qualifyingWeek(12, 3), WEDNESDAY)).toBe(0);
  });

  it("counts the current week once it qualifies", () => {
    expect(streakWeeksFor(qualifyingWeek(12), WEDNESDAY)).toBe(1);
  });

  it("extends across consecutive qualifying weeks", () => {
    const activities = [...qualifyingWeek(12), ...qualifyingWeek(5), ...qualifyingWeek(-2)];

    expect(streakWeeksFor(activities, WEDNESDAY)).toBe(3);
  });

  it("stops at the first week that misses the threshold", () => {
    const activities = [
      ...qualifyingWeek(12),
      ...qualifyingWeek(5, 2), // gap week
      ...qualifyingWeek(-2),
    ];

    expect(streakWeeksFor(activities, WEDNESDAY)).toBe(1);
  });
});

describe("recapTier", () => {
  it("unlocks power_runner at the threshold", () => {
    expect(recapTier(3)).toBe("standard");
    expect(recapTier(4)).toBe("power_runner");
    expect(recapTier(9)).toBe("power_runner");
  });
});

describe("qualifiesForRecap", () => {
  const weekStart = new Date(2026, 0, 12).toISOString();

  it("fires on exactly the threshold run", () => {
    expect(qualifiesForRecap({ runCount: 4, weekStart })).toBe(true);
  });

  it("stays quiet before the threshold", () => {
    expect(qualifiesForRecap({ runCount: 3, weekStart })).toBe(false);
  });

  it("stays quiet for later runs in the same week, so the card is a moment not a banner", () => {
    expect(qualifiesForRecap({ runCount: 5, weekStart })).toBe(false);
    expect(qualifiesForRecap({ runCount: 9, weekStart })).toBe(false);
  });

  it("does not re-fire for a week already shown", () => {
    expect(qualifiesForRecap({ runCount: 4, weekStart }, weekStart)).toBe(false);
  });

  it("fires again once a new week reaches the threshold", () => {
    const previousWeek = new Date(2026, 0, 5).toISOString();

    expect(qualifiesForRecap({ runCount: 4, weekStart }, previousWeek)).toBe(true);
  });
});
