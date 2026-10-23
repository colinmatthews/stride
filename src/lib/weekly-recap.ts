import { addWeeks, startOfWeek } from "date-fns";

/**
 * Weekly Recap — the share moment that fires when a runner logs their Nth run
 * of a calendar week (Mon–Sun).
 *
 * All week maths happen in the *caller's* local timezone. `users` has no
 * timezone column and `activities.date` is written with the server clock, so
 * the browser is the only place that knows what "this week" means to a runner.
 * The client resolves the week boundaries and hands them to the API as
 * absolute instants — see `fetchWeeklyRecap` in ./api.
 */

/** Runs needed in one week to unlock the recap card. */
export const WEEKLY_RECAP_RUN_THRESHOLD = 4;

/** Monday. `date-fns` weekday indexes are 0=Sunday. */
export const WEEK_STARTS_ON = 1 as const;

/** Widest window the API will aggregate, as a guard on client-supplied bounds. */
export const MAX_WEEK_RANGE_MS = 8 * 24 * 60 * 60 * 1000;

export type RecapActivity = {
  sport: string;
  date: string | Date;
  distanceKm: number;
  movingSeconds: number;
};

export type WeekRange = {
  /** Inclusive start of the week, local time. */
  start: Date;
  /** Exclusive end of the week, local time. */
  end: Date;
};

/**
 * Two tiers, per the prototype's "Recap Tiers" spec frame: the standard recap
 * is always shareable, and Power Runner unlocks on the 4th run and adds the
 * gold award banner.
 */
export type RecapTier = "standard" | "power_runner";

export type WeeklyRecap = {
  weekStart: string;
  weekEnd: string;
  runCount: number;
  distanceKm: number;
  movingSeconds: number;
  /** Consecutive weeks (this one included) that each hit the run threshold. */
  streakWeeks: number;
  tier: RecapTier;
  /** Runs still needed to unlock Power Runner. 0 once unlocked. */
  runsToUnlock: number;
  /** 0–100, clamped. Drives the rail's progress bar. */
  progressPct: number;
};

export function recapTier(
  runCount: number,
  threshold: number = WEEKLY_RECAP_RUN_THRESHOLD,
): RecapTier {
  return runCount >= threshold ? "power_runner" : "standard";
}

/**
 * The Mon–Sun week containing `reference`, as a half-open `[start, end)` range
 * so an activity logged at 23:59:59.999 Sunday still lands inside it.
 */
export function weekRangeFor(reference: Date | string | number): WeekRange {
  const start = startOfWeek(new Date(reference), { weekStartsOn: WEEK_STARTS_ON });
  start.setHours(0, 0, 0, 0);

  return { start, end: addWeeks(start, 1) };
}

/**
 * `activities.sport` is free text — there is no DB enum and no server-side
 * validation on POST /api/activities — so compare case-insensitively rather
 * than trusting an exact "Run".
 */
export function isRun(sport: string): boolean {
  return sport.trim().toLowerCase() === "run";
}

function withinRange(date: Date, range: WeekRange): boolean {
  const time = date.getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

/** Runs from `activities` that fall inside `range`. Non-run sports are excluded. */
export function runsInRange(activities: RecapActivity[], range: WeekRange): RecapActivity[] {
  return activities.filter((activity) => {
    if (!isRun(activity.sport)) {
      return false;
    }

    const date = new Date(activity.date);
    return !Number.isNaN(date.getTime()) && withinRange(date, range);
  });
}

/**
 * How many consecutive weeks, walking back from the week containing
 * `reference`, hit `threshold` runs. The reference week counts only if it
 * already qualifies, so a streak never claims credit for a week in progress.
 */
export function streakWeeksFor(
  activities: RecapActivity[],
  reference: Date | string | number,
  threshold: number = WEEKLY_RECAP_RUN_THRESHOLD,
): number {
  let streak = 0;
  let cursor = weekRangeFor(reference);

  // Bounded so a pathological dataset can't spin: 520 weeks is a decade.
  for (let index = 0; index < 520; index += 1) {
    if (runsInRange(activities, cursor).length < threshold) {
      return streak;
    }

    streak += 1;
    cursor = weekRangeFor(addWeeks(cursor.start, -1));
  }

  return streak;
}

/** Aggregate the Mon–Sun week containing `reference` into a shareable recap. */
export function summarizeWeek(
  activities: RecapActivity[],
  reference: Date | string | number = new Date(),
  threshold: number = WEEKLY_RECAP_RUN_THRESHOLD,
): WeeklyRecap {
  const range = weekRangeFor(reference);
  const runs = runsInRange(activities, range);

  const distanceKm = runs.reduce((total, run) => total + run.distanceKm, 0);
  const movingSeconds = runs.reduce((total, run) => total + run.movingSeconds, 0);

  return {
    weekStart: range.start.toISOString(),
    weekEnd: range.end.toISOString(),
    runCount: runs.length,
    // Distances are numeric(10,2) in Postgres; keep the sum to the same scale
    // so 3 runs of 5.05km read as 15.15, not 15.149999999999999.
    distanceKm: Math.round(distanceKm * 100) / 100,
    movingSeconds,
    streakWeeks: streakWeeksFor(activities, reference, threshold),
    tier: recapTier(runs.length, threshold),
    runsToUnlock: Math.max(threshold - runs.length, 0),
    progressPct: Math.min(Math.round((runs.length / threshold) * 100), 100),
  };
}

/**
 * Whether a just-logged run should surface the recap card.
 *
 * Deliberately fires on *exactly* the threshold rather than `>= threshold`:
 * the card is a moment, not a permanent banner, so runs 5 and 6 of the same
 * week stay quiet. `alreadyShownWeekStart` makes it idempotent across reloads
 * and re-saves.
 */
export function qualifiesForRecap(
  recap: Pick<WeeklyRecap, "runCount" | "weekStart">,
  alreadyShownWeekStart?: string | null,
  threshold: number = WEEKLY_RECAP_RUN_THRESHOLD,
): boolean {
  if (recap.runCount !== threshold) {
    return false;
  }

  return alreadyShownWeekStart !== recap.weekStart;
}
