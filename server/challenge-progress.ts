/**
 * Pure challenge-progress calculations.
 *
 * Deliberately free of database and network access so the rules that decide
 * what counts toward a challenge can be tested directly. `data.ts` loads rows
 * and hands them to these functions.
 */

export type ChallengeMetric = "distance_km" | "elevation_m";

export type ContributionStatus = "counted" | "dismissed";

export interface ChallengeWindow {
  sport: string;
  metricType: ChallengeMetric;
  goal: number;
  startsAt: string;
  endsAt: string;
}

export interface CandidateActivity {
  id: string;
  athleteId: string;
  sport: string;
  title: string;
  date: string;
  distanceKm: number;
  elevationM: number;
}

export interface Contribution {
  activityId: string;
  status: ContributionStatus;
}

export interface RankedAthlete {
  athleteId: string;
  total: number;
  rank: number;
  weeklyRank: number;
  weeklyTotal: number;
  rankDelta: number;
}

/** Inclusive on both ends — a challenge counts activities logged on its final day. */
export function isWithinWindow(
  isoDate: string,
  window: Pick<ChallengeWindow, "startsAt" | "endsAt">,
) {
  const day = isoDate.slice(0, 10);
  return day >= window.startsAt && day <= window.endsAt;
}

export function metricValue(activity: CandidateActivity, metricType: ChallengeMetric) {
  return metricType === "elevation_m" ? activity.elevationM : activity.distanceKm;
}

/**
 * An activity qualifies on sport and date alone. Whether it *counts* is a
 * separate, user-driven decision — that is the point of the feature.
 */
export function qualifies(activity: CandidateActivity, window: ChallengeWindow) {
  return activity.sport === window.sport && isWithinWindow(activity.date, window);
}

export type ContributionRejection = "not_owner" | "sport_mismatch" | "outside_window";

/**
 * Decides whether an athlete may record a decision about an activity, returning
 * `null` when they may. Kept pure and separate from `data.ts` so the rules —
 * especially the ownership check, which is what stops an athlete counting a
 * rival's activity toward their own total — are directly testable without a
 * database.
 */
export function checkContributionEligibility(
  activity: Pick<CandidateActivity, "athleteId" | "sport" | "date">,
  window: ChallengeWindow,
  userId: string,
): ContributionRejection | null {
  if (activity.athleteId !== userId) {
    return "not_owner";
  }

  if (activity.sport !== window.sport) {
    return "sport_mismatch";
  }

  if (!isWithinWindow(activity.date, window)) {
    return "outside_window";
  }

  return null;
}

export function sumMetric(activities: CandidateActivity[], metricType: ChallengeMetric) {
  const total = activities.reduce((acc, activity) => acc + metricValue(activity, metricType), 0);
  return roundMetric(total);
}

/** Distances carry one decimal; elevation is whole metres. */
export function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

export interface ProgressSplit {
  counted: CandidateActivity[];
  pending: CandidateActivity[];
  dismissed: CandidateActivity[];
}

/**
 * Split a user's qualifying activities by confirmation state. Anything without
 * an explicit decision is pending, so newly synced activities surface without
 * a backfill.
 */
export function splitByStatus(
  activities: CandidateActivity[],
  contributions: Contribution[],
  window: ChallengeWindow,
): ProgressSplit {
  const statusById = new Map(contributions.map((row) => [row.activityId, row.status]));
  const split: ProgressSplit = { counted: [], pending: [], dismissed: [] };

  for (const activity of activities) {
    if (!qualifies(activity, window)) continue;

    const status = statusById.get(activity.id);

    if (status === "counted") split.counted.push(activity);
    else if (status === "dismissed") split.dismissed.push(activity);
    else split.pending.push(activity);
  }

  return split;
}

export interface ChallengeProgress {
  countedTotal: number;
  pendingTotal: number;
  goal: number;
  percentComplete: number;
  remaining: number;
  countedActivityCount: number;
  pendingActivityCount: number;
}

export function computeProgress(split: ProgressSplit, window: ChallengeWindow): ChallengeProgress {
  const countedTotal = sumMetric(split.counted, window.metricType);
  const pendingTotal = sumMetric(split.pending, window.metricType);

  return {
    countedTotal,
    pendingTotal,
    goal: window.goal,
    // Capped so an over-achieving athlete never renders a bar past 100%.
    percentComplete: window.goal > 0 ? Math.min(100, (countedTotal / window.goal) * 100) : 0,
    remaining: roundMetric(Math.max(0, window.goal - countedTotal)),
    countedActivityCount: split.counted.length,
    pendingActivityCount: split.pending.length,
  };
}

/**
 * Whole days remaining, counting today. A challenge ending today has one day
 * left, not zero, so the daily target never divides by zero mid-challenge.
 */
export function daysRemaining(window: Pick<ChallengeWindow, "endsAt">, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const end = Date.parse(`${window.endsAt}T00:00:00Z`);
  const start = Date.parse(`${today}T00:00:00Z`);
  const diff = Math.floor((end - start) / 86400000) + 1;
  return Math.max(0, diff);
}

export interface PaceProjection {
  dailyTarget: number;
  averagePerDay: number;
  onPace: boolean;
  daysLeft: number;
  daysElapsed: number;
}

/**
 * Compares the rate needed to finish against the rate achieved so far. Both
 * sides use counted totals only — pending activities are surfaced separately
 * so the athlete can see what confirming them would do.
 */
export function projectPace(
  progress: ChallengeProgress,
  window: ChallengeWindow,
  now: Date,
): PaceProjection {
  const daysLeft = daysRemaining(window, now);
  const today = now.toISOString().slice(0, 10);
  const startMs = Date.parse(`${window.startsAt}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const daysElapsed = Math.max(1, Math.floor((todayMs - startMs) / 86400000) + 1);

  const dailyTarget = daysLeft > 0 ? roundMetric(progress.remaining / daysLeft) : 0;
  const averagePerDay = roundMetric(progress.countedTotal / daysElapsed);

  return {
    dailyTarget,
    averagePerDay,
    onPace: averagePerDay >= dailyTarget,
    daysLeft,
    daysElapsed,
  };
}

/**
 * Ranks every athlete with qualifying activity, plus the current user even at
 * zero so they always see their own row.
 *
 * Other athletes are not confirmation-gated — only the current user confirms
 * their own activities — so their totals use all qualifying activity. The
 * caller passes the current user's *confirmed* activities via `selfCounted`,
 * and both the overall and 7-day figures are derived from that one list. An
 * earlier version passed a pre-summed total instead, which left the weekly
 * figure with no confirmation data to filter on and made it count pending
 * activity toward recent form.
 */
export function buildLeaderboard(
  activities: CandidateActivity[],
  window: ChallengeWindow,
  options: { selfId: string; selfCounted: CandidateActivity[]; now: Date },
): RankedAthlete[] {
  const weekStart = new Date(options.now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const totals = new Map<string, number>();
  const weekly = new Map<string, number>();

  for (const activity of activities) {
    if (!qualifies(activity, window)) continue;
    if (activity.athleteId === options.selfId) continue;

    const value = metricValue(activity, window.metricType);
    totals.set(activity.athleteId, (totals.get(activity.athleteId) ?? 0) + value);

    if (activity.date.slice(0, 10) >= weekStart) {
      weekly.set(activity.athleteId, (weekly.get(activity.athleteId) ?? 0) + value);
    }
  }

  const selfQualifying = options.selfCounted.filter((activity) => qualifies(activity, window));

  totals.set(options.selfId, sumMetric(selfQualifying, window.metricType));
  weekly.set(
    options.selfId,
    sumMetric(
      selfQualifying.filter((activity) => activity.date.slice(0, 10) >= weekStart),
      window.metricType,
    ),
  );

  const weeklyOrder = Array.from(totals.keys()).sort(
    (left, right) =>
      (weekly.get(right) ?? 0) - (weekly.get(left) ?? 0) || left.localeCompare(right),
  );
  const weeklyRankById = new Map(weeklyOrder.map((id, index) => [id, index + 1]));

  return Array.from(totals.entries())
    .sort(
      ([leftId, leftTotal], [rightId, rightTotal]) =>
        rightTotal - leftTotal || leftId.localeCompare(rightId),
    )
    .map(([athleteId, total], index) => {
      const rank = index + 1;
      const weeklyRank = weeklyRankById.get(athleteId) ?? rank;

      return {
        athleteId,
        total: roundMetric(total),
        rank,
        weeklyRank,
        weeklyTotal: roundMetric(weekly.get(athleteId) ?? 0),
        // Positive means the athlete is climbing: better over 7 days than overall.
        rankDelta: rank - weeklyRank,
      };
    });
}
