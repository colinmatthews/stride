/**
 * Weekly per-sport challenges.
 *
 * Open to every athlete, not just new accounts. Each goal is sized to the
 * week-one p25 for that sport, so roughly three quarters of athletes clear it.
 * Weeks run Monday → Sunday. Athletes who land with less than
 * WEEKLY_ROLLOVER_DAYS left in the current week are offered next week's
 * challenge instead of a stub of the one already closing.
 *
 * This module is pure: no database, no clock of its own. The server is the
 * authority on which week is active — the client renders whatever bootstrap
 * hands it, so a browser in another timezone (or with a skewed clock) can't
 * materialize a week of its own.
 */

export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

export const SPORT_ORDER: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];

/** Week-one p25 distance per sport, in km. */
export const WEEKLY_CHALLENGE_GOALS_KM: Record<Sport, number> = {
  Run: 20,
  Ride: 80,
  Swim: 2,
  Hike: 10,
  Walk: 3,
};

/**
 * Baseline participant counts a fresh week opens with. Real joins increment on
 * top of these; see ensureWeeklyChallenges in data.ts.
 */
const WEEKLY_CHALLENGE_PARTICIPANTS: Record<Sport, number> = {
  Run: 128400,
  Ride: 74200,
  Swim: 12900,
  Hike: 31800,
  Walk: 26500,
};

/** Below this many days left, an arriving athlete is offered next week instead. */
export const WEEKLY_ROLLOVER_DAYS = 3;

export const WEEKLY_CADENCE = "weekly";

const DAY_MS = 86400000;

export interface ChallengeWeek {
  /** Stable index used to seed deterministic participant baselines. */
  index: number;
  start: Date;
  end: Date;
  /** Days remaining in the week the athlete actually landed in. */
  daysLeftInCurrentWeek: number;
  /** True when the current week was too far gone and we rolled forward. */
  isNextWeek: boolean;
}

export interface WeeklyChallengeSeed {
  id: string;
  name: string;
  sport: Sport;
  goalKm: number;
  participants: number;
  startsAt: string;
  endsAt: string;
  badge: string;
  metricType: "distance_km";
  cadence: typeof WEEKLY_CADENCE;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday 00:00 of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return addDays(start, -((start.getDay() + 6) % 7));
}

export function isoDate(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fmtDayMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function rnd(seed: number) {
  let current = seed;
  return () => {
    current = (current * 9301 + 49297) % 233280;
    return current / 233280;
  };
}

/**
 * The week an athlete arriving at `now` should be offered. Rolls forward when
 * the current week has less than WEEKLY_ROLLOVER_DAYS left, so a Friday
 * registrant isn't handed a challenge that closes on Sunday.
 */
export function activeChallengeWeek(now: Date = new Date()): ChallengeWeek {
  const currentStart = startOfWeek(now);
  const currentEnd = new Date(addDays(currentStart, 7).getTime() - 1);
  const daysLeftInCurrentWeek = (currentEnd.getTime() - now.getTime()) / DAY_MS;
  const isNextWeek = daysLeftInCurrentWeek < WEEKLY_ROLLOVER_DAYS;

  const start = isNextWeek ? addDays(currentStart, 7) : currentStart;
  const end = new Date(addDays(start, 7).getTime() - 1);

  return {
    index: Math.round(start.getTime() / (7 * DAY_MS)),
    start,
    end,
    daysLeftInCurrentWeek,
    isNextWeek,
  };
}

/** Deterministic challenge id for a sport in a given week. */
export function weeklyChallengeId(sport: Sport, weekStart: Date): string {
  return `weekly-${sport.toLowerCase()}-${isoDate(weekStart)}`;
}

/** The five rows that back the active week. Deterministic for a given week. */
export function weeklyChallengeSeeds(now: Date = new Date()): WeeklyChallengeSeed[] {
  const week = activeChallengeWeek(now);

  return SPORT_ORDER.map((sport, index) => {
    const random = rnd(week.index * 31 + index * 7 + 5);
    const base = WEEKLY_CHALLENGE_PARTICIPANTS[sport];

    return {
      id: weeklyChallengeId(sport, week.start),
      name: `Week of ${fmtDayMonth(week.start)}`,
      sport,
      goalKm: WEEKLY_CHALLENGE_GOALS_KM[sport],
      participants: Math.round(base * (0.92 + random() * 0.16)),
      startsAt: isoDate(week.start),
      endsAt: isoDate(week.end),
      badge: sport.toUpperCase(),
      metricType: "distance_km" as const,
      cadence: WEEKLY_CADENCE,
    };
  });
}
