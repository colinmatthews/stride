import { describe, expect, it } from "vitest";
import {
  SPORT_ORDER,
  WEEKLY_CHALLENGE_GOALS_KM,
  WEEKLY_ROLLOVER_DAYS,
  activeChallengeWeek,
  isoDate,
  startOfWeek,
  weeklyChallengeId,
  weeklyChallengeSeeds,
} from "./weekly.js";

// August 2026: the 3rd is a Monday, the 7th a Friday, the 9th a Sunday.
// Dates are built in local time because the week boundaries are local.
const MONDAY = new Date(2026, 7, 3, 9, 0, 0);
const THURSDAY = new Date(2026, 7, 6, 9, 0, 0);
const FRIDAY = new Date(2026, 7, 7, 9, 0, 0);
const SUNDAY = new Date(2026, 7, 9, 23, 0, 0);

describe("startOfWeek", () => {
  it("returns Monday midnight for a mid-week date", () => {
    expect(isoDate(startOfWeek(THURSDAY))).toBe("2026-08-03");
    expect(startOfWeek(THURSDAY).getHours()).toBe(0);
  });

  it("returns the same day for a Monday", () => {
    expect(isoDate(startOfWeek(MONDAY))).toBe("2026-08-03");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(isoDate(startOfWeek(SUNDAY))).toBe("2026-08-03");
  });
});

describe("activeChallengeWeek", () => {
  it("offers the current week early in the week", () => {
    const week = activeChallengeWeek(MONDAY);

    expect(week.isNextWeek).toBe(false);
    expect(isoDate(week.start)).toBe("2026-08-03");
    expect(isoDate(week.end)).toBe("2026-08-09");
  });

  it("still offers the current week with three full days left", () => {
    const week = activeChallengeWeek(THURSDAY);

    expect(week.daysLeftInCurrentWeek).toBeGreaterThanOrEqual(WEEKLY_ROLLOVER_DAYS);
    expect(week.isNextWeek).toBe(false);
    expect(isoDate(week.start)).toBe("2026-08-03");
  });

  it("rolls forward to next week once under three days remain", () => {
    const week = activeChallengeWeek(FRIDAY);

    expect(week.daysLeftInCurrentWeek).toBeLessThan(WEEKLY_ROLLOVER_DAYS);
    expect(week.isNextWeek).toBe(true);
    expect(isoDate(week.start)).toBe("2026-08-10");
    expect(isoDate(week.end)).toBe("2026-08-16");
  });

  it("rolls forward on the final evening of the week", () => {
    const week = activeChallengeWeek(SUNDAY);

    expect(week.isNextWeek).toBe(true);
    expect(isoDate(week.start)).toBe("2026-08-10");
  });

  it("reports days left against the week the athlete landed in, not the offered one", () => {
    const week = activeChallengeWeek(FRIDAY);

    // Friday 09:00 → Sunday 23:59:59.999 is a bit under three days.
    expect(week.daysLeftInCurrentWeek).toBeGreaterThan(2);
    expect(week.daysLeftInCurrentWeek).toBeLessThan(3);
  });

  it("advances the week index by one per week", () => {
    expect(activeChallengeWeek(FRIDAY).index - activeChallengeWeek(MONDAY).index).toBe(1);
  });
});

describe("weeklyChallengeSeeds", () => {
  it("covers every sport, in order", () => {
    expect(weeklyChallengeSeeds(MONDAY).map((seed) => seed.sport)).toEqual(SPORT_ORDER);
  });

  it("sizes goals to the week-one p25 for each sport", () => {
    const goals = Object.fromEntries(
      weeklyChallengeSeeds(MONDAY).map((seed) => [seed.sport, seed.goalKm]),
    );

    expect(goals).toEqual({ Run: 20, Ride: 80, Swim: 2, Hike: 10, Walk: 3 });
    expect(goals).toEqual(WEEKLY_CHALLENGE_GOALS_KM);
  });

  it("spans the offered week", () => {
    for (const seed of weeklyChallengeSeeds(MONDAY)) {
      expect(seed.startsAt).toBe("2026-08-03");
      expect(seed.endsAt).toBe("2026-08-09");
      expect(seed.cadence).toBe("weekly");
      expect(seed.metricType).toBe("distance_km");
    }
  });

  it("produces stable ids for the same week so re-materializing is a no-op", () => {
    const first = weeklyChallengeSeeds(MONDAY);
    const second = weeklyChallengeSeeds(THURSDAY);

    expect(first.map((seed) => seed.id)).toEqual(second.map((seed) => seed.id));
    expect(first[0].id).toBe("weekly-run-2026-08-03");
    expect(first.map((seed) => seed.participants)).toEqual(second.map((seed) => seed.participants));
  });

  it("produces distinct ids across weeks", () => {
    const thisWeek = weeklyChallengeSeeds(MONDAY).map((seed) => seed.id);
    const rolledForward = weeklyChallengeSeeds(FRIDAY).map((seed) => seed.id);

    expect(rolledForward).toEqual([
      "weekly-run-2026-08-10",
      "weekly-ride-2026-08-10",
      "weekly-swim-2026-08-10",
      "weekly-hike-2026-08-10",
      "weekly-walk-2026-08-10",
    ]);
    expect(thisWeek.some((id) => rolledForward.includes(id))).toBe(false);
  });
});

describe("weeklyChallengeId", () => {
  it("is derived from sport and week start", () => {
    expect(weeklyChallengeId("Hike", new Date(2026, 7, 10))).toBe("weekly-hike-2026-08-10");
  });
});
