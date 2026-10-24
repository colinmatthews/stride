import type { MetricType } from "./seed.js";

export type ProgressChallenge = {
  sport: string;
  metricType: MetricType;
  /** Calendar date (YYYY-MM-DD); the challenge runs through the end of this day in UTC. */
  endsAt: string;
};

export type ProgressActivity = {
  sport: string;
  date: Date;
  distanceKm: number;
  elevationM: number;
};

export function challengeEndTime(endsAt: string) {
  return new Date(`${endsAt}T23:59:59.999Z`);
}

export function isChallengeEnded(endsAt: string, now: Date = new Date()) {
  return now.getTime() > challengeEndTime(endsAt).getTime();
}

export function activityCountsToward(
  challenge: ProgressChallenge,
  joinedAt: Date,
  activity: ProgressActivity,
) {
  if (challenge.sport !== "Multisport" && activity.sport !== challenge.sport) {
    return false;
  }

  const time = activity.date.getTime();
  return time >= joinedAt.getTime() && time <= challengeEndTime(challenge.endsAt).getTime();
}

export function activityContribution(challenge: ProgressChallenge, activity: ProgressActivity) {
  return challenge.metricType === "elevation_m" ? activity.elevationM : activity.distanceKm;
}

/**
 * Progress toward a challenge counts only activities of the challenge's sport
 * (any sport for Multisport) logged between joining and the end date.
 * Returns 0 when the athlete hasn't joined.
 */
export function computeChallengeProgress(
  challenge: ProgressChallenge,
  joinedAt: Date | null,
  activities: ProgressActivity[],
) {
  if (!joinedAt) {
    return 0;
  }

  const total = activities
    .filter((activity) => activityCountsToward(challenge, joinedAt, activity))
    .reduce((sum, activity) => sum + activityContribution(challenge, activity), 0);

  return challenge.metricType === "elevation_m" ? Math.round(total) : Number(total.toFixed(1));
}
