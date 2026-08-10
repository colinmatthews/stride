import type { Challenge } from "./mock-data";

export type ChallengeDifficulty = "Steady" | "Demanding" | "Advanced";

export interface ChallengeDecision {
  description: string;
  difficulty: ChallengeDifficulty;
  difficultyDetail: string;
  fit: string;
  fitReason: string;
  eligible: boolean;
  eligibility: string;
  countingRules: string[];
  daysRemaining: number;
}

const DAY_MS = 86_400_000;

export function challengeUnit(challenge: Challenge) {
  return challenge.metricType === "elevation_m" ? "m" : "km";
}

export function formatChallengeAmount(challenge: Challenge, value: number) {
  const fractionDigits = challenge.metricType === "elevation_m" ? 0 : value < 10 ? 1 : 0;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits })} ${challengeUnit(challenge)}`;
}

export function challengeDaysRemaining(endsAt: string, now = new Date()) {
  const deadline = new Date(`${endsAt}T23:59:59.999Z`).getTime();
  return Math.max(0, Math.ceil((deadline - now.getTime()) / DAY_MS));
}

export function isChallengeOpen(endsAt: string, now = new Date()) {
  return new Date(`${endsAt}T23:59:59.999Z`).getTime() >= now.getTime();
}

export function challengeDifficulty(challenge: Challenge): ChallengeDifficulty {
  if (challenge.metricType === "elevation_m") {
    if (challenge.goalKm >= 5_000) return "Advanced";
    if (challenge.goalKm >= 2_500) return "Demanding";
    return "Steady";
  }

  if (challenge.sport === "Swim") {
    if (challenge.goalKm >= 20) return "Advanced";
    if (challenge.goalKm >= 10) return "Demanding";
    return "Steady";
  }

  if (challenge.sport === "Ride") {
    if (challenge.goalKm >= 250) return "Advanced";
    if (challenge.goalKm >= 100) return "Demanding";
    return "Steady";
  }

  if (challenge.goalKm >= 100) return "Advanced";
  if (challenge.goalKm >= 40) return "Demanding";
  return "Steady";
}

export function buildChallengeDecision(challenge: Challenge, now = new Date()): ChallengeDecision {
  const open = isChallengeOpen(challenge.endsAt, now);
  const daysRemaining = challengeDaysRemaining(challenge.endsAt, now);
  const progress = Math.max(0, challenge.myProgressKm);
  const remaining = Math.max(0, challenge.goalKm - progress);
  const completion = challenge.goalKm > 0 ? progress / challenge.goalKm : 0;
  const requiredPerDay = daysRemaining > 0 ? remaining / daysRemaining : remaining;
  const difficulty = challengeDifficulty(challenge);

  let fit = "A fresh target";
  let fitReason = `No qualifying progress is recorded yet. Reaching the goal requires about ${formatChallengeAmount(challenge, requiredPerDay)} per day.`;

  if (!open) {
    fit = "Challenge closed";
    fitReason = `This challenge ended on ${formatDeadline(challenge.endsAt)}.`;
  } else if (completion >= 1) {
    fit = "Goal within reach";
    fitReason = `Your recorded ${challenge.sport.toLowerCase()} activity already meets this target.`;
  } else if (completion >= 0.5) {
    fit = "Strong fit";
    fitReason = `${formatChallengeAmount(challenge, progress)} is already recorded, with ${formatChallengeAmount(challenge, remaining)} left over ${daysRemaining} days.`;
  } else if (completion > 0) {
    fit = "Good stretch";
    fitReason = `${formatChallengeAmount(challenge, progress)} is recorded. The remaining pace is about ${formatChallengeAmount(challenge, requiredPerDay)} per day.`;
  }

  const metric = challenge.metricType === "elevation_m" ? "elevation" : "distance";
  const activityLabel = challenge.sport === "Multisport" ? "eligible" : challenge.sport;
  const description =
    challenge.metricType === "elevation_m"
      ? `Build climbing consistency by accumulating ${formatChallengeAmount(challenge, challenge.goalKm)} of elevation.`
      : `Build consistency by recording ${formatChallengeAmount(challenge, challenge.goalKm)} of ${challenge.sport.toLowerCase()} activity.`;

  return {
    description,
    difficulty,
    difficultyDetail: difficultyDescription(difficulty),
    fit,
    fitReason,
    eligible: open,
    eligibility: open
      ? "Eligible now — your signed-in Stride account can join this active challenge."
      : `This challenge ended on ${formatDeadline(challenge.endsAt)} and is no longer accepting entries.`,
    countingRules: [
      `${metric === "elevation" ? "Elevation" : "Distance"} from ${activityLabel} activities recorded in Stride counts automatically.`,
      `Activities must include positive ${metric} to contribute to the goal.`,
      `Qualifying activities saved by ${formatDeadline(challenge.endsAt)} are included in your progress.`,
    ],
    daysRemaining,
  };
}

export function formatDeadline(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function difficultyDescription(difficulty: ChallengeDifficulty) {
  if (difficulty === "Steady") return "A manageable target for a consistent training rhythm.";
  if (difficulty === "Demanding") return "A purposeful target that benefits from planned sessions.";
  return "A significant training target that benefits from deliberate pacing and recovery.";
}
