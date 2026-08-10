import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema.js";
import {
  SEEDED_ATHLETES,
  SEEDED_CHALLENGES,
  SEEDED_CLUBS,
  SEEDED_SEGMENTS,
  generateSeedActivities,
} from "./seed.js";

const dbUrl = process.env.DB_URL;

if (!dbUrl) {
  throw new Error("DB_URL is required");
}

export const pool = new Pool({
  connectionString: dbUrl,
});

export const db = drizzle(pool, { schema });

export async function initializeDatabase() {
  await seedDatabase();
}

async function seedDatabase() {
  await db.transaction(async (tx) => {
    for (const athlete of SEEDED_ATHLETES) {
      await tx
        .insert(schema.users)
        .values({
          id: athlete.id,
          email: null,
          passwordHash: null,
          passwordSalt: null,
          name: athlete.name,
          handle: athlete.handle,
          avatarUrl: athlete.avatar,
          city: athlete.city,
          country: athlete.country,
          bio: athlete.bio,
          followersCount: athlete.followers,
          followingCount: athlete.following,
        })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: {
            name: athlete.name,
            handle: athlete.handle,
            avatarUrl: athlete.avatar,
            city: athlete.city,
            country: athlete.country,
            bio: athlete.bio,
            followersCount: athlete.followers,
            followingCount: athlete.following,
          },
        });
    }

    for (const segment of SEEDED_SEGMENTS) {
      await tx
        .insert(schema.segments)
        .values({
          id: segment.id,
          name: segment.name,
          sport: segment.sport,
          location: segment.location,
          distanceKm: String(segment.distanceKm),
          avgGrade: String(segment.avgGrade),
          elevationM: segment.elevationM,
          attempts: segment.attempts,
          athletes: segment.athletes,
          korSec: segment.korSec,
          korAthlete: segment.korAthlete,
          routeSeed: segment.routeSeed,
        })
        .onConflictDoNothing();
    }

    for (const club of SEEDED_CLUBS) {
      await tx
        .insert(schema.clubs)
        .values({
          id: club.id,
          name: club.name,
          sport: club.sport,
          city: club.city,
          members: club.members,
          cover: club.cover,
          description: club.description,
        })
        .onConflictDoNothing();
    }

    for (const challenge of SEEDED_CHALLENGES) {
      await tx
        .insert(schema.challenges)
        .values({
          id: challenge.id,
          name: challenge.name,
          sport: challenge.sport,
          goalKm: String(challenge.goalKm),
          participants: challenge.participants,
          endsAt: challenge.endsAt,
          badge: challenge.badge,
          metricType: challenge.metricType,
        })
        .onConflictDoNothing();
    }

    const activities = generateSeedActivities();

    for (const activity of activities) {
      await tx
        .insert(schema.activities)
        .values({
          id: activity.id,
          athleteId: activity.athleteId,
          sport: activity.sport,
          title: activity.title,
          description: activity.description ?? null,
          date: new Date(activity.date),
          distanceKm: String(activity.distanceKm),
          movingSeconds: activity.movingSeconds,
          elevationM: activity.elevationM,
          avgHr: activity.avgHr ?? null,
          avgPaceSecPerKm: activity.avgPaceSecPerKm ?? null,
          avgSpeedKmh: activity.avgSpeedKmh === undefined ? null : String(activity.avgSpeedKmh),
          kudos: activity.kudos,
          achievements: activity.achievements,
          photo: activity.photo ?? null,
          routeSeed: activity.routeSeed,
        })
        .onConflictDoNothing();

      for (const [position, split] of (activity.splits ?? []).entries()) {
        await tx
          .insert(schema.activitySplits)
          .values({
            activityId: activity.id,
            position,
            km: split.km,
            paceSec: split.paceSec,
            hr: split.hr,
            elev: split.elev,
          })
          .onConflictDoNothing();
      }

      for (const [position, effort] of (activity.segments ?? []).entries()) {
        await tx
          .insert(schema.activitySegments)
          .values({
            activityId: activity.id,
            position,
            segmentId: effort.id,
            rank: effort.rank,
            effortSeconds: effort.effortSeconds,
          })
          .onConflictDoNothing();
      }

      for (const comment of activity.comments) {
        await tx
          .insert(schema.activityComments)
          .values({
            id: comment.id,
            activityId: activity.id,
            athleteId: comment.athleteId,
            text: comment.text,
          })
          .onConflictDoNothing();
      }
    }
  });
}
