import { describe, expect, it } from "vitest";
import {
  buildSignals,
  compareQueue,
  dormantPath,
  draftMessage,
  isFlagged,
  nextMonday,
  resolveQueueStatus,
  startOfWeekUtc,
  summarizeFade,
  windowStart,
  type LatestAction,
} from "./retention.js";

const NOW = new Date("2026-10-15T12:00:00Z"); // a Thursday
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function action(overrides: Partial<LatestAction>): LatestAction {
  return {
    action: "contacted",
    channel: "Email",
    note: null,
    snoozedUntil: null,
    createdAt: daysAgo(1),
    ...overrides,
  };
}

describe("week boundaries", () => {
  it("starts weeks on Monday 00:00 UTC", () => {
    expect(startOfWeekUtc(NOW).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(startOfWeekUtc(new Date("2026-10-18T23:59:00Z")).toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });

  it("covers the last 12 completed weeks and snoozes until next Monday", () => {
    expect(windowStart(NOW).toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(nextMonday(NOW).toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
});

describe("flag rule", () => {
  it("flags an athlete whose last 28 days are at most half of the 28 before", () => {
    // prior28 = 4+4+4+4 = 16, last28 = 2+2+2+2 = 8 → exactly half
    expect(isFlagged([4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2, 2])).toBe(true);
  });

  it("does not flag a drop smaller than half", () => {
    // prior28 = 16, last28 = 9
    expect(isFlagged([4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 2, 2])).toBe(false);
  });

  it("does not flag athletes with no sessions in the prior 28 days", () => {
    expect(isFlagged([3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
  });

  it("rejects the wrong number of weeks", () => {
    expect(() => summarizeFade([1, 2, 3])).toThrow(/12 weeks/);
  });
});

describe("fade window", () => {
  it("measures the drop and how far into the fade the athlete is", () => {
    const summary = summarizeFade([5, 5, 5, 5, 5, 5, 4, 3, 2, 1, 1, 0]);
    expect(summary.prior28).toBe(17);
    expect(summary.last28).toBe(4);
    expect(summary.drop).toBeCloseTo(1 - 4 / 17);
    expect(summary.baseline).toBe(4.6);
    // Weeks below 75% of 4.6 (3.45), newest first: 0,1,1,2,3 → 5 weeks, then 4 stops it.
    expect(summary.fadeWeeksAgo).toBe(5);
    expect(summary.weeksLeft).toBe(3);
  });

  it("draws the dormant path from the start of the fade", () => {
    expect(dormantPath(4, 3)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 2.8, 2, 1.6]);
  });

  it("caps the fade at the 8-week window and floors it at 1 week", () => {
    expect(summarizeFade([9, 9, 9, 9, 9, 9, 9, 9, 0, 0, 0, 0]).fadeWeeksAgo).toBe(4);
    expect(summarizeFade([1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]).fadeWeeksAgo).toBe(4);
    expect(summarizeFade([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]).fadeWeeksAgo).toBe(1);
    expect(summarizeFade([8, 8, 8, 8, 8, 1, 1, 1, 1, 1, 1, 1]).weeksLeft).toBe(1);
  });
});

describe("queue status", () => {
  it("is new with no action or after a reopen", () => {
    expect(resolveQueueStatus(null, null, NOW)).toBe("new");
    expect(resolveQueueStatus(action({ action: "reopened" }), null, NOW)).toBe("new");
  });

  it("keeps snoozed athletes out until the snooze ends", () => {
    expect(
      resolveQueueStatus(action({ action: "snoozed", snoozedUntil: nextMonday(NOW) }), null, NOW),
    ).toBe("snoozed");
    expect(
      resolveQueueStatus(action({ action: "snoozed", snoozedUntil: daysAgo(1) }), null, NOW),
    ).toBe("new");
  });

  it("returns contacted athletes to the queue after 7 quiet days", () => {
    expect(resolveQueueStatus(action({ createdAt: daysAgo(3) }), null, NOW)).toBe("contacted");
    expect(resolveQueueStatus(action({ createdAt: daysAgo(8) }), daysAgo(20), NOW)).toBe("new");
    // ...unless they've logged an activity since being contacted.
    expect(resolveQueueStatus(action({ createdAt: daysAgo(8) }), daysAgo(2), NOW)).toBe(
      "contacted",
    );
  });

  it("keeps cleared athletes out for one 28-day cycle", () => {
    expect(
      resolveQueueStatus(action({ action: "dismissed", createdAt: daysAgo(10) }), null, NOW),
    ).toBe("dismissed");
    expect(
      resolveQueueStatus(action({ action: "dismissed", createdAt: daysAgo(30) }), null, NOW),
    ).toBe("new");
  });
});

describe("signals", () => {
  it("lists only signals backed by data", () => {
    expect(
      buildSignals({
        plan: "premium",
        renewsInDays: 12,
        lastActiveDaysAgo: 9,
        lastKudoGivenDaysAgo: 30,
        clubCount: 0,
      }),
    ).toEqual([
      "Premium renews in 12 days",
      "No activity in 9 days",
      "Stopped giving kudos 4 weeks ago",
      "Not in any club",
    ]);
  });

  it("stays quiet for recent, engaged athletes", () => {
    expect(
      buildSignals({
        plan: "premium",
        renewsInDays: 200,
        lastActiveDaysAgo: 2,
        lastKudoGivenDaysAgo: 3,
        clubCount: 2,
      }),
    ).toEqual([]);
  });
});

describe("drafts and sorting", () => {
  const athlete = {
    name: "Maya Lindqvist",
    city: "Stockholm",
    sport: "Run" as const,
    baseline: 4,
    lastWeek: 1,
  };

  it("drafts a check-in and a call script", () => {
    expect(draftMessage(athlete, "Email")).toMatch(/^Hi Maya — we noticed your runs/);
    expect(draftMessage(athlete, "Coach call")).toBe(
      "Call Maya (Stockholm). Opener: their runs dropped from ~4/wk to 1 last week. Ask what changed — injury, schedule, motivation — and offer a 3-week rebuild block or a plan pause.",
    );
  });

  it("sorts by closing window, steepest drop, or soonest renewal", () => {
    const a = { weeksLeft: 1, drop: 0.5, renewsInDays: null };
    const b = { weeksLeft: 3, drop: 0.9, renewsInDays: 10 };
    expect([b, a].sort((x, y) => compareQueue("window", x, y))[0]).toBe(a);
    expect([a, b].sort((x, y) => compareQueue("drop", x, y))[0]).toBe(b);
    expect([a, b].sort((x, y) => compareQueue("renewal", x, y))[0]).toBe(b);
  });
});
