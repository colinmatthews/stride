import type { Activity } from "./mock-data";

export const HABIT_DAYS = [
  { id: "mon", short: "M", label: "Monday" },
  { id: "tue", short: "T", label: "Tuesday" },
  { id: "wed", short: "W", label: "Wednesday" },
  { id: "thu", short: "T", label: "Thursday" },
  { id: "fri", short: "F", label: "Friday" },
  { id: "sat", short: "S", label: "Saturday" },
  { id: "sun", short: "S", label: "Sunday" },
] as const;

export type HabitDayId = (typeof HABIT_DAYS)[number]["id"];

export type HabitWeek = {
  label: string;
  start: string;
  count: number;
  distanceKm: number;
  target: number;
  isCurrent: boolean;
  status: "complete" | "missed" | "in_progress" | "upcoming";
};

export type HabitRecommendation = {
  baselineWeeks: Array<Omit<HabitWeek, "status" | "target" | "isCurrent">>;
  weeklyTarget: number;
  plannedDays: HabitDayId[];
  totalActivities: number;
  hasHistory: boolean;
};

export type EncouragementFriend = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
};

export type HabitRecovery = {
  weekStartsOn: string;
  missedDay: HabitDayId;
  recoveryDay: HabitDayId | null;
  options: HabitDayId[];
  remaining: number;
};

export type HabitPlan = {
  sourceActivityId: string;
  weeklyTarget: number;
  plannedDays: HabitDayId[];
  planStartsOn: string;
  encouragementFriendId: string | null;
  createdAt: string;
  updatedAt: string;
  timeZone: string;
  cycleStatus: "active" | "complete";
  progress: HabitWeek[];
  recovery: HabitRecovery | null;
  friend: EncouragementFriend | null;
};

export type HabitPlanState = {
  plan: HabitPlan | null;
  sourceActivity: Activity | null;
  recommendation: HabitRecommendation | null;
  friendCandidates: EncouragementFriend[];
  currentWeekActivities: Array<Pick<Activity, "id" | "title" | "sport" | "date" | "distanceKm">>;
};

export function habitDayLabel(id: string) {
  return HABIT_DAYS.find((day) => day.id === id)?.label ?? id;
}

export function goalFallbackDays(target: number): HabitDayId[] {
  return target === 2
    ? ["tue", "sat"]
    : target === 4
      ? ["mon", "wed", "fri", "sun"]
      : ["tue", "thu", "sat"];
}
