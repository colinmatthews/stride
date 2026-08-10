import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "./db.js";
import { activities as activitiesTable, habitCommitments, users } from "./db/schema.js";

export const HABIT_TARGET_DAYS = 3;
export const HABIT_WINDOW_DAYS = 3;

export type ReminderChannel = "in_app" | "push" | "email";
export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

export type HabitReminderDto = {
  channel: ReminderChannel;
  missedDate: string;
  sentAt: string;
  dismissed: boolean;
};

export type HabitCommitmentDto = {
  sport: Sport;
  distanceKm: number;
  buddyId: string | null;
  targetActiveDays: number;
  windowDays: number;
  startedAt: string;
  activeDays: string[];
  reminder: HabitReminderDto | null;
  completedAt: string | null;
};

export type HabitStateDto = {
  signupAt: string;
  firstActivityId: string | null;
  firstActivityAt: string | null;
  commitment: HabitCommitmentDto | null;
  commitPromptPending: boolean;
};

export function dayKey(isoOrDate: string | Date = new Date()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isInWeekZero(signupAt: string | Date, now = new Date()): boolean {
  const start = typeof signupAt === "string" ? new Date(signupAt) : signupAt;
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return now >= start && now < end;
}

export function habitProgress(activeDays: string[], target = HABIT_TARGET_DAYS) {
  const done = activeDays.length;
  return { done, target, pct: Math.min(100, Math.round((done / target) * 100)) };
}

export function habitWindowDays(startedAt: string, windowDays = HABIT_WINDOW_DAYS): string[] {
  const start = new Date(startedAt);
  start.setHours(12, 0, 0, 0);
  return Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dayKey(d);
  });
}

function aliasBuddyId(buddyId: string | null, currentUserId: string) {
  if (!buddyId) return null;
  return buddyId === currentUserId ? "me" : buddyId;
}

function resolveBuddyId(buddyId: string | null | undefined, currentUserId: string) {
  if (!buddyId) return null;
  return buddyId === "me" ? currentUserId : buddyId;
}

async function loadUserSignup(userId: string) {
  const rows = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.createdAt ?? new Date();
}

async function loadFirstActivity(userId: string) {
  const rows = await db
    .select({ id: activitiesTable.id, date: activitiesTable.date })
    .from(activitiesTable)
    .where(eq(activitiesTable.athleteId, userId))
    .orderBy(asc(activitiesTable.date))
    .limit(1);
  return rows[0] ?? null;
}

async function loadActiveDays(userId: string, since: Date, until: Date) {
  const rows = await db
    .select({ date: activitiesTable.date })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.athleteId, userId),
        gte(activitiesTable.date, since),
        lt(activitiesTable.date, until),
      ),
    );

  const days = new Set(rows.map((row) => dayKey(row.date)));
  return Array.from(days).sort();
}

function findMissedDate(startedAt: string, activeDays: string[], now = new Date()): string | null {
  const start = new Date(startedAt);
  start.setHours(12, 0, 0, 0);
  const today = dayKey(now);
  const active = new Set(activeDays);

  for (let i = 0; i < HABIT_WINDOW_DAYS; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    if (key >= today) break;
    if (!active.has(key)) return key;
  }

  return null;
}

async function ensureMissedReminder(
  userId: string,
  row: typeof habitCommitments.$inferSelect,
  activeDays: string[],
  completedAt: Date | null,
) {
  if (!row.sport || !row.startedAt || completedAt) return row;
  if (row.reminderSentAt && !row.reminderDismissed) return row;

  const missed = findMissedDate(row.startedAt.toISOString(), activeDays);
  if (!missed) return row;

  if (row.reminderDismissed && row.reminderMissedDate === missed) return row;

  const sentAt = new Date();
  await db
    .update(habitCommitments)
    .set({
      reminderChannel: "in_app",
      reminderMissedDate: missed,
      reminderSentAt: sentAt,
      reminderDismissed: 0,
      updatedAt: sentAt,
    })
    .where(eq(habitCommitments.userId, userId));

  return {
    ...row,
    reminderChannel: "in_app",
    reminderMissedDate: missed,
    reminderSentAt: sentAt,
    reminderDismissed: 0,
  };
}

export async function getHabitState(userId: string): Promise<HabitStateDto> {
  const [signupAt, firstActivity, row] = await Promise.all([
    loadUserSignup(userId),
    loadFirstActivity(userId),
    db.select().from(habitCommitments).where(eq(habitCommitments.userId, userId)).limit(1),
  ]);

  const habitRow = row[0] ?? null;
  const weekZero = isInWeekZero(signupAt);
  const hasCommitment = Boolean(habitRow?.sport && habitRow?.startedAt && habitRow?.distanceKm);

  let commitment: HabitCommitmentDto | null = null;

  if (hasCommitment && habitRow?.startedAt && habitRow.sport && habitRow.distanceKm) {
    const windowEnd = new Date(habitRow.startedAt);
    windowEnd.setDate(windowEnd.getDate() + 14);

    let activeDays = await loadActiveDays(userId, habitRow.startedAt, windowEnd);
    // Always include the commitment start day if first activity falls on it
    const startDay = dayKey(habitRow.startedAt);
    if (!activeDays.includes(startDay) && firstActivity) {
      activeDays = [startDay, ...activeDays.filter((d) => d !== startDay)].sort();
    }

    let completedAt = habitRow.completedAt;
    if (!completedAt && activeDays.length >= HABIT_TARGET_DAYS) {
      completedAt = new Date();
      await db
        .update(habitCommitments)
        .set({ completedAt, updatedAt: new Date() })
        .where(eq(habitCommitments.userId, userId));
    }

    const synced =
      weekZero && !completedAt
        ? await ensureMissedReminder(userId, habitRow, activeDays, completedAt)
        : habitRow;

    // Auto-dismiss reminder when today is already an active day
    const today = dayKey();
    let reminderDismissed = Boolean(synced.reminderDismissed);
    if (activeDays.includes(today) && synced.reminderSentAt && !reminderDismissed) {
      reminderDismissed = true;
      await db
        .update(habitCommitments)
        .set({ reminderDismissed: 1, updatedAt: new Date() })
        .where(eq(habitCommitments.userId, userId));
    }

    commitment = {
      sport: synced.sport as Sport,
      distanceKm: Number(synced.distanceKm),
      buddyId: aliasBuddyId(synced.buddyId, userId),
      targetActiveDays: HABIT_TARGET_DAYS,
      windowDays: HABIT_WINDOW_DAYS,
      startedAt: synced.startedAt!.toISOString(),
      activeDays,
      reminder:
        synced.reminderChannel && synced.reminderMissedDate && synced.reminderSentAt
          ? {
              channel: synced.reminderChannel as ReminderChannel,
              missedDate: synced.reminderMissedDate,
              sentAt: synced.reminderSentAt.toISOString(),
              dismissed: reminderDismissed,
            }
          : null,
      completedAt: completedAt ? completedAt.toISOString() : null,
    };
  }

  const commitPromptPending =
    weekZero &&
    Boolean(firstActivity) &&
    !hasCommitment &&
    !habitRow?.promptDismissedAt;

  return {
    signupAt: signupAt.toISOString(),
    firstActivityId: firstActivity?.id ?? null,
    firstActivityAt: firstActivity?.date.toISOString() ?? null,
    commitment,
    commitPromptPending,
  };
}

export async function commitWeekZeroHabit(
  userId: string,
  input: { sport: Sport; distanceKm: number; buddyId: string | null },
): Promise<HabitStateDto> {
  const firstActivity = await loadFirstActivity(userId);
  const startedAt = firstActivity?.date ?? new Date();
  const buddyId = resolveBuddyId(input.buddyId, userId);
  const now = new Date();

  await db
    .insert(habitCommitments)
    .values({
      userId,
      sport: input.sport,
      distanceKm: String(input.distanceKm),
      buddyId,
      startedAt,
      promptDismissedAt: null,
      reminderChannel: null,
      reminderMissedDate: null,
      reminderSentAt: null,
      reminderDismissed: 0,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: habitCommitments.userId,
      set: {
        sport: input.sport,
        distanceKm: String(input.distanceKm),
        buddyId,
        startedAt,
        promptDismissedAt: null,
        reminderChannel: null,
        reminderMissedDate: null,
        reminderSentAt: null,
        reminderDismissed: 0,
        completedAt: null,
        updatedAt: now,
      },
    });

  return getHabitState(userId);
}

export async function dismissHabitCommitPrompt(userId: string): Promise<HabitStateDto> {
  const now = new Date();
  await db
    .insert(habitCommitments)
    .values({
      userId,
      promptDismissedAt: now,
      reminderDismissed: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: habitCommitments.userId,
      set: {
        promptDismissedAt: now,
        updatedAt: now,
      },
    });

  return getHabitState(userId);
}

export async function dismissHabitReminder(userId: string): Promise<HabitStateDto> {
  await db
    .update(habitCommitments)
    .set({ reminderDismissed: 1, updatedAt: new Date() })
    .where(eq(habitCommitments.userId, userId));

  return getHabitState(userId);
}

/** Called after activity create to refresh completion / reminder state. */
export async function syncHabitAfterActivity(userId: string): Promise<HabitStateDto> {
  return getHabitState(userId);
}
