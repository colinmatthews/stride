import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyActivityDay,
  dayKey,
  findMissedDate,
  habitProgress,
  habitWindowDays,
  isInWeekZero,
  shouldShowMissedReminder,
  type HabitCommitment,
  type HabitState,
} from "./habit";

function commitment(overrides: Partial<HabitCommitment> = {}): HabitCommitment {
  return {
    sport: "Run",
    distanceKm: 5,
    buddyId: null,
    targetActiveDays: 3,
    windowDays: 3,
    startedAt: "2025-06-01T12:00:00.000Z",
    activeDays: ["2025-06-01"],
    reminder: null,
    completedAt: null,
    ...overrides,
  };
}

function state(overrides: Partial<HabitState> = {}): HabitState {
  return {
    signupAt: "2025-06-01T08:00:00.000Z",
    firstActivityId: "act-1",
    firstActivityAt: "2025-06-01T12:00:00.000Z",
    commitment: commitment(),
    commitPromptPending: false,
    ...overrides,
  };
}

describe("dayKey", () => {
  it("formats local calendar dates as YYYY-MM-DD", () => {
    expect(dayKey(new Date("2025-06-01T15:30:00"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isInWeekZero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-04T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is true within 7 days of signup", () => {
    expect(isInWeekZero(state({ signupAt: "2025-06-01T08:00:00.000Z" }))).toBe(true);
  });

  it("is false after day 7", () => {
    expect(isInWeekZero(state({ signupAt: "2025-05-20T08:00:00.000Z" }))).toBe(false);
  });
});

describe("habitProgress", () => {
  it("returns zeros without a commitment", () => {
    expect(habitProgress(null)).toEqual({ done: 0, target: 3, pct: 0 });
  });

  it("caps percent at 100", () => {
    expect(habitProgress(commitment({ activeDays: ["a", "b", "c", "d"] }))).toEqual({
      done: 4,
      target: 3,
      pct: 100,
    });
  });
});

describe("habitWindowDays", () => {
  it("returns three calendar days from startedAt", () => {
    expect(habitWindowDays(commitment({ startedAt: "2025-06-01T12:00:00.000Z" }))).toEqual([
      "2025-06-01",
      "2025-06-02",
      "2025-06-03",
    ]);
  });
});

describe("findMissedDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-03T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("finds the first past window day without activity", () => {
    expect(findMissedDate("2025-06-01T12:00:00.000Z", ["2025-06-01"])).toBe("2025-06-02");
  });

  it("returns null when no past days are missing", () => {
    expect(findMissedDate("2025-06-01T12:00:00.000Z", ["2025-06-01", "2025-06-02"])).toBeNull();
  });
});

describe("applyActivityDay", () => {
  it("adds a new active day and dismisses reminder", () => {
    const next = applyActivityDay(
      commitment({
        reminder: {
          channel: "in_app",
          missedDate: "2025-06-02",
          sentAt: "2025-06-03T08:00:00.000Z",
          dismissed: false,
        },
      }),
      "2025-06-03T10:00:00.000Z",
    );

    expect(next.activeDays).toContain("2025-06-03");
    expect(next.reminder?.dismissed).toBe(true);
    expect(next.completedAt).toBeNull();
  });

  it("marks completion at three active days", () => {
    const next = applyActivityDay(
      commitment({ activeDays: ["2025-06-01", "2025-06-02"] }),
      "2025-06-03T10:00:00.000Z",
    );

    expect(next.activeDays).toHaveLength(3);
    expect(next.completedAt).toBe("2025-06-03T10:00:00.000Z");
  });
});

describe("shouldShowMissedReminder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-03T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows when an undismissed reminder exists in week 0", () => {
    expect(
      shouldShowMissedReminder(
        state({
          commitment: commitment({
            reminder: {
              channel: "in_app",
              missedDate: "2025-06-02",
              sentAt: "2025-06-03T08:00:00.000Z",
              dismissed: false,
            },
          }),
        }),
      ),
    ).toBe(true);
  });

  it("hides when the habit is already completed", () => {
    expect(
      shouldShowMissedReminder(
        state({
          commitment: commitment({
            completedAt: "2025-06-03T09:00:00.000Z",
            activeDays: ["2025-06-01", "2025-06-02", "2025-06-03"],
            reminder: {
              channel: "in_app",
              missedDate: "2025-06-02",
              sentAt: "2025-06-03T08:00:00.000Z",
              dismissed: false,
            },
          }),
        }),
      ),
    ).toBe(false);
  });
});
