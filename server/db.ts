import { Pool } from "pg";
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

export async function initializeDatabase() {
  await seedDatabase();
}

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const athlete of SEEDED_ATHLETES) {
      await client.query(
        `
          INSERT INTO users (
            id, email, password_hash, password_salt, name, handle, avatar_url, city, country, bio, followers_count, following_count
          )
          VALUES ($1, NULL, NULL, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              handle = EXCLUDED.handle,
              avatar_url = EXCLUDED.avatar_url,
              city = EXCLUDED.city,
              country = EXCLUDED.country,
              bio = EXCLUDED.bio,
              followers_count = EXCLUDED.followers_count,
              following_count = EXCLUDED.following_count
        `,
        [
          athlete.id,
          athlete.name,
          athlete.handle,
          athlete.avatar,
          athlete.city,
          athlete.country,
          athlete.bio,
          athlete.followers,
          athlete.following,
        ],
      );
    }

    for (const segment of SEEDED_SEGMENTS) {
      await client.query(
        `
          INSERT INTO segments (
            id, name, sport, location, distance_km, avg_grade, elevation_m, attempts, athletes, kor_sec, kor_athlete, route_seed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          segment.id,
          segment.name,
          segment.sport,
          segment.location,
          segment.distanceKm,
          segment.avgGrade,
          segment.elevationM,
          segment.attempts,
          segment.athletes,
          segment.korSec,
          segment.korAthlete,
          segment.routeSeed,
        ],
      );
    }

    for (const club of SEEDED_CLUBS) {
      await client.query(
        `
          INSERT INTO clubs (id, name, sport, city, members, cover, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `,
        [club.id, club.name, club.sport, club.city, club.members, club.cover, club.description],
      );
    }

    for (const challenge of SEEDED_CHALLENGES) {
      await client.query(
        `
          INSERT INTO challenges (id, name, sport, goal_km, participants, ends_at, badge, metric_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          challenge.id,
          challenge.name,
          challenge.sport,
          challenge.goalKm,
          challenge.participants,
          challenge.endsAt,
          challenge.badge,
          challenge.metricType,
        ],
      );
    }

    const activities = generateSeedActivities();

    for (const activity of activities) {
      await client.query(
        `
          INSERT INTO activities (
            id, athlete_id, sport, title, description, date, distance_km, moving_seconds, elevation_m,
            avg_hr, avg_pace_sec_per_km, avg_speed_kmh, kudos, achievements, photo, route_seed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          activity.id,
          activity.athleteId,
          activity.sport,
          activity.title,
          activity.description ?? null,
          activity.date,
          activity.distanceKm,
          activity.movingSeconds,
          activity.elevationM,
          activity.avgHr ?? null,
          activity.avgPaceSecPerKm ?? null,
          activity.avgSpeedKmh ?? null,
          activity.kudos,
          activity.achievements,
          activity.photo ?? null,
          activity.routeSeed,
        ],
      );

      for (const [position, split] of (activity.splits ?? []).entries()) {
        await client.query(
          `
            INSERT INTO activity_splits (activity_id, position, km, pace_sec, hr, elev)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (activity_id, position) DO NOTHING
          `,
          [activity.id, position, split.km, split.paceSec, split.hr, split.elev],
        );
      }

      for (const [position, effort] of (activity.segments ?? []).entries()) {
        await client.query(
          `
            INSERT INTO activity_segments (activity_id, position, segment_id, rank, effort_seconds)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (activity_id, position) DO NOTHING
          `,
          [activity.id, position, effort.id, effort.rank, effort.effortSeconds],
        );
      }

      for (const comment of activity.comments) {
        await client.query(
          `
            INSERT INTO activity_comments (id, activity_id, athlete_id, text)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
          `,
          [comment.id, activity.id, comment.athleteId, comment.text],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
