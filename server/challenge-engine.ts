import type { Sport } from "./seed.js";

/* ------------------------------------------------------------------ */
/* The supply engine.                                                   */
/*                                                                      */
/* A challenge used to be a hand-written row with an expiry date, so the */
/* shelf could only ever be as full as someone's manual effort — and     */
/* every row decayed to zero on a fixed date. A challenge is now an      */
/* *edition* minted from a recurring series. The shelf refills itself    */
/* every month with no human in the loop.                               */
/*                                                                      */
/* Two rules the rest of the feature leans on:                          */
/*   1. Every month has a full set of editions — the shelf can't empty.  */
/*   2. The engine mints exactly one month ahead. There is no "December" */
/*      to browse in August; upcoming means next month, nothing further. */
/* ------------------------------------------------------------------ */

export type ChallengeStatus = "active" | "upcoming" | "past";
export type ChallengeSource = "auto" | "mine";
export type GoalMetric = "distance" | "elevation";
export type Visibility = "public" | "friends" | "private";
export type Tier = "reach" | "push";

/** How many months of finished editions the shelf mints behind today. */
export const HISTORY_MONTHS = 4;
/** How far ahead the engine mints. One month, deliberately. */
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

/** Today as a UTC calendar date. The engine only ever works in whole days. */
export function todayISO(now: Date = new Date()) {
  return now.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Deterministic noise — a given edition mints to the same numbers on    */
/* every machine, so re-seeding never rewrites a goal an athlete has     */
/* already started chasing.                                             */
/* ------------------------------------------------------------------ */

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Series — one per sport the app tracks, each in two tiers.            */
/*                                                                      */
/* The engine mints both tiers of every sport, every month, with the    */
/* goal randomised inside the tier's band. "Reach" always lands under   */
/* 100; "Push" is the outsized one for people chasing a real number.    */
/* Randomising means August's target isn't July's, so a series stays a  */
/* fresh ask rather than the same wall you already failed once.         */
/* ------------------------------------------------------------------ */

export interface ChallengeSeries {
  id: string;
  sport: Sport;
  tier: Tier;
  /** Reads as "August Distance Run". */
  label: string;
  badge: string;
  metric: GoalMetric;
  /** Goal band. Reach bands are always wholly under 100. */
  goalMin: number;
  goalMax: number;
  /** Rounded to this step so goals read like targets, not measurements. */
  goalStep: number;
  blurb: string;
}

export const SEEDED_SERIES: ChallengeSeries[] = [
  {
    id: "run-reach",
    sport: "Run",
    tier: "reach",
    label: "Distance Run",
    badge: "RUN",
    metric: "distance",
    goalMin: 30,
    goalMax: 95,
    goalStep: 5,
    blurb: "Every run this month counts. Chip away at it.",
  },
  {
    id: "run-push",
    sport: "Run",
    tier: "push",
    label: "Ultra Run",
    badge: "ULTRA",
    metric: "distance",
    goalMin: 160,
    goalMax: 320,
    goalStep: 10,
    blurb: "A month of serious volume. Not for a casual week.",
  },
  {
    id: "ride-reach",
    sport: "Ride",
    tier: "reach",
    label: "Distance Ride",
    badge: "RIDE",
    metric: "distance",
    goalMin: 40,
    goalMax: 95,
    goalStep: 5,
    blurb: "A few good rides gets you there.",
  },
  {
    id: "ride-push",
    sport: "Ride",
    tier: "push",
    label: "Big Miles Ride",
    badge: "BIG",
    metric: "distance",
    goalMin: 450,
    goalMax: 1100,
    goalStep: 25,
    blurb: "Weekend century territory, repeated.",
  },
  {
    id: "walk-reach",
    sport: "Walk",
    tier: "reach",
    label: "Walk Streak",
    badge: "WALK",
    metric: "distance",
    goalMin: 25,
    goalMax: 90,
    goalStep: 5,
    blurb: "Neighbourhood loops count. All of them.",
  },
  {
    id: "walk-push",
    sport: "Walk",
    tier: "push",
    label: "Long Way Round",
    badge: "TREK",
    metric: "distance",
    goalMin: 130,
    goalMax: 260,
    goalStep: 10,
    blurb: "On your feet most days, for a month.",
  },
  {
    id: "swim-reach",
    sport: "Swim",
    tier: "reach",
    label: "Swim Block",
    badge: "SWIM",
    metric: "distance",
    goalMin: 8,
    goalMax: 40,
    goalStep: 2,
    blurb: "Pool or open water, it all adds up.",
  },
  {
    id: "swim-push",
    sport: "Swim",
    tier: "push",
    label: "Deep Water",
    badge: "DEEP",
    metric: "distance",
    goalMin: 60,
    goalMax: 140,
    goalStep: 5,
    blurb: "Serious yardage. Bring a spare pair of goggles.",
  },
  {
    id: "hike-reach",
    sport: "Hike",
    tier: "reach",
    label: "Trail Time",
    badge: "TRAIL",
    metric: "distance",
    goalMin: 20,
    goalMax: 80,
    goalStep: 5,
    blurb: "Get out on the trails this month.",
  },
  {
    id: "hike-push",
    sport: "Hike",
    tier: "push",
    label: "Summit Push",
    badge: "PEAK",
    metric: "elevation",
    goalMin: 3000,
    goalMax: 7000,
    goalStep: 250,
    blurb: "Back-to-back big days on the hill.",
  },
];

/* ------------------------------------------------------------------ */
/* Editions                                                            */
/* ------------------------------------------------------------------ */

export interface MintedEdition {
  id: string;
  seriesId: string;
  name: string;
  sport: Sport;
  metric: GoalMetric;
  goal: number;
  badge: string;
  blurb: string;
  startsAt: string;
  endsAt: string;
  monthIdx: number;
  source: ChallengeSource;
  visibility: Visibility;
  participants: number;
}

/** Pick this month's goal from the series' band, on a readable step. */
export function goalFor(series: ChallengeSeries, monthIdx: number) {
  const rand = mulberry32(hash(`goal:${series.id}:${monthIdx}`));
  const span = (series.goalMax - series.goalMin) / series.goalStep;
  return series.goalMin + Math.round(rand() * span) * series.goalStep;
}

/**
 * A headline participant count. Editions that haven't started yet carry only
 * the athletes who pre-joined, so the number stays plausible rather than
 * claiming 170,000 people have already finished next month's run.
 */
export function participantsFor(series: ChallengeSeries, monthIdx: number, isFuture: boolean) {
  const rand = mulberry32(hash(`participants:${series.id}:${monthIdx}`));
  const base = 18_000 + Math.floor(rand() * 165_000);
  return isFuture ? Math.floor(base * (0.04 + rand() * 0.05)) : base;
}

export function mintOne(
  series: ChallengeSeries,
  monthIdx: number,
  currentMonthIdx: number,
): MintedEdition {
  return {
    id: `${series.id}-${monthIdx}`,
    seriesId: series.id,
    name: `${monthName(monthIdx)} ${series.label}`,
    sport: series.sport,
    metric: series.metric,
    goal: goalFor(series, monthIdx),
    badge: series.badge,
    blurb: series.blurb,
    startsAt: firstDay(monthIdx),
    endsAt: lastDay(monthIdx),
    monthIdx,
    source: "auto",
    visibility: "public",
    participants: participantsFor(series, monthIdx, monthIdx > currentMonthIdx),
  };
}

/**
 * Mint every series for one month. This is the whole fix: it runs without
 * anyone watching, so the shelf is never empty and never stale.
 */
export function mintMonth(
  monthIdx: number,
  currentMonthIdx: number,
  series: ChallengeSeries[] = SEEDED_SERIES,
): MintedEdition[] {
  return series.map((entry) => mintOne(entry, monthIdx, currentMonthIdx));
}

/**
 * Every month the shelf should hold on a given day: the trailing history
 * window, the current month, and — deliberately — exactly one month ahead.
 */
export function shelfMonths(today: string) {
  const current = monthIndexOf(today);
  const months: number[] = [];

  for (let idx = current - HISTORY_MONTHS; idx <= current + HORIZON_MONTHS; idx += 1) {
    months.push(idx);
  }

  return months;
}

/** The full set of editions the engine owes for a given day. */
export function mintShelf(today: string, series: ChallengeSeries[] = SEEDED_SERIES) {
  const current = monthIndexOf(today);

  return shelfMonths(today).flatMap((idx) => mintMonth(idx, current, series));
}

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
/* Progress is never stored on the edition — it's summed from real       */
/* activities inside the edition's window. That's what makes a newly     */
/* minted challenge start counting the moment the month turns.          */
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
 * Sum the athlete's own effort inside the edition window. Buckets are keyed
 * `sport:monthIdx` — editions run over whole calendar months, so a month
 * bucket is exactly the window.
 */
export function progressFor(
  edition: { sport: Sport; metric: GoalMetric; goal: number; monthIdx: number },
  buckets: Map<string, EffortBucket>,
): Progress {
  const bucket = buckets.get(`${edition.sport}:${edition.monthIdx}`);
  const raw = bucket ? (edition.metric === "elevation" ? bucket.elevationM : bucket.distanceKm) : 0;
  const rounded = Math.round(raw * 10) / 10;
  const complete = rounded >= edition.goal;

  return {
    // A challenge completes once — banking 380% of a 30 km goal isn't a thing,
    // so the bar and the readout both stop at the goal.
    total: complete ? edition.goal : rounded,
    pct: Math.min(100, (rounded / edition.goal) * 100),
    activities: bucket?.activities ?? 0,
    lastDate: bucket?.lastDate ?? null,
    complete,
  };
}
