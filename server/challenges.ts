import type { Sport } from "./seed.js";

/* ------------------------------------------------------------------ */
/* Challenges an athlete made.                                          */
/*                                                                      */
/* A challenge runs over one whole calendar month. That single rule is   */
/* what makes the rest of this file small: the Active / Upcoming / Past  */
/* filter is derived from the month rather than stored, and progress is  */
/* summed from the athlete's activities in that month rather than kept   */
/* on the row and nursed into staying correct.                          */
/* ------------------------------------------------------------------ */

export type ChallengeStatus = "active" | "upcoming" | "past";
export type GoalMetric = "distance" | "elevation";
export type Visibility = "public" | "friends" | "private";

/**
 * How far ahead a challenge may be scheduled. One month: "Upcoming" is only
 * useful as a shortlist of what starts next, and a challenge someone set up
 * for next December would sit unreachable in that tab for a year.
 */
export const HORIZON_MONTHS = 1;

/* ------------------------------------------------------------------ */
/* Month arithmetic — months are a single integer so ranges are trivial. */
/* ------------------------------------------------------------------ */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthIndex(year: number, month0: number) {
  return year * 12 + month0;
}

export function monthIndexOf(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return monthIndex(year, month - 1);
}

export function monthName(idx: number) {
  return MONTHS[idx % 12];
}

function daysInMonth(idx: number) {
  return new Date(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 0)).getUTCDate();
}

function iso(year: number, month1: number, day: number) {
  return `${year}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function firstDay(idx: number) {
  return iso(Math.floor(idx / 12), (idx % 12) + 1, 1);
}

export function lastDay(idx: number) {
  return iso(Math.floor(idx / 12), (idx % 12) + 1, daysInMonth(idx));
}

/** Today as a UTC calendar date. Challenges only ever work in whole days. */
export function todayISO(now: Date = new Date()) {
  return now.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* The filter                                                          */
/* ------------------------------------------------------------------ */

export function statusOf(monthIdx: number, today: string): ChallengeStatus {
  const current = monthIndexOf(today);

  if (monthIdx < current) {
    return "past";
  }

  if (monthIdx > current) {
    return "upcoming";
  }

  return "active";
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/*                                                                      */
/* Progress is never stored on the challenge — it's summed from real     */
/* activities inside the challenge's window, so it cannot drift out of   */
/* agreement with the athlete's own log.                               */
/* ------------------------------------------------------------------ */

export interface EffortBucket {
  distanceKm: number;
  elevationM: number;
  activities: number;
  lastDate: string | null;
}

export interface Progress {
  total: number;
  pct: number;
  activities: number;
  lastDate: string | null;
  complete: boolean;
}

/**
 * Sum the athlete's own effort inside the challenge window. Buckets are keyed
 * `sport:monthIdx` — a challenge runs over a whole calendar month, so a month
 * bucket is exactly the window.
 */
export function progressFor(
  challenge: { sport: Sport; metric: GoalMetric; goal: number; monthIdx: number },
  buckets: Map<string, EffortBucket>,
): Progress {
  const bucket = buckets.get(`${challenge.sport}:${challenge.monthIdx}`);
  const raw = bucket
    ? challenge.metric === "elevation"
      ? bucket.elevationM
      : bucket.distanceKm
    : 0;
  const rounded = Math.round(raw * 10) / 10;
  const complete = rounded >= challenge.goal;

  return {
    // A challenge completes once — banking 380% of a 30 km goal isn't a thing,
    // so the bar and the readout both stop at the goal.
    total: complete ? challenge.goal : rounded,
    pct: Math.min(100, (rounded / challenge.goal) * 100),
    activities: bucket?.activities ?? 0,
    lastDate: bucket?.lastDate ?? null,
    complete,
  };
}

/* ------------------------------------------------------------------ */
/* Creating one                                                        */
/* ------------------------------------------------------------------ */

export const SPORTS: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];
export const VISIBILITIES: Visibility[] = ["public", "friends", "private"];

const MAX_GOAL = 100_000;

export interface ChallengeDraft {
  name: string;
  sport: Sport;
  metric: GoalMetric;
  goal: number;
  monthIdx: number;
  visibility: Visibility;
}

/**
 * Validate whatever the client sent. Kept as a pure function so the rules are
 * testable without a database, and so the server never trusts the form.
 */
export function parseChallengeDraft(
  input: {
    name?: unknown;
    sport?: unknown;
    metric?: unknown;
    goal?: unknown;
    monthIdx?: unknown;
    visibility?: unknown;
  },
  today: string,
): { ok: true; draft: ChallengeDraft } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Name must be between 2 and 80 characters" };
  }

  if (!SPORTS.includes(input.sport as Sport)) {
    return { ok: false, error: "Unknown sport" };
  }

  if (input.metric !== "distance" && input.metric !== "elevation") {
    return { ok: false, error: "Metric must be distance or elevation" };
  }

  const goal = Number(input.goal);

  if (!Number.isFinite(goal) || goal <= 0 || goal > MAX_GOAL) {
    return { ok: false, error: "Goal must be a positive number" };
  }

  if (!VISIBILITIES.includes(input.visibility as Visibility)) {
    return { ok: false, error: "Unknown visibility" };
  }

  const monthIdx = Number(input.monthIdx);
  const currentMonthIdx = monthIndexOf(today);

  if (
    !Number.isInteger(monthIdx) ||
    monthIdx < currentMonthIdx ||
    monthIdx > currentMonthIdx + HORIZON_MONTHS
  ) {
    return { ok: false, error: "A challenge can only run this month or next" };
  }

  return {
    ok: true,
    draft: {
      name,
      sport: input.sport as Sport,
      metric: input.metric,
      goal,
      monthIdx,
      visibility: input.visibility as Visibility,
    },
  };
}

/** A four-letter mark for the card. Falls back when a name has no letters. */
export function badgeFor(name: string) {
  return name.slice(0, 4).toUpperCase().trim() || "MINE";
}

export function blurbFor(visibility: Visibility) {
  switch (visibility) {
    case "private":
      return "Just for you.";
    case "friends":
      return "Open to people you follow.";
    default:
      return "Open to anyone on Stride.";
  }
}

/**
 * Whether `viewerId` is allowed to see a challenge.
 *
 * Public is public. Anything narrower is the author's to share: they always
 * see their own, and a friends-only challenge reaches the people who follow
 * them. Enforced server-side — visibility is access control, not a filter.
 */
export function canView(
  challenge: { visibility: string; createdBy: string },
  viewerId: string,
  followedIds: ReadonlySet<string>,
) {
  if (challenge.visibility === "public") {
    return true;
  }

  if (challenge.createdBy === viewerId) {
    return true;
  }

  return challenge.visibility === "friends" && followedIds.has(challenge.createdBy);
}
