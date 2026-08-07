import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { challengeEntries, challenges as challengesTable } from "./db/schema.js";
import {
  computeChallengeProgress,
  endOfChallengeDay,
  type ProgressActivityRow,
} from "./challenge-progress.js";
import { getUserActivityRows } from "./data.js";

export type ChallengeNotification =
  | {
      type: "completed";
      challengeId: string;
      name: string;
      badge: string;
      goalKm: number;
      metricType: string;
      at: string;
    }
  | {
      type: "ending_soon";
      challengeId: string;
      name: string;
      badge: string;
      goalKm: number;
      metricType: string;
      myProgressKm: number;
      endsAt: string;
    };

const ENDING_SOON_WINDOW_DAYS = 14;

// No "completed at" timestamp is stored anywhere — progress is always
// computed live. To show a sensible notification time, replay the user's
// matching activities in chronological order and find the first one whose
// running total actually crossed the goal.
function findCompletionDate(
  rows: ProgressActivityRow[],
  challenge: { sport: string; metricType: string; endsAt: Date },
  joinedAt: Date,
  goalKm: number,
): Date | null {
  const relevant = rows
    .filter(
      (row) =>
        row.sport === challenge.sport && row.date >= joinedAt && row.date <= challenge.endsAt,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let total = 0;

  for (const row of relevant) {
    total += challenge.metricType === "elevation_m" ? row.elevationM : row.distanceKm;

    if (Math.round(total * 10) / 10 >= goalKm) {
      return row.date;
    }
  }

  return null;
}

export async function buildChallengeNotifications(userId: string): Promise<ChallengeNotification[]> {
  const [joinedChallenges, activityRows] = await Promise.all([
    db
      .select({
        id: challengesTable.id,
        name: challengesTable.name,
        sport: challengesTable.sport,
        goalKm: challengesTable.goalKm,
        badge: challengesTable.badge,
        metricType: challengesTable.metricType,
        endsAt: challengesTable.endsAt,
        joinedAt: challengeEntries.createdAt,
      })
      .from(challengeEntries)
      .innerJoin(challengesTable, eq(challengesTable.id, challengeEntries.challengeId))
      .where(eq(challengeEntries.userId, userId)),
    getUserActivityRows(userId),
  ]);

  const now = Date.now();
  const completed: Extract<ChallengeNotification, { type: "completed" }>[] = [];
  const endingSoon: Extract<ChallengeNotification, { type: "ending_soon" }>[] = [];

  for (const challenge of joinedChallenges) {
    const goalKm = Number(challenge.goalKm);
    const endsAtDate = endOfChallengeDay(challenge.endsAt);
    const window = { sport: challenge.sport, metricType: challenge.metricType, endsAt: endsAtDate };
    const progress = computeChallengeProgress(activityRows, window, challenge.joinedAt);

    if (progress >= goalKm) {
      const completedAt = findCompletionDate(activityRows, window, challenge.joinedAt, goalKm);

      if (completedAt) {
        completed.push({
          type: "completed",
          challengeId: challenge.id,
          name: challenge.name,
          badge: challenge.badge,
          goalKm,
          metricType: challenge.metricType,
          at: completedAt.toISOString(),
        });
      }
    } else {
      const daysUntilEnd = (endsAtDate.getTime() - now) / (1000 * 60 * 60 * 24);

      if (daysUntilEnd >= 0 && daysUntilEnd <= ENDING_SOON_WINDOW_DAYS) {
        endingSoon.push({
          type: "ending_soon",
          challengeId: challenge.id,
          name: challenge.name,
          badge: challenge.badge,
          goalKm,
          metricType: challenge.metricType,
          myProgressKm: progress,
          endsAt: challenge.endsAt,
        });
      }
    }
  }

  completed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  endingSoon.sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());

  return [...completed, ...endingSoon];
}
