import type { ChallengeTracker } from "@/lib/mock-data";

export type ChallengeMeta = ChallengeTracker["challenge"];
export type ChallengeProgress = ChallengeTracker["progress"];
export type ChallengePace = ChallengeTracker["pace"];

/** Challenges score either distance or climbing, so read the right field. */
export function metricOf(
  activity: { distanceKm: number; elevationM: number },
  metricType: ChallengeMeta["metricType"],
) {
  return metricType === "elevation_m" ? activity.elevationM : activity.distanceKm;
}
