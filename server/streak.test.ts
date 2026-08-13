import { describe, expect, it } from "vitest";
import { computeMonthlyStreak, monthKey } from "./streak.js";

describe("monthKey", () => {
  it("formats as YYYY-MM in UTC", () => {
    expect(monthKey(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01");
    expect(monthKey(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12");
  });
});

describe("computeMonthlyStreak", () => {
  it("returns 0 when there is no activity in the current month", () => {
    const asOf = new Date("2026-04-15T00:00:00.000Z");
    expect(computeMonthlyStreak([new Date("2026-02-01T00:00:00.000Z")], asOf)).toBe(0);
  });

  it("counts a single month with an activity", () => {
    const asOf = new Date("2026-04-15T00:00:00.000Z");
    expect(computeMonthlyStreak([new Date("2026-04-01T00:00:00.000Z")], asOf)).toBe(1);
  });

  it("counts consecutive months ending at asOf's month", () => {
    const asOf = new Date("2026-04-15T00:00:00.000Z");
    const dates = [
      new Date("2026-04-10T00:00:00.000Z"),
      new Date("2026-03-05T00:00:00.000Z"),
      new Date("2026-02-20T00:00:00.000Z"),
    ];
    expect(computeMonthlyStreak(dates, asOf)).toBe(3);
  });

  it("stops at the first gap", () => {
    const asOf = new Date("2026-04-15T00:00:00.000Z");
    const dates = [
      new Date("2026-04-10T00:00:00.000Z"),
      new Date("2026-03-05T00:00:00.000Z"),
      // January is missing — February gap breaks the streak
      new Date("2026-01-20T00:00:00.000Z"),
    ];
    expect(computeMonthlyStreak(dates, asOf)).toBe(2);
  });

  it("handles a streak spanning a year boundary", () => {
    const asOf = new Date("2026-01-10T00:00:00.000Z");
    const dates = [
      new Date("2026-01-02T00:00:00.000Z"),
      new Date("2025-12-15T00:00:00.000Z"),
      new Date("2025-11-01T00:00:00.000Z"),
    ];
    expect(computeMonthlyStreak(dates, asOf)).toBe(3);
  });

  it("returns 0 for no activity dates at all", () => {
    expect(computeMonthlyStreak([], new Date("2026-04-15T00:00:00.000Z"))).toBe(0);
  });
});
