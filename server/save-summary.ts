import {
  activityContribution,
  activityCountsToward,
  computeChallengeProgress,
  isChallengeEnded,
  type ProgressActivity,
  type ProgressChallenge,
} from "./challenge-progress.js";
import type { ActivityDto } from "./data.js";

const DAY_MS = 86_400_000;
const WEEK_COUNT = 6;
export const SUMMARY_WINDOW_DAYS = WEEK_COUNT * 7;
const MAX_HIGHLIGHTS = 3;

export type WeekBucket = {
  label: string;
  minutes: number;
  count: number;
  isCurrent: boolean;
};

export type HighlightId = "first" | "longest" | "fastest" | "climb" | "busier" | "streak";

export type Highlight = {
  id: HighlightId;
  label: string;
  detail: string;
};

export type ChallengeProgressSummary = {
  id: string;
  name: string;
  unit: "km" | "m";
  before: number;
  after: number;
  goal: number;
};

export type SaveSummary = {
  activity: ActivityDto;
  athleteFirstName: string;
  ordinal: number;
  sportOrdinal: number;
  streakDays: number;
  weeks: WeekBucket[];
  thisWeek: { count: number; minutes: number };
  lastWeek: { count: number; minutes: number };
  averages: { distanceKm: number; paceValue: number; elevationM: number } | null;
  highlights: Highlight[];
  challenges: ChallengeProgressSummary[];
};

/** Aggregates over the athlete's earlier activities of the same sport (excluding this one). */
export type SameSportHistory = {
  count: number;
  avgDistanceKm: number;
  avgElevationM: number;
  avgPaceValue: number;
  maxDistanceKm: number;
  maxElevationM: number;
  /** Lowest sec/km, or highest km/h for rides. */
  bestPaceValue: number;
};

export type SummaryChallenge = ProgressChallenge & {
  id: string;
  name: string;
  goal: number;
  joinedAt: Date;
};

export type SaveSummaryInput = {
  activity: ActivityDto;
  athleteName: string;
  ordinal: number;
  /** The athlete's activities in the trailing window; may or may not include `activity`. */
  recentActivities: { id: string; date: Date; movingSeconds: number }[];
  sameSportHistory: SameSportHistory;
  challenges: SummaryChallenge[];
  challengeActivities: ProgressActivity[];
};

type PaceSource = Pick<
  ActivityDto,
  "sport" | "avgPaceSecPerKm" | "avgSpeedKmh" | "distanceKm" | "movingSeconds"
>;

/** Sec/km for most sports; km/h for rides. Mirrors the SQL expression in the loader. */
export function paceValueOf(activity: PaceSource) {
  if (activity.sport === "Ride") {
    return (
      activity.avgSpeedKmh ?? activity.distanceKm / (Math.max(1, activity.movingSeconds) / 3600)
    );
  }
  return activity.avgPaceSecPerKm ?? activity.movingSeconds / Math.max(0.01, activity.distanceKm);
}

/** True when `a` is a better pace than `b` for the sport. */
export function fasterThan(sport: string, a: number, b: number) {
  return sport === "Ride" ? a > b : a < b;
}

export function sportNoun(sport: string) {
  return sport === "Ride"
    ? "ride"
    : sport === "Swim"
      ? "swim"
      : sport === "Hike"
        ? "hike"
        : sport === "Walk"
          ? "walk"
          : "run";
}

export function resolveTimeZone(timeZone: unknown) {
  if (typeof timeZone !== "string" || !timeZone) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function dayKeyFormatter(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (date: Date) => formatter.format(date);
}

function previousDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - DAY_MS).toISOString().slice(0, 10);
}

export function buildSaveSummary(
  input: SaveSummaryInput,
  options: { timeZone?: string } = {},
): SaveSummary {
  const timeZone = resolveTimeZone(options.timeZone);
  const { activity, sameSportHistory: history } = input;
  const now = new Date(activity.date).getTime();
  const all = [
    { id: activity.id, date: new Date(activity.date), movingSeconds: activity.movingSeconds },
    ...input.recentActivities.filter(
      (entry) => entry.id !== activity.id && entry.date.getTime() <= now,
    ),
  ];

  const weekLabel = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  const weeks: WeekBucket[] = Array.from({ length: WEEK_COUNT }, (_, index) => {
    const offset = WEEK_COUNT - 1 - index;
    const end = now - offset * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = all.filter((entry) => {
      const time = entry.date.getTime();
      return time > start && time <= end;
    });
    return {
      label: offset === 0 ? "This wk" : weekLabel.format(new Date(start + DAY_MS)),
      minutes: Math.round(inWeek.reduce((sum, entry) => sum + entry.movingSeconds, 0) / 60),
      count: inWeek.length,
      isCurrent: offset === 0,
    };
  });

  const toDayKey = dayKeyFormatter(timeZone);
  const activeDays = new Set(all.map((entry) => toDayKey(entry.date)));
  let streakDays = 0;
  for (let key = toDayKey(new Date(now)); activeDays.has(key); key = previousDayKey(key)) {
    streakDays += 1;
  }

  const noun = sportNoun(activity.sport);
  const pace = paceValueOf(activity);
  const highlights: Highlight[] = [];

  if (history.count === 0) {
    highlights.push({
      id: "first",
      label: `First ${noun}`,
      detail: `Your first ${noun} on Stride`,
    });
  } else {
    if (activity.distanceKm > history.maxDistanceKm) {
      highlights.push({
        id: "longest",
        label: `Longest ${noun}`,
        detail: `Beats your previous best of ${history.maxDistanceKm.toFixed(1)} km`,
      });
    }
    if (fasterThan(activity.sport, pace, history.bestPaceValue)) {
      highlights.push({
        id: "fastest",
        label: `Fastest ${noun}`,
        detail: `Quicker than all ${history.count} previous ${noun}s`,
      });
    }
    if (activity.sport !== "Swim" && activity.elevationM > history.maxElevationM) {
      highlights.push({
        id: "climb",
        label: "Most climbing",
        detail: `${activity.elevationM} m tops your ${history.maxElevationM} m best`,
      });
    }
  }

  const thisWeek = weeks[WEEK_COUNT - 1];
  const lastWeek = weeks[WEEK_COUNT - 2];
  if (thisWeek.count > lastWeek.count) {
    highlights.push({
      id: "busier",
      label: "Busier week",
      detail: `${thisWeek.count} activities vs ${lastWeek.count} last week`,
    });
  }
  if (streakDays >= 2) {
    highlights.push({
      id: "streak",
      label: `${streakDays}-day streak`,
      detail: "Back-to-back days active",
    });
  }

  const progressActivity: ProgressActivity = {
    sport: activity.sport,
    date: new Date(activity.date),
    distanceKm: activity.distanceKm,
    elevationM: activity.elevationM,
  };
  // Challenge activities carry no id, so "before" is everything strictly earlier than this one.
  const earlier = input.challengeActivities.filter((entry) => entry.date.getTime() < now);
  const challenges = input.challenges
    .filter(
      (challenge) =>
        !isChallengeEnded(challenge.endsAt, progressActivity.date) &&
        activityCountsToward(challenge, challenge.joinedAt, progressActivity) &&
        activityContribution(challenge, progressActivity) > 0,
    )
    .map((challenge) => {
      const before = computeChallengeProgress(challenge, challenge.joinedAt, earlier);
      const after = computeChallengeProgress(challenge, challenge.joinedAt, [
        ...earlier,
        progressActivity,
      ]);
      return {
        id: challenge.id,
        name: challenge.name,
        unit: challenge.metricType === "elevation_m" ? ("m" as const) : ("km" as const),
        before: Math.min(before, challenge.goal),
        after: Math.min(after, challenge.goal),
        goal: challenge.goal,
      };
    });

  return {
    activity,
    athleteFirstName: input.athleteName.trim().split(/\s+/)[0] ?? "",
    ordinal: input.ordinal,
    sportOrdinal: history.count + 1,
    streakDays,
    weeks,
    thisWeek: { count: thisWeek.count, minutes: thisWeek.minutes },
    lastWeek: { count: lastWeek.count, minutes: lastWeek.minutes },
    averages:
      history.count > 0
        ? {
            distanceKm: history.avgDistanceKm,
            paceValue: history.avgPaceValue,
            elevationM: history.avgElevationM,
          }
        : null,
    highlights: highlights.slice(0, MAX_HIGHLIGHTS),
    challenges,
  };
}
