import { describe, expect, it } from "vitest";
import {
  dayOfMonth,
  daysBetween,
  fmtGoal,
  fmtProgress,
  monthIndex,
  monthIndexOf,
  monthLabel,
  monthShort,
  todayISO,
  windowLabel,
} from "./challenge-format";

const AUGUST = monthIndex(2026, 7);

describe("month labels", () => {
  it("matches the server's month index for the same date", () => {
    expect(monthIndexOf("2026-08-10")).toBe(AUGUST);
  });

  it("includes the year, since history spans more than one", () => {
    expect(monthLabel(AUGUST)).toBe("August 2026");
    expect(monthLabel(monthIndex(2027, 0))).toBe("January 2027");
  });

  it("abbreviates to three letters", () => {
    expect(monthShort(AUGUST)).toBe("Aug");
    expect(monthShort(monthIndex(2026, 8))).toBe("Sep");
  });
});

describe("windowLabel", () => {
  it("reads as the span of days in the month", () => {
    expect(windowLabel("2026-08-01", "2026-08-31")).toBe("1–31 Aug");
  });

  it("uses the real month length", () => {
    expect(windowLabel("2026-02-01", "2026-02-28")).toBe("1–28 Feb");
    expect(windowLabel("2028-02-01", "2028-02-29")).toBe("1–29 Feb");
  });

  it("pulls the day out without timezone drift", () => {
    expect(dayOfMonth("2026-08-05")).toBe(5);
    expect(dayOfMonth("2026-08-31")).toBe(31);
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-08-10", "2026-08-31")).toBe(21);
  });

  it("is zero on the final day", () => {
    expect(daysBetween("2026-08-31", "2026-08-31")).toBe(0);
  });

  it("goes negative once the end date has passed", () => {
    expect(daysBetween("2026-09-02", "2026-08-31")).toBe(-2);
  });

  it("is unaffected by a month boundary", () => {
    expect(daysBetween("2026-08-30", "2026-09-02")).toBe(3);
  });
});

describe("formatting a goal", () => {
  it("shows kilometres to one decimal of progress", () => {
    expect(fmtGoal(65, "km")).toBe("65 km");
    expect(fmtProgress(31.62, "km")).toBe("31.6");
    expect(fmtProgress(0, "km")).toBe("0.0");
  });

  it("shows elevation as whole, grouped metres", () => {
    expect(fmtGoal(4000, "m")).toBe("4,000 m");
    expect(fmtProgress(4235.7, "m")).toBe("4,236");
  });
});

describe("todayISO", () => {
  it("returns a UTC calendar date, matching the server", () => {
    expect(todayISO(new Date("2026-08-10T23:30:00Z"))).toBe("2026-08-10");
    expect(todayISO(new Date("2026-08-10T00:00:01Z"))).toBe("2026-08-10");
  });
});
