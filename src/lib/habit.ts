import type { Sport } from "./mock-data";

export const HABIT_TARGET_DAYS = 3;
export const HABIT_WINDOW_DAYS = 3;
export const HABIT_HASH = "week-zero-habit";

export type ReminderChannel = "in_app" | "push" | "email";

export type HabitReminder = {
  channel: ReminderChannel;
  missedDate: string;
  sentAt: string;
  dismissed: boolean;
};

export type HabitCommitment = {
  sport: Sport;
  distanceKm: number;
  buddyId: string | null;
  targetActiveDays: number;
  windowDays: number;
  startedAt: string;
  /** Local calendar days (YYYY-MM-DD) with at least one activity */
  activeDays: string[];
  reminder: HabitReminder | null;
  completedAt: string | null;
};

export type HabitState = {
  signupAt: string;
  firstActivityId: string | null;
  firstActivityAt: string | null;
  commitment: HabitCommitment | null;
  commitPromptPending: boolean;
};

export type CommitHabitInput = {
  sport: Sport;
  distanceKm: number;
  buddyId: string | null;
};

const EMPTY_HABIT: HabitState = {
  signupAt: new Date(0).toISOString(),
  firstActivityId: null,
  firstActivityAt: null,
  commitment: null,
  commitPromptPending: false,
};

let HABIT: HabitState = EMPTY_HABIT;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeHabit(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHabitState(): HabitState {
  return HABIT;
}

export function setHabitState(next: HabitState | null | undefined) {
  HABIT = next ?? EMPTY_HABIT;
  notify();
  return HABIT;
}

export function clearHabitState() {
  HABIT = EMPTY_HABIT;
  notify();
}

export function dayKey(isoOrDate: string | Date = new Date()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isInWeekZero(state: HabitState = HABIT, now = new Date()): boolean {
  const start = new Date(state.signupAt);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return now >= start && now < end;
}

export function habitProgress(commitment: HabitCommitment | null) {
  if (!commitment) return { done: 0, target: HABIT_TARGET_DAYS, pct: 0 };
  const done = commitment.activeDays.length;
  const target = commitment.targetActiveDays;
  return { done, target, pct: Math.min(100, Math.round((done / target) * 100)) };
}

export function habitWindowDays(commitment: HabitCommitment): string[] {
  const start = new Date(commitment.startedAt);
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: commitment.windowDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dayKey(d);
  });
}

export function shouldShowMissedReminder(state: HabitState = HABIT): boolean {
  const c = state.commitment;
  if (!c || c.completedAt || !c.reminder || c.reminder.dismissed) return false;
  if (!isInWeekZero(state)) return false;
  return c.activeDays.length < c.targetActiveDays;
}

/** Pure helper: find first missed calendar day in the habit window. */
export function findMissedDate(
  startedAt: string,
  activeDays: string[],
  windowDays = HABIT_WINDOW_DAYS,
  now = new Date(),
): string | null {
  const start = new Date(startedAt);
  start.setHours(12, 0, 0, 0);
  const today = dayKey(now);
  const active = new Set(activeDays);

  for (let i = 0; i < windowDays; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    if (key >= today) break;
    if (!active.has(key)) return key;
  }

  return null;
}

/** Pure helper: merge a new activity day into commitment progress. */
export function applyActivityDay(
  commitment: HabitCommitment,
  activityDate: string,
): HabitCommitment {
  const today = dayKey(activityDate);
  const activeDays = commitment.activeDays.includes(today)
    ? commitment.activeDays
    : [...commitment.activeDays, today].sort();
  const completed =
    activeDays.length >= commitment.targetActiveDays
      ? (commitment.completedAt ?? activityDate)
      : null;

  return {
    ...commitment,
    activeDays,
    completedAt: completed,
    reminder:
      completed || activeDays.includes(today)
        ? commitment.reminder
          ? { ...commitment.reminder, dismissed: true }
          : null
        : commitment.reminder,
  };
}
