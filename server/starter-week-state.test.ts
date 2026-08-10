import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  STARTER_WEEK_GOAL,
  deriveState,
  windowEnd,
  type EntryRow,
  type WindowActivity,
} from "./starter-week-state.js";

const START = new Date("2026-06-01T09:00:00.000Z");

function entry(overrides: Partial<EntryRow> = {}): EntryRow {
  return {
    id: "entry-1",
    userId: "user-1",
    challengeId: "starter-week",
    attempt: 1,
    startedAt: START,
    expiresAt: new Date(START.getTime() + 7 * DAY_MS),
    status: "active",
    completedAt: null,
    celebrationSeenAt: null,
    dismissedAt: null,
    createdAt: START,
    ...overrides,
  };
}

/** `dayOffset` is days after enrolment, so tests read like the user's week. */
function activity(dayOffset: number, overrides: Partial<WindowActivity> = {}): WindowActivity {
  return {
    id: `act-${dayOffset}`,
    sport: "Run",
    distanceKm: 5,
    movingSeconds: 1800,
    date: new Date(START.getTime() + dayOffset * DAY_MS).toISOString(),
    ...overrides,
  };
}

const at = (dayOffset: number) => new Date(START.getTime() + dayOffset * DAY_MS);

describe("deriveState", () => {
  it("stays active and reports progress mid-week", () => {
    const { state, transition } = deriveState(entry(), [activity(0), activity(2)], at(3));

    expect(state.status).toBe("active");
    expect(state.progress).toBe(2);
    expect(state.daysLeft).toBe(4);
    expect(state.needsNudge).toBe(false);
    expect(transition).toBeUndefined();
  });

  it("completes on the goal-th activity and credits that activity's timestamp", () => {
    const activities = [activity(0), activity(1), activity(4)];
    const { state, transition } = deriveState(entry(), activities, at(5));

    expect(state.status).toBe("completed");
    expect(state.progress).toBe(STARTER_WEEK_GOAL);
    // Not read time (day 5) — the third activity landed on day 4.
    expect(state.completedAt).toBe(activities[2].date);
    expect(transition).toEqual({ status: "completed", completedAt: new Date(activities[2].date) });
  });

  it("counts only the first goal-many activities in the totals", () => {
    const activities = [activity(0), activity(1), activity(2), activity(3)];
    const { state } = deriveState(entry(), activities, at(4));

    expect(state.progress).toBe(3);
    expect(state.totals.activities).toBe(3);
    expect(state.totals.distanceKm).toBe(15);
    expect(state.qualifyingActivities).toHaveLength(3);
  });

  describe("the day-6 nudge boundary", () => {
    it("does not fire on day 5", () => {
      expect(deriveState(entry(), [activity(0)], at(5)).state.needsNudge).toBe(false);
    });

    it("fires once day 6 is reached", () => {
      expect(deriveState(entry(), [activity(0)], at(6)).state.needsNudge).toBe(true);
    });

    it("does not fire for someone who already finished", () => {
      const { state } = deriveState(entry(), [activity(0), activity(1), activity(2)], at(6));

      expect(state.status).toBe("completed");
      expect(state.needsNudge).toBe(false);
    });
  });

  describe("the expiry boundary", () => {
    it("is still active one millisecond before the window closes", () => {
      const now = new Date(windowEnd(entry()).getTime() - 1);
      const { state, transition } = deriveState(entry(), [activity(0)], now);

      expect(state.status).toBe("active");
      expect(transition).toBeUndefined();
    });

    it("expires exactly at the window end", () => {
      const { state, transition } = deriveState(entry(), [activity(0)], windowEnd(entry()));

      expect(state.status).toBe("expired");
      expect(state.daysLeft).toBe(0);
      expect(transition).toEqual({ status: "expired" });
    });

    it("completes rather than expires when the goal was met inside the window", () => {
      const activities = [activity(0), activity(1), activity(2)];
      const { state } = deriveState(entry(), activities, at(30));

      expect(state.status).toBe("completed");
    });

    it("never reports negative days left once the window is long gone", () => {
      expect(deriveState(entry(), [], at(99)).state.daysLeft).toBe(0);
    });
  });

  describe("already-settled entries", () => {
    it("does not re-fire a transition for an entry already marked completed", () => {
      const settled = entry({ status: "completed", completedAt: at(2) });
      const { state, transition } = deriveState(
        settled,
        [activity(0), activity(1), activity(2)],
        at(4),
      );

      expect(state.status).toBe("completed");
      expect(transition).toBeUndefined();
    });

    it("keeps the celebration pending until it has been seen", () => {
      const activities = [activity(0), activity(1), activity(2)];

      expect(deriveState(entry(), activities, at(4)).state.celebrationPending).toBe(true);
      expect(
        deriveState(entry({ celebrationSeenAt: at(4) }), activities, at(4)).state
          .celebrationPending,
      ).toBe(false);
    });

    it("surfaces dismissal", () => {
      expect(deriveState(entry({ dismissedAt: at(1) }), [activity(0)], at(2)).state.dismissed).toBe(
        true,
      );
    });
  });

  describe("retries", () => {
    it("reports a fresh window for a second attempt", () => {
      const retryStart = at(10);
      const second = entry({
        id: "entry-2",
        attempt: 2,
        startedAt: retryStart,
        expiresAt: new Date(retryStart.getTime() + 7 * DAY_MS),
      });
      // The first attempt's activities fall outside the new window, so they don't carry over.
      const { state } = deriveState(second, [], retryStart);

      expect(state.attempt).toBe(2);
      expect(state.progress).toBe(0);
      expect(state.daysLeft).toBe(7);
      expect(state.status).toBe("active");
    });
  });

  it("falls back to a computed window end when expiresAt is missing", () => {
    const legacy = entry({ expiresAt: null });

    expect(windowEnd(legacy).toISOString()).toBe(
      new Date(START.getTime() + 7 * DAY_MS).toISOString(),
    );
    expect(deriveState(legacy, [activity(0)], at(8)).state.status).toBe("expired");
  });
});
