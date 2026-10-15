import { describe, expect, it } from "vitest";
import {
  checkInDecision,
  checkInStatus,
  cohortFor,
  dayOf,
  evaluateGoalTracker,
  type TrackerRecord,
} from "./goal-tracker.js";

const DAY = 86_400_000;
const registeredAt = new Date("2026-10-01T15:00:00Z");
const onDay = (day: number, hours = 2) =>
  new Date(registeredAt.getTime() + (day - 1) * DAY + hours * 3_600_000);
const fresh: TrackerRecord = {
  checkInSentAt: null,
  checkInDismissedAt: null,
  completedSeenAt: null,
};
const sent: TrackerRecord = { ...fresh, checkInSentAt: onDay(4) };

function activitiesOn(days: number[]) {
  return days.map((day, index) => ({
    id: `a${index}`,
    sport: "Walk",
    title: `Walk ${index}`,
    date: onDay(day, 1 + index * 0.1),
  }));
}

function evaluate(day: number, activityDays: number[], record = fresh) {
  return evaluateGoalTracker({
    registeredAt,
    now: onDay(day, 3),
    activities: activitiesOn(activityDays),
    record,
  });
}

describe("dayOf", () => {
  it("counts 24-hour days from registration, starting at day 1", () => {
    expect(dayOf(registeredAt, registeredAt)).toBe(1);
    expect(dayOf(registeredAt, new Date(registeredAt.getTime() + DAY - 1))).toBe(1);
    expect(dayOf(registeredAt, new Date(registeredAt.getTime() + DAY))).toBe(2);
    expect(dayOf(registeredAt, onDay(14))).toBe(14);
  });
});

describe("cohortFor", () => {
  it("assigns the same athlete to the same cohort every time", () => {
    expect(cohortFor("user-123")).toBe(cohortFor("user-123"));
  });

  it("splits athletes roughly in half", () => {
    const treatment = Array.from({ length: 2000 }, (_, i) => cohortFor(`user-${i}`)).filter(
      (cohort) => cohort === "treatment",
    ).length;
    expect(treatment).toBeGreaterThan(900);
    expect(treatment).toBeLessThan(1100);
  });
});

describe("checkInDecision", () => {
  it("sends when nothing has been logged yet", () => {
    expect(checkInDecision([])).toEqual({ send: true, reason: "nothing_logged" });
  });

  it("sends when the athlete has been quiet since day 1", () => {
    expect(checkInDecision([1])).toEqual({ send: true, reason: "quiet" });
  });

  it("skips when the athlete logged in the 48 hours before day 4", () => {
    expect(checkInDecision([1, 2]).send).toBe(false);
    expect(checkInDecision([3]).send).toBe(false);
  });

  it("skips when the goal is already met before day 4", () => {
    expect(checkInDecision([1, 1, 1, 1, 1])).toEqual({ send: false, reason: "goal_met" });
  });

  it("ignores activity on or after day 4 when deciding", () => {
    expect(checkInDecision([1, 4]).send).toBe(true);
  });
});

describe("check-in delivery", () => {
  it("is not sent before day 4", () => {
    expect(evaluate(3, [1]).markCheckInSent).toBe(false);
  });

  it("is sent on day 4 to a quiet athlete and shows in the feed", () => {
    const result = evaluate(4, [1]);
    expect(result.markCheckInSent).toBe(true);
    expect(result.view?.checkIn).toBe("open");
    expect(result.view?.checkInSent).toBe(true);
  });

  it("can still go out on days 5 and 6 if the athlete first opens Stride then", () => {
    expect(evaluate(6, []).markCheckInSent).toBe(true);
    expect(evaluate(7, []).markCheckInSent).toBe(false);
  });

  it("is never sent twice", () => {
    const result = evaluate(5, [1], sent);
    expect(result.markCheckInSent).toBe(false);
    expect(result.view?.checkIn).toBe("open");
  });

  it("is not sent to an athlete who logged recently", () => {
    const result = evaluate(4, [1, 3]);
    expect(result.markCheckInSent).toBe(false);
    expect(result.view?.checkIn).toBe("none");
  });
});

describe("checkInStatus", () => {
  it("retires after three unanswered days", () => {
    expect(checkInStatus(6, [1], sent)).toBe("open");
    expect(checkInStatus(7, [1], sent)).toBe("none");
  });

  it("shows the answered state on the day the athlete logs, then retires", () => {
    expect(checkInStatus(5, [1, 5], sent)).toBe("answered");
    expect(checkInStatus(6, [1, 5], sent)).toBe("none");
  });

  it("stays hidden once dismissed", () => {
    expect(checkInStatus(4, [1], { ...sent, checkInDismissedAt: onDay(4) })).toBe("none");
  });
});

describe("evaluateGoalTracker", () => {
  it("counts every activity in the window, regardless of size", () => {
    const view = evaluate(3, [1, 2, 2]).view;
    expect(view?.count).toBe(3);
    expect(view?.loggedDays).toEqual([1, 2]);
    expect(view?.logged.map((entry) => entry.day)).toEqual([1, 2, 2]);
  });

  it("ignores activities from before registration", () => {
    const result = evaluateGoalTracker({
      registeredAt,
      now: onDay(2),
      activities: [
        { id: "old", sport: "Run", title: "Old", date: new Date(registeredAt.getTime() - DAY) },
      ],
      record: fresh,
    });
    expect(result.view?.count).toBe(0);
  });

  it("shows completion once, then hides the tracker", () => {
    const first = evaluate(6, [1, 2, 3, 4, 5]);
    expect(first.markCompletedSeen).toBe(true);
    expect(first.view?.completed).toBe(true);
    expect(first.view?.checkIn).toBe("none");

    const later = evaluate(7, [1, 2, 3, 4, 5], { ...fresh, completedSeenAt: onDay(6) });
    expect(later.view).toBeNull();
  });

  it("sends no check-in to an athlete who reached 5", () => {
    expect(evaluate(4, [1, 1, 2, 3, 3]).markCheckInSent).toBe(false);
  });

  it("closes after day 14", () => {
    expect(evaluate(14, [1]).view?.day).toBe(14);
    expect(evaluate(15, [1]).view).toBeNull();
  });

  it("reports the window end two weeks after registration", () => {
    expect(evaluate(1, []).view?.endsAt).toBe("2026-10-15T15:00:00.000Z");
  });
});
