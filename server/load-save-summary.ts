import { and, asc, count, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  activities as activitiesTable,
  challengeEntries,
  challenges as challengesTable,
  users,
} from "./db/schema.js";
import { getActivityById, listChallengeActivities, toProgressChallenge } from "./data.js";
import {
  buildSaveSummary,
  resolveTimeZone,
  SUMMARY_WINDOW_DAYS,
  type SameSportHistory,
} from "./save-summary.js";

const DAY_MS = 86_400_000;

function paceExpression(sport: string) {
  return sport === "Ride"
    ? sql`coalesce(${activitiesTable.avgSpeedKmh}, ${activitiesTable.distanceKm} / (greatest(${activitiesTable.movingSeconds}, 1) / 3600.0))`
    : sql`coalesce(${activitiesTable.avgPaceSecPerKm}::numeric, ${activitiesTable.movingSeconds} / greatest(${activitiesTable.distanceKm}, 0.01))`;
}

/** Returns null when the activity doesn't exist or belongs to someone else. */
export async function loadSaveSummary(userId: string, activityId: string, timeZone?: unknown) {
  const activity = await getActivityById(userId, activityId);

  if (!activity || activity.athleteId !== "me") {
    return null;
  }

  const now = new Date(activity.date);
  const windowStart = new Date(now.getTime() - SUMMARY_WINDOW_DAYS * DAY_MS);
  const pace = paceExpression(activity.sport);
  const mine = eq(activitiesTable.athleteId, userId);

  const [userRows, recentActivities, historyRows, ordinalRows, challengeRows] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({
        id: activitiesTable.id,
        date: activitiesTable.date,
        movingSeconds: activitiesTable.movingSeconds,
      })
      .from(activitiesTable)
      .where(and(mine, gt(activitiesTable.date, windowStart), lte(activitiesTable.date, now))),
    db
      .select({
        count: count(),
        avgDistanceKm: sql<string | null>`avg(${activitiesTable.distanceKm})`,
        avgElevationM: sql<string | null>`avg(${activitiesTable.elevationM})`,
        avgPaceValue: sql<string | null>`avg(${pace})`,
        maxDistanceKm: sql<string | null>`max(${activitiesTable.distanceKm})`,
        maxElevationM: sql<string | null>`max(${activitiesTable.elevationM})`,
        bestPaceValue:
          activity.sport === "Ride"
            ? sql<string | null>`max(${pace})`
            : sql<string | null>`min(${pace})`,
      })
      .from(activitiesTable)
      .where(
        and(
          mine,
          eq(activitiesTable.sport, activity.sport),
          ne(activitiesTable.id, activity.id),
          lte(activitiesTable.date, now),
        ),
      ),
    db
      .select({ count: count() })
      .from(activitiesTable)
      .where(and(mine, lte(activitiesTable.date, now))),
    db
      .select({ challenge: challengesTable, joinedAt: challengeEntries.createdAt })
      .from(challengeEntries)
      .innerJoin(challengesTable, eq(challengesTable.id, challengeEntries.challengeId))
      .where(
        and(
          eq(challengeEntries.userId, userId),
          inArray(challengesTable.sport, [activity.sport, "Multisport"]),
          gte(challengesTable.endsAt, now.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(challengesTable.endsAt)),
  ]);

  const historyRow = historyRows[0];
  const sameSportHistory: SameSportHistory = {
    count: historyRow?.count ?? 0,
    avgDistanceKm: Number(historyRow?.avgDistanceKm ?? 0),
    avgElevationM: Number(historyRow?.avgElevationM ?? 0),
    avgPaceValue: Number(historyRow?.avgPaceValue ?? 0),
    maxDistanceKm: Number(historyRow?.maxDistanceKm ?? 0),
    maxElevationM: Number(historyRow?.maxElevationM ?? 0),
    bestPaceValue: Number(historyRow?.bestPaceValue ?? 0),
  };
  const challengeActivities = await listChallengeActivities(
    userId,
    challengeRows.map((row) => row.joinedAt),
  );

  return buildSaveSummary(
    {
      activity,
      athleteName: userRows[0]?.name ?? "",
      ordinal: ordinalRows[0]?.count ?? 1,
      recentActivities,
      sameSportHistory,
      challenges: challengeRows.map((row) => ({
        ...toProgressChallenge(row.challenge),
        id: row.challenge.id,
        name: row.challenge.name,
        goal: Number(row.challenge.goalKm),
        joinedAt: row.joinedAt,
      })),
      challengeActivities,
    },
    { timeZone: resolveTimeZone(timeZone) },
  );
}
