import type { Activity } from "./mock-data";

/** Mirrors `SaveSummary` in server/save-summary.ts. */
export type WeekBucket = {
  label: string;
  minutes: number;
  count: number;
  isCurrent: boolean;
};

export type Highlight = {
  id: string;
  label: string;
  detail: string;
};

export type ChallengeProgress = {
  id: string;
  name: string;
  unit: "km" | "m";
  before: number;
  after: number;
  goal: number;
};

export type SaveSummary = {
  activity: Activity;
  athleteFirstName: string;
  ordinal: number;
  sportOrdinal: number;
  streakDays: number;
  weeks: WeekBucket[];
  thisWeek: { count: number; minutes: number };
  lastWeek: { count: number; minutes: number };
  /** `paceValue` is sec/km, or km/h for rides. */
  averages: { distanceKm: number; paceValue: number; elevationM: number } | null;
  highlights: Highlight[];
  challenges: ChallengeProgress[];
};
