import { challengeEntries } from "./db/schema.js";

/**
 * Pure Starter Week rules. Deliberately free of any database import so the state
 * machine can be exercised directly, with no connection and no ambient clock.
 */

export const STARTER_WEEK_ID = "starter-week";
export const STARTER_WEEK_GOAL = 3;
export const STARTER_WEEK_DAYS = 7;

/** Day index (0-based, from enrolment) at which a behind-pace user gets nudged. */
export const NUDGE_FROM_DAY = 6;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type EntryRow = typeof challengeEntries.$inferSelect;

export type StarterWeekStatus = "not_enrolled" | "active" | "completed" | "expired";

export type StarterWeekState = {
  status: StarterWeekStatus;
  challengeId: string;
  goal: number;
  /** Number of qualifying activities logged inside the window. */
  progress: number;
  /** Whole days remaining in the window, floored at 0. */
  daysLeft: number;
  startedAt?: string;
  expiresAt?: string;
  completedAt?: string;
  attempt: number;
  /** Day 6 and still short of the goal — the in-app nudge should fire. */
  needsNudge: boolean;
  /** Completed but the celebration has not been shown yet. */
  celebrationPending: boolean;
  dismissed: boolean;
  /** The activities that counted, oldest first — drives the chips on the progress card. */
  qualifyingActivities: { id: string; sport: string; distanceKm: number; date: string }[];
  /** Roll-up shown on the celebration screen. */
  totals: { activities: number; distanceKm: number; movingSeconds: number };
};

export type WindowActivity = {
  id: string;
  sport: string;
  distanceKm: number;
  movingSeconds: number;
  date: string;
};

export const NOT_ENROLLED: StarterWeekState = {
  status: "not_enrolled",
  challengeId: STARTER_WEEK_ID,
  goal: STARTER_WEEK_GOAL,
  progress: 0,
  daysLeft: STARTER_WEEK_DAYS,
  attempt: 0,
  needsNudge: false,
  celebrationPending: false,
  dismissed: false,
  qualifyingActivities: [],
  totals: { activities: 0, distanceKm: 0, movingSeconds: 0 },
};

export function windowEnd(entry: EntryRow) {
  return entry.expiresAt ?? new Date(entry.startedAt.getTime() + STARTER_WEEK_DAYS * DAY_MS);
}

/**
 * Derives state from an entry plus the activities inside its window. `now` is an
 * argument rather than a call to the clock so the day-6 nudge and expiry boundaries
 * are testable, and so a single read can't straddle two different "nows".
 *
 * Returns the state plus whichever status transition needs persisting, leaving the
 * write to the caller.
 */
export function deriveState(
  entry: EntryRow,
  activities: WindowActivity[],
  now: Date,
): { state: StarterWeekState; transition?: { status: string; completedAt?: Date } } {
  const expiresAt = windowEnd(entry);
  const progress = activities.length;

  let status = entry.status as Exclude<StarterWeekStatus, "not_enrolled">;
  let completedAt = entry.completedAt;
  let transition: { status: string; completedAt?: Date } | undefined;

  if (status === "active") {
    if (progress >= STARTER_WEEK_GOAL) {
      // Credit completion to the activity that got them there, not to read time.
      completedAt = new Date(activities[STARTER_WEEK_GOAL - 1].date);
      status = "completed";
      transition = { status, completedAt };
    } else if (now >= expiresAt) {
      status = "expired";
      transition = { status };
    }
  }

  const msLeft = expiresAt.getTime() - now.getTime();
  const dayIndex = Math.floor((now.getTime() - entry.startedAt.getTime()) / DAY_MS);
  const counted = activities.slice(0, STARTER_WEEK_GOAL);

  return {
    transition,
    state: {
      status,
      challengeId: STARTER_WEEK_ID,
      goal: STARTER_WEEK_GOAL,
      progress: Math.min(progress, STARTER_WEEK_GOAL),
      daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
      startedAt: entry.startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      attempt: entry.attempt,
      needsNudge: status === "active" && dayIndex >= NUDGE_FROM_DAY,
      celebrationPending: status === "completed" && entry.celebrationSeenAt === null,
      dismissed: entry.dismissedAt !== null,
      qualifyingActivities: counted.map(({ id, sport, distanceKm, date }) => ({
        id,
        sport,
        distanceKm,
        date,
      })),
      totals: {
        activities: counted.length,
        distanceKm: Number(counted.reduce((sum, a) => sum + a.distanceKm, 0).toFixed(2)),
        movingSeconds: counted.reduce((sum, a) => sum + a.movingSeconds, 0),
      },
    },
  };
}
