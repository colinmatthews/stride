export const HABIT_DAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type HabitDayId = (typeof HABIT_DAY_IDS)[number];

export type HabitActivity = {
  id: string;
  date: Date;
  distanceKm: number;
};

export type HabitWeek = {
  label: string;
  start: string;
  count: number;
  distanceKm: number;
  status: "complete" | "missed" | "in_progress" | "upcoming";
};

export type HabitRecommendation = {
  baselineWeeks: Array<Omit<HabitWeek, "status">>;
  weeklyTarget: number;
  plannedDays: HabitDayId[];
  totalActivities: number;
  hasHistory: boolean;
};

export class HabitInputError extends Error {}

export function shouldOfferConsistencyPlan(existingActivityCount: number, hasPlan: boolean) {
  return existingActivityCount === 0 && !hasPlan;
}

export function validateHabitPlanInput(input: { weeklyTarget: unknown; plannedDays: unknown }) {
  const weeklyTarget = Number(input.weeklyTarget);
  const plannedDays = Array.isArray(input.plannedDays)
    ? input.plannedDays.map((day) => String(day).toLowerCase())
    : [];
  const uniqueDays = Array.from(new Set(plannedDays));

  if (!Number.isInteger(weeklyTarget) || weeklyTarget < 2 || weeklyTarget > 4) {
    throw new HabitInputError("Weekly target must be between 2 and 4 activities");
  }

  if (
    uniqueDays.length !== weeklyTarget ||
    uniqueDays.some((day) => !HABIT_DAY_IDS.includes(day as HabitDayId))
  ) {
    throw new HabitInputError(`Choose exactly ${weeklyTarget} unique activity days`);
  }

  return {
    weeklyTarget,
    plannedDays: uniqueDays as HabitDayId[],
  };
}

export function buildHabitRecommendation(
  activities: HabitActivity[],
  currentActivityId: string,
  referenceDate: Date,
): HabitRecommendation {
  const startOfCurrentWeek = startOfIsoWeek(referenceDate);
  const baselineWeeks = Array.from({ length: 4 }, (_, index) => {
    const start = addUtcDays(startOfCurrentWeek, -(4 - index) * 7);
    const end = addUtcDays(start, 7);
    const entries = activities.filter(
      (activity) =>
        activity.id !== currentActivityId && activity.date >= start && activity.date < end,
    );

    return {
      label: formatWeekLabel(start),
      start: toDateKey(start),
      count: entries.length,
      distanceKm: roundDistance(entries.reduce((sum, activity) => sum + activity.distanceKm, 0)),
    };
  });
  const historyStart = fromDateKey(baselineWeeks[0].start);
  const recentActivities = activities.filter(
    (activity) =>
      activity.id !== currentActivityId &&
      activity.date >= historyStart &&
      activity.date < startOfCurrentWeek,
  );
  const counts = baselineWeeks.map((week) => week.count).sort((left, right) => left - right);
  const median = (counts[1] + counts[2]) / 2;
  const weeklyTarget = clamp(Math.round(median || 3), 2, 4);
  const dayFrequency = HABIT_DAY_IDS.map((id, index) => ({
    id,
    count: recentActivities.filter((activity) => isoDayIndex(activity.date) === index).length,
  })).sort((left, right) => right.count - left.count);
  const fallbackDays: HabitDayId[] =
    weeklyTarget === 2
      ? ["tue", "sat"]
      : weeklyTarget === 4
        ? ["mon", "wed", "fri", "sun"]
        : ["tue", "thu", "sat"];
  const plannedDays = dayFrequency
    .filter((day) => day.count > 0)
    .slice(0, weeklyTarget)
    .map((day) => day.id);

  for (const day of fallbackDays) {
    if (plannedDays.length >= weeklyTarget) break;
    if (!plannedDays.includes(day)) plannedDays.push(day);
  }

  return {
    baselineWeeks,
    weeklyTarget,
    plannedDays,
    totalActivities: recentActivities.length,
    hasHistory: recentActivities.length >= 2,
  };
}

export function buildFourWeekProgress(
  planStartsOn: string,
  weeklyTarget: number,
  activities: HabitActivity[],
  now = new Date(),
): HabitWeek[] {
  const planStart = fromDateKey(planStartsOn);
  const currentWeek = startOfIsoWeek(now);

  return Array.from({ length: 4 }, (_, index) => {
    const start = addUtcDays(planStart, index * 7);
    const end = addUtcDays(start, 7);
    const entries = activities.filter((activity) => activity.date >= start && activity.date < end);
    const count = entries.length;
    const status =
      start.getTime() > currentWeek.getTime()
        ? "upcoming"
        : start.getTime() === currentWeek.getTime()
          ? count >= weeklyTarget
            ? "complete"
            : "in_progress"
          : count >= weeklyTarget
            ? "complete"
            : "missed";

    return {
      label: index === 0 ? "Week 1" : `Week ${index + 1}`,
      start: toDateKey(start),
      count,
      distanceKm: roundDistance(entries.reduce((sum, activity) => sum + activity.distanceKm, 0)),
      status,
    };
  });
}

export function getRecoveryOpportunity(input: {
  planStartsOn: string;
  plannedDays: HabitDayId[];
  weeklyTarget: number;
  activities: HabitActivity[];
  now?: Date;
  recovery?: { weekStartsOn: string; missedDay: HabitDayId; recoveryDay: HabitDayId } | null;
}) {
  const now = input.now ?? new Date();
  const weekStart = startOfIsoWeek(now);
  const planStart = fromDateKey(input.planStartsOn);
  const planEnd = addUtcDays(planStart, 28);

  if (weekStart < planStart || weekStart >= planEnd) return null;

  const weekEnd = addUtcDays(weekStart, 7);
  const activitiesThisWeek = input.activities.filter(
    (activity) => activity.date >= weekStart && activity.date < weekEnd,
  );
  const remaining = Math.max(0, input.weeklyTarget - activitiesThisWeek.length);

  if (remaining === 0) return null;

  const todayIndex = isoDayIndex(now);
  const completedDayIndexes = new Set(
    activitiesThisWeek.map((activity) => isoDayIndex(activity.date)),
  );
  const activeRecovery =
    input.recovery?.weekStartsOn === toDateKey(weekStart) ? input.recovery : null;
  const effectiveDays = input.plannedDays.filter((day) => day !== activeRecovery?.missedDay);

  if (activeRecovery && !effectiveDays.includes(activeRecovery.recoveryDay)) {
    effectiveDays.push(activeRecovery.recoveryDay);
  }

  const missedDays = effectiveDays.filter((day) => {
    const index = HABIT_DAY_IDS.indexOf(day);
    return index < todayIndex && !completedDayIndexes.has(index);
  });
  const missedDay = activeRecovery?.missedDay ?? missedDays[0];

  if (!missedDay) return null;

  const options = HABIT_DAY_IDS.filter((day, index) => {
    return index >= todayIndex && !effectiveDays.includes(day);
  });

  return {
    weekStartsOn: toDateKey(weekStart),
    missedDay,
    recoveryDay: activeRecovery?.recoveryDay ?? null,
    options,
    remaining,
  };
}

export function startOfIsoWeek(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - isoDayIndex(start));
  return start;
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fromDateKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function isoDayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function formatWeekLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
