import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  activities as activitiesTable,
  challengeEntries,
  challenges as challengesTable,
} from "./db/schema.js";
import {
  DAY_MS,
  NOT_ENROLLED,
  STARTER_WEEK_DAYS,
  STARTER_WEEK_GOAL,
  STARTER_WEEK_ID,
  deriveState,
  windowEnd,
  type EntryRow,
  type StarterWeekState,
} from "./starter-week-state.js";

export {
  STARTER_WEEK_DAYS,
  STARTER_WEEK_GOAL,
  STARTER_WEEK_ID,
  deriveState,
  type StarterWeekState,
  type StarterWeekStatus,
} from "./starter-week-state.js";

/**
 * Every sport counts and there is no minimum distance or duration — the prototype
 * promises "any run, ride, swim, hike or walk, even a short one". Eligibility is
 * therefore purely a question of falling inside the entry's window.
 */
async function loadWindowActivities(userId: string, from: Date, to: Date) {
  const rows = await db
    .select({
      id: activitiesTable.id,
      sport: activitiesTable.sport,
      distanceKm: activitiesTable.distanceKm,
      movingSeconds: activitiesTable.movingSeconds,
      date: activitiesTable.date,
    })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.athleteId, userId),
        gte(activitiesTable.date, from),
        lt(activitiesTable.date, to),
      ),
    )
    .orderBy(asc(activitiesTable.date));

  return rows.map((row) => ({
    id: row.id,
    sport: row.sport,
    distanceKm: Number(row.distanceKm),
    movingSeconds: row.movingSeconds,
    date: row.date.toISOString(),
  }));
}

async function findLatestEntry(userId: string): Promise<EntryRow | undefined> {
  const rows = await db
    .select()
    .from(challengeEntries)
    .where(
      and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, STARTER_WEEK_ID)),
    )
    .orderBy(asc(challengeEntries.attempt));

  return rows.at(-1);
}

/**
 * Starter Week state is derived on read rather than advanced by a scheduled job:
 * whenever the user (or the API) looks at an active entry we settle it against the
 * clock and persist the transition. That keeps completion and expiry correct without
 * a worker, at the cost of the transition landing when the app is next opened.
 */
export async function getStarterWeekState(userId: string): Promise<StarterWeekState> {
  const entry = await findLatestEntry(userId);

  if (!entry) {
    return NOT_ENROLLED;
  }

  const activities = await loadWindowActivities(userId, entry.startedAt, windowEnd(entry));
  const { state, transition } = deriveState(entry, activities, new Date());

  if (transition) {
    await db.update(challengeEntries).set(transition).where(eq(challengeEntries.id, entry.id));
  }

  return state;
}

async function openEntry(userId: string, attempt: number, startedAt: Date) {
  await db.insert(challengeEntries).values({
    id: `entry-${randomUUID()}`,
    userId,
    challengeId: STARTER_WEEK_ID,
    attempt,
    startedAt,
    expiresAt: new Date(startedAt.getTime() + STARTER_WEEK_DAYS * DAY_MS),
    status: "active",
  });

  // Only bump the roster on a first attempt; a retry is the same athlete coming back.
  if (attempt === 1) {
    await db
      .update(challengesTable)
      .set({ participants: sql`${challengesTable.participants} + 1` })
      .where(eq(challengesTable.id, STARTER_WEEK_ID));
  }
}

/**
 * Auto-enrols the user the moment their *first* activity saves. Returns the resulting
 * state so the caller can render the post-save card without a second round trip.
 *
 * Safe to call on every save: the "one active entry per challenge" index plus the
 * first-activity check make re-entry impossible.
 */
export async function enrollOnFirstActivity(
  userId: string,
  firstActivityDate: Date,
): Promise<{ enrolled: boolean; state: StarterWeekState }> {
  const existing = await findLatestEntry(userId);

  if (existing) {
    return { enrolled: false, state: await getStarterWeekState(userId) };
  }

  const [{ value: activityCount }] = await db
    .select({ value: count() })
    .from(activitiesTable)
    .where(eq(activitiesTable.athleteId, userId));

  if (activityCount !== 1) {
    // Not their first activity — this account predates Starter Week, so leave it alone.
    return { enrolled: false, state: NOT_ENROLLED };
  }

  await openEntry(userId, 1, firstActivityDate);
  return { enrolled: true, state: await getStarterWeekState(userId) };
}

/** Starts a fresh 7-day window after an expired attempt. */
export async function retryStarterWeek(userId: string): Promise<StarterWeekState> {
  const entry = await findLatestEntry(userId);

  if (!entry) {
    throw new Error("Not enrolled in Starter Week");
  }

  const current = await getStarterWeekState(userId);

  if (current.status !== "expired") {
    // Nothing to retry: an active or completed attempt stands.
    return current;
  }

  await openEntry(userId, entry.attempt + 1, new Date());
  return getStarterWeekState(userId);
}

export async function markCelebrationSeen(userId: string) {
  const entry = await findLatestEntry(userId);

  if (entry) {
    await db
      .update(challengeEntries)
      .set({ celebrationSeenAt: new Date() })
      .where(eq(challengeEntries.id, entry.id));
  }

  return getStarterWeekState(userId);
}

export async function dismissStarterWeek(userId: string) {
  const entry = await findLatestEntry(userId);

  if (entry) {
    await db
      .update(challengeEntries)
      .set({ dismissedAt: new Date() })
      .where(eq(challengeEntries.id, entry.id));
  }

  return getStarterWeekState(userId);
}
