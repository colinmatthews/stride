// Pure badge earn/progress logic — no DB access, so it can be unit-tested and
// reused. The `badges` table stores only display metadata + the numeric target;
// the thresholds below are the source of truth for whether a badge is earned and
// what progress a locked badge shows.

/** The activity fields badge rules care about (a DB-agnostic subset). */
export type BadgeActivity = {
  sport: string;
  distanceKm: number;
  elevationM: number;
  movingSeconds: number;
  avgPaceSecPerKm: number | null;
  kudos: number;
  date: Date;
};

export type BadgeMetrics = {
  count: number;
  triCount: number;
  totalKudos: number;
  totalKm: number;
  totalElev: number;
  longestKm: number;
  hasSwim: boolean;
  streak: number;
  weekKm: number;
  weekElev: number;
  minRunPace: number | null;
  powerHourKm: number;
  earlyBirdCount: number;
  joinedChallenges: number;
};

export type BadgeRule = {
  id: string;
  earned: (m: BadgeMetrics) => boolean;
  /** Value for the progress UI on a locked badge (paired with badges.target). */
  current?: (m: BadgeMetrics) => number;
};

/** Longest run of consecutive calendar days with at least one activity. */
export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map((d) => d.slice(0, 10)))].sort();

  if (days.length === 0) {
    return 0;
  }

  let best = 1;
  let cur = 1;

  for (let i = 1; i < days.length; i += 1) {
    const gap = Math.round(
      (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86_400_000,
    );

    if (gap === 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else if (gap > 1) {
      cur = 1;
    }
  }

  return best;
}

/** Best rolling 7-day distance/elevation totals across the athlete's history. */
export function bestWeek(acts: { date: string; distanceKm: number; elevationM: number }[]) {
  const sorted = [...acts].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let km = 0;
  let elev = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    let wKm = 0;
    let wElev = 0;

    for (let j = i; j < sorted.length; j += 1) {
      const gap = (+new Date(sorted[j].date) - +new Date(sorted[i].date)) / 86_400_000;

      if (gap > 6) {
        break;
      }

      wKm += sorted[j].distanceKm;
      wElev += sorted[j].elevationM;
    }

    km = Math.max(km, wKm);
    elev = Math.max(elev, wElev);
  }

  return { km: Math.round(km), elev: Math.round(elev) };
}

export function deriveBadgeMetrics(rows: BadgeActivity[], joinedChallenges: number): BadgeMetrics {
  const sports = new Set(rows.map((row) => row.sport));
  const triCount = ["Run", "Swim", "Ride"].filter((sport) => sports.has(sport)).length;
  const week = bestWeek(
    rows.map((row) => ({
      date: row.date.toISOString(),
      distanceKm: row.distanceKm,
      elevationM: row.elevationM,
    })),
  );

  let minRunPace: number | null = null;
  let powerHourKm = 0;

  for (const row of rows) {
    if (row.sport === "Run" && row.avgPaceSecPerKm != null) {
      minRunPace =
        minRunPace === null ? row.avgPaceSecPerKm : Math.min(minRunPace, row.avgPaceSecPerKm);
    }

    if (row.sport === "Ride" && row.movingSeconds < 3600) {
      powerHourKm = Math.max(powerHourKm, row.distanceKm);
    }
  }

  return {
    count: rows.length,
    triCount,
    totalKudos: rows.reduce((total, row) => total + row.kudos, 0),
    totalKm: rows.reduce((total, row) => total + row.distanceKm, 0),
    totalElev: rows.reduce((total, row) => total + row.elevationM, 0),
    longestKm: rows.reduce((longest, row) => Math.max(longest, row.distanceKm), 0),
    hasSwim: sports.has("Swim"),
    streak: longestStreak(rows.map((row) => row.date.toISOString())),
    weekKm: week.km,
    weekElev: week.elev,
    minRunPace,
    powerHourKm: Math.round(powerHourKm),
    // No per-user timezone is stored, so "before 7am" is evaluated in UTC.
    earlyBirdCount: rows.filter((row) => row.date.getUTCHours() < 7).length,
    joinedChallenges,
  };
}

export const BADGE_RULES: BadgeRule[] = [
  { id: "first-activity", earned: (m) => m.count >= 1 },
  { id: "first-challenge", earned: (m) => m.joinedChallenges >= 1 },
  { id: "triathlete", earned: (m) => m.triCount >= 3, current: (m) => m.triCount },
  { id: "century-week", earned: (m) => m.weekKm >= 100, current: (m) => m.weekKm },
  { id: "kudos-magnet", earned: (m) => m.totalKudos >= 100, current: (m) => m.totalKudos },
  { id: "streak-10", earned: (m) => m.streak >= 10, current: (m) => m.streak },
  { id: "peak-week", earned: (m) => m.weekElev >= 5000, current: (m) => m.weekElev },
  { id: "early-bird", earned: (m) => m.earlyBirdCount >= 5, current: (m) => m.earlyBirdCount },
  { id: "dedicated", earned: (m) => m.count >= 10, current: (m) => m.count },
  { id: "polar-bear", earned: (m) => m.hasSwim },
  { id: "marathoner", earned: (m) => m.longestKm >= 42, current: (m) => Math.round(m.longestKm) },
  { id: "trailblazer", earned: (m) => m.totalKm >= 1000, current: (m) => Math.round(m.totalKm) },
  { id: "sky-high", earned: (m) => m.totalElev >= 25000, current: (m) => m.totalElev },
  {
    id: "speed-demon",
    earned: (m) => m.minRunPace !== null && m.minRunPace < 240,
    current: (m) => (m.minRunPace !== null && m.minRunPace < 240 ? 1 : 0),
  },
  { id: "power-hour", earned: (m) => m.powerHourKm >= 40, current: (m) => m.powerHourKm },
];

export function earnedBadgeIds(metrics: BadgeMetrics): string[] {
  return BADGE_RULES.filter((rule) => rule.earned(metrics)).map((rule) => rule.id);
}
