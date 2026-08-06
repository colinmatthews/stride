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

export class HabitInputError extends Error {}

export function normalizeTimeZone(value: unknown) {
  const timeZone = String(value ?? "UTC");

  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone;
  } catch {
    throw new HabitInputError("Choose a valid IANA time zone");
  }
}

export function shouldOfferConsistencyPlan(existingActivityCount: number, hasPlan: boolean) {
  return existingActivityCount === 0 && !hasPlan;
}

export function buildPlanWeekTargets(input: {
  weeklyTarget: number;
  now: Date;
  timeZone: string;
  existingPlanStartsOn?: string;
  existingWeekTargets?: number[];
  existingWeeklyTarget?: number;
}) {
  const currentWeekStart = startOfIsoWeek(input.now, input.timeZone);
  const currentWeekKey = toDateKey(currentWeekStart, input.timeZone);
  const existingIndex = input.existingPlanStartsOn
    ? weekIndexFor(input.existingPlanStartsOn, input.now, input.timeZone)
    : -1;
  const restarted = !input.existingPlanStartsOn || existingIndex >= 4;
  const planStartsOn = restarted ? currentWeekKey : input.existingPlanStartsOn!;
  const weekTargets = Array.from({ length: 4 }, (_, index) => {
    if (!restarted && index < existingIndex) {
      return input.existingWeekTargets?.[index] ?? input.existingWeeklyTarget ?? input.weeklyTarget;
    }
    return input.weeklyTarget;
  });

  return { planStartsOn, weekTargets, restarted };
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
  timeZone = "UTC",
): HabitRecommendation {
  const startOfCurrentWeek = startOfIsoWeek(referenceDate, timeZone);
  const baselineWeeks = Array.from({ length: 4 }, (_, index) => {
    const start = addLocalDays(startOfCurrentWeek, -(4 - index) * 7, timeZone);
    const end = addLocalDays(start, 7, timeZone);
    const entries = activities.filter(
      (activity) =>
        activity.id !== currentActivityId && activity.date >= start && activity.date < end,
    );

    return {
      label: formatWeekLabel(start, timeZone),
      start: toDateKey(start, timeZone),
      count: entries.length,
      distanceKm: roundDistance(entries.reduce((sum, activity) => sum + activity.distanceKm, 0)),
    };
  });
  const historyStart = fromDateKey(baselineWeeks[0].start, timeZone);
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
    count: recentActivities.filter((activity) => isoDayIndex(activity.date, timeZone) === index)
      .length,
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
  weekTargets: number[],
  activities: HabitActivity[],
  now = new Date(),
  timeZone = "UTC",
): HabitWeek[] {
  const planStart = fromDateKey(planStartsOn, timeZone);
  const currentWeek = startOfIsoWeek(now, timeZone);

  return Array.from({ length: 4 }, (_, index) => {
    const start = addLocalDays(planStart, index * 7, timeZone);
    const end = addLocalDays(start, 7, timeZone);
    const entries = activities.filter((activity) => activity.date >= start && activity.date < end);
    const count = entries.length;
    const target = weekTargets[index] ?? weekTargets[weekTargets.length - 1] ?? 3;
    const status =
      start.getTime() > currentWeek.getTime()
        ? "upcoming"
        : start.getTime() === currentWeek.getTime()
          ? count >= target
            ? "complete"
            : "in_progress"
          : count >= target
            ? "complete"
            : "missed";

    return {
      label: index === 0 ? "Week 1" : `Week ${index + 1}`,
      start: toDateKey(start, timeZone),
      count,
      distanceKm: roundDistance(entries.reduce((sum, activity) => sum + activity.distanceKm, 0)),
      target,
      isCurrent: start.getTime() === currentWeek.getTime(),
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
  timeZone?: string;
}) {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? "UTC";
  const weekStart = startOfIsoWeek(now, timeZone);
  const planStart = fromDateKey(input.planStartsOn, timeZone);
  const planEnd = addLocalDays(planStart, 28, timeZone);

  if (weekStart < planStart || weekStart >= planEnd) return null;

  const weekEnd = addLocalDays(weekStart, 7, timeZone);
  const activitiesThisWeek = input.activities.filter(
    (activity) => activity.date >= weekStart && activity.date < weekEnd,
  );
  const remaining = Math.max(0, input.weeklyTarget - activitiesThisWeek.length);

  if (remaining === 0) return null;

  const todayIndex = isoDayIndex(now, timeZone);
  const completedDayIndexes = new Set(
    activitiesThisWeek.map((activity) => isoDayIndex(activity.date, timeZone)),
  );
  const activeRecovery =
    input.recovery?.weekStartsOn === toDateKey(weekStart, timeZone) ? input.recovery : null;
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
    weekStartsOn: toDateKey(weekStart, timeZone),
    missedDay,
    recoveryDay: activeRecovery?.recoveryDay ?? null,
    options,
    remaining,
  };
}

export function startOfIsoWeek(date: Date, timeZone = "UTC") {
  const dateKey = zonedDateKey(date, timeZone);
  const localDate = new Date(`${dateKey}T00:00:00.000Z`);
  localDate.setUTCDate(localDate.getUTCDate() - isoDayIndex(date, timeZone));
  return fromDateKey(localDate.toISOString().slice(0, 10), timeZone);
}

export function toDateKey(date: Date, timeZone = "UTC") {
  return zonedDateKey(date, timeZone);
}

export function weekIndexFor(planStartsOn: string, date: Date, timeZone = "UTC") {
  const startCalendar = new Date(`${planStartsOn}T00:00:00.000Z`);
  const currentCalendar = new Date(
    `${toDateKey(startOfIsoWeek(date, timeZone), timeZone)}T00:00:00.000Z`,
  );
  return Math.floor((currentCalendar.getTime() - startCalendar.getTime()) / (7 * 86_400_000));
}

export function fromDateKey(value: string, timeZone = "UTC") {
  const [year, month, day] = value.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day);
  let result = new Date(localAsUtc);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const offset = timeZoneOffsetMs(result, timeZone);
    result = new Date(localAsUtc - offset);
  }

  return result;
}

export function addLocalDays(date: Date, days: number, timeZone = "UTC") {
  const dateKey = zonedDateKey(date, timeZone);
  const calendarDate = new Date(`${dateKey}T00:00:00.000Z`);
  calendarDate.setUTCDate(calendarDate.getUTCDate() + days);
  return fromDateKey(calendarDate.toISOString().slice(0, 10), timeZone);
}

function isoDayIndex(date: Date, timeZone = "UTC") {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(date);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
}

function formatWeekLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

function zonedDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ) - date.getTime()
  );
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
