import { describe, expect, it } from "vitest";
import {
  HabitInputError,
  buildFourWeekProgress,
  buildHabitRecommendation,
  buildPlanWeekTargets,
  getRecoveryOpportunity,
  normalizeTimeZone,
  shouldOfferConsistencyPlan,
  startOfIsoWeek,
  toDateKey,
  validateHabitPlanInput,
  type HabitActivity,
} from "../../server/habit-logic";

function activity(id: string, date: string, distanceKm = 5): HabitActivity {
  return { id, date: new Date(date), distanceKm };
}

describe("consistency plan eligibility", () => {
  it("offers the plan only after the first activity when no plan exists", () => {
    expect(shouldOfferConsistencyPlan(0, false)).toBe(true);
    expect(shouldOfferConsistencyPlan(1, false)).toBe(false);
    expect(shouldOfferConsistencyPlan(0, true)).toBe(false);
  });
});

describe("habit plan validation", () => {
  it("accepts a target with the same number of unique valid days", () => {
    expect(validateHabitPlanInput({ weeklyTarget: 3, plannedDays: ["tue", "thu", "sat"] })).toEqual(
      { weeklyTarget: 3, plannedDays: ["tue", "thu", "sat"] },
    );
  });

  it("rejects duplicate, invalid, or mismatched planned days", () => {
    expect(() =>
      validateHabitPlanInput({ weeklyTarget: 3, plannedDays: ["tue", "tue", "someday"] }),
    ).toThrow(HabitInputError);
    expect(() => validateHabitPlanInput({ weeklyTarget: 5, plannedDays: [] })).toThrow(
      "between 2 and 4",
    );
  });
});

describe("habit recommendation", () => {
  it("uses four prior weeks and excludes the source activity", () => {
    const activities = [
      activity("w1", "2026-06-23T12:00:00Z", 5),
      activity("w2a", "2026-06-30T12:00:00Z", 6),
      activity("w2b", "2026-07-02T12:00:00Z", 4),
      activity("w3a", "2026-07-07T12:00:00Z", 5),
      activity("w3b", "2026-07-09T12:00:00Z", 5),
      activity("w3c", "2026-07-11T12:00:00Z", 8),
      activity("w4a", "2026-07-14T12:00:00Z", 5),
      activity("w4b", "2026-07-16T12:00:00Z", 5),
      activity("source", "2026-07-21T12:00:00Z", 10),
    ];

    const result = buildHabitRecommendation(activities, "source", new Date("2026-07-21T12:00:00Z"));

    expect(result.baselineWeeks.map((week) => week.count)).toEqual([1, 2, 3, 2]);
    expect(result.totalActivities).toBe(8);
    expect(result.weeklyTarget).toBe(2);
    expect(result.plannedDays).toHaveLength(2);
  });
});

describe("four-week tracking and recovery", () => {
  it("marks completed and missed weeks without resetting later progress", () => {
    const result = buildFourWeekProgress(
      "2026-07-06",
      [2, 2, 2, 2],
      [
        activity("one", "2026-07-06T09:00:00Z"),
        activity("two", "2026-07-09T09:00:00Z"),
        activity("three", "2026-07-14T09:00:00Z"),
        activity("four", "2026-07-20T09:00:00Z"),
      ],
      new Date("2026-07-22T12:00:00Z"),
    );

    expect(result.map((week) => week.status)).toEqual([
      "complete",
      "missed",
      "in_progress",
      "upcoming",
    ]);
    expect(result.map((week) => week.count)).toEqual([2, 1, 1, 0]);
    expect(result.map((week) => week.isCurrent)).toEqual([false, false, true, false]);
  });

  it("preserves completed-week targets when the active plan is edited", () => {
    expect(
      buildPlanWeekTargets({
        weeklyTarget: 2,
        now: new Date("2026-07-22T12:00:00Z"),
        timeZone: "UTC",
        existingPlanStartsOn: "2026-07-06",
        existingWeekTargets: [4, 3, 3, 3],
        existingWeeklyTarget: 3,
      }),
    ).toEqual({
      planStartsOn: "2026-07-06",
      weekTargets: [4, 3, 2, 2],
      restarted: false,
    });
  });

  it("starts a fresh four-week cycle after the previous cycle expires", () => {
    expect(
      buildPlanWeekTargets({
        weeklyTarget: 3,
        now: new Date("2026-08-10T12:00:00Z"),
        timeZone: "UTC",
        existingPlanStartsOn: "2026-07-06",
        existingWeekTargets: [2, 2, 2, 2],
        existingWeeklyTarget: 2,
      }),
    ).toEqual({
      planStartsOn: "2026-08-10",
      weekTargets: [3, 3, 3, 3],
      restarted: true,
    });
  });

  it("offers future recovery days after a missed planned day", () => {
    const result = getRecoveryOpportunity({
      planStartsOn: "2026-07-20",
      plannedDays: ["mon", "wed", "sat"],
      weeklyTarget: 3,
      activities: [],
      now: new Date("2026-07-23T12:00:00Z"),
      recovery: null,
    });

    expect(result?.missedDay).toBe("mon");
    expect(result?.options).toContain("fri");
    expect(result?.options).not.toContain("sat");
  });

  it("preserves a saved recovery choice for the active week", () => {
    const result = getRecoveryOpportunity({
      planStartsOn: "2026-07-20",
      plannedDays: ["mon", "wed", "sat"],
      weeklyTarget: 3,
      activities: [],
      now: new Date("2026-07-23T12:00:00Z"),
      recovery: { weekStartsOn: "2026-07-20", missedDay: "mon", recoveryDay: "fri" },
    });

    expect(result?.recoveryDay).toBe("fri");
    expect(result?.missedDay).toBe("mon");
  });
});

describe("athlete-local calendar boundaries", () => {
  it("keeps a Sunday-night Toronto activity in the Sunday week", () => {
    const sundayNight = new Date("2026-07-06T02:00:00Z");
    const weekStart = startOfIsoWeek(sundayNight, "America/Toronto");

    expect(toDateKey(weekStart, "America/Toronto")).toBe("2026-06-29");
  });

  it("handles daylight-saving changes without shifting the local week", () => {
    const weekStart = startOfIsoWeek(new Date("2026-03-10T12:00:00Z"), "America/Toronto");

    expect(toDateKey(weekStart, "America/Toronto")).toBe("2026-03-09");
    expect(weekStart.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("rejects invalid IANA timezones", () => {
    expect(() => normalizeTimeZone("Mars/Olympus_Mons")).toThrow(HabitInputError);
  });
});
