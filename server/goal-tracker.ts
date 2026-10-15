import { createHash } from "node:crypto";

// "Log 5 activities in your first two weeks." Day 1 is the first 24 hours after
// registration; the window closes after day 14.
export const GOAL = 5;
export const WINDOW_DAYS = 14;
export const CHECK_IN_DAY = 4;
// The in-feed check-in quietly retires if it goes unanswered for this many days.
export const CHECK_IN_TTL_DAYS = 3;

const DAY_MS = 86_400_000;
const COHORT_SALT = "first-five-v1";

export type Cohort = "treatment" | "holdout";
export type CheckInStatus = "none" | "open" | "answered";

export type TrackerActivity = { id: string; sport: string; title: string; date: Date };

export type TrackerRecord = {
  checkInSentAt: Date | null;
  checkInDismissedAt: Date | null;
  completedSeenAt: Date | null;
};

export type GoalTrackerView =
  | { cohort: "holdout"; day: number }
  | {
      cohort: "treatment";
      day: number;
      goal: number;
      windowDays: number;
      checkInDay: number;
      endsAt: string;
      count: number;
      logged: { id: string; sport: string; title: string; day: number }[];
      loggedDays: number[];
      latestTitle: string | null;
      checkIn: CheckInStatus;
      checkInSent: boolean;
      completed: boolean;
    };

// Stable 50/50 split so the 5-in-14 rate can be compared against a holdout.
export function cohortFor(userId: string): Cohort {
  const firstByte = createHash("sha256").update(`${COHORT_SALT}:${userId}`).digest()[0];
  return firstByte % 2 === 0 ? "treatment" : "holdout";
}

export function dayOf(registeredAt: Date, at: Date) {
  return Math.floor((at.getTime() - registeredAt.getTime()) / DAY_MS) + 1;
}

export function inWindow(registeredAt: Date, now: Date) {
  const day = dayOf(registeredAt, now);
  return day >= 1 && day <= WINDOW_DAYS;
}

// Decided against the morning of day 4: send only if the athlete is short of
// the goal and logged nothing on days 2-3 (the 48 hours before day 4).
export function checkInDecision(activityDays: number[]) {
  const before = activityDays.filter((day) => day >= 1 && day < CHECK_IN_DAY);

  if (before.length >= GOAL) return { send: false, reason: "goal_met" } as const;
  if (before.some((day) => day >= CHECK_IN_DAY - 2)) {
    return { send: false, reason: "logged_recently" } as const;
  }
  return { send: true, reason: before.length === 0 ? "nothing_logged" : "quiet" } as const;
}

// The check-in is only delivered in the feed, so it can go out the first time
// the athlete opens Stride during days 4-6. Once sent it is never sent again.
export function shouldSendCheckIn(day: number, activityDays: number[], record: TrackerRecord) {
  if (record.checkInSentAt) return false;
  if (day < CHECK_IN_DAY || day >= CHECK_IN_DAY + CHECK_IN_TTL_DAYS) return false;
  return checkInDecision(activityDays).send;
}

export function checkInStatus(
  day: number,
  activityDays: number[],
  record: TrackerRecord,
): CheckInStatus {
  if (!record.checkInSentAt || record.checkInDismissedAt) return "none";

  const answeredDay = Math.min(...activityDays.filter((d) => d >= CHECK_IN_DAY));

  if (Number.isFinite(answeredDay)) return answeredDay === day ? "answered" : "none";
  return day < CHECK_IN_DAY + CHECK_IN_TTL_DAYS ? "open" : "none";
}

export function evaluateGoalTracker(input: {
  registeredAt: Date;
  now: Date;
  activities: TrackerActivity[];
  record: TrackerRecord;
}) {
  const { registeredAt, now, record } = input;
  const day = dayOf(registeredAt, now);
  const activities = input.activities
    .map((activity) => ({ ...activity, day: dayOf(registeredAt, activity.date) }))
    .filter((activity) => activity.day >= 1 && activity.day <= WINDOW_DAYS)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const activityDays = activities.map((activity) => activity.day);
  const count = activities.length;

  // Reaching 5 shows the completion state once, then the tracker goes away.
  const completed = count >= GOAL;
  const markCompletedSeen = completed && !record.completedSeenAt;
  const hidden = (completed && !markCompletedSeen) || !inWindow(registeredAt, now);
  const markCheckInSent = !completed && !hidden && shouldSendCheckIn(day, activityDays, record);
  const effective = markCheckInSent ? { ...record, checkInSentAt: now } : record;

  return {
    markCheckInSent,
    markCompletedSeen,
    view: hidden
      ? null
      : {
          cohort: "treatment" as const,
          day,
          goal: GOAL,
          windowDays: WINDOW_DAYS,
          checkInDay: CHECK_IN_DAY,
          endsAt: new Date(registeredAt.getTime() + WINDOW_DAYS * DAY_MS).toISOString(),
          count,
          logged: activities
            .slice(0, GOAL)
            .map(({ id, sport, title, day: loggedDay }) => ({ id, sport, title, day: loggedDay })),
          loggedDays: [...new Set(activityDays)],
          latestTitle: activities.at(-1)?.title ?? null,
          checkIn: completed ? "none" : checkInStatus(day, activityDays, effective),
          checkInSent: Boolean(effective.checkInSentAt),
          completed,
        },
  };
}
