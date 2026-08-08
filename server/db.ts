import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
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

// Some corporate networks block all direct outbound TCP to the internet
// (including Postgres's port 5432), only permitting HTTP(S) traffic through
// a proxy. When such a proxy is configured, fall back to connecting to Neon
// over a WebSocket (wss://, port 443) tunneled through it instead of a raw
// TCP socket. This still supports full transactions (unlike Neon's plain
// HTTP driver), so it's a drop-in replacement for local/dev use.
const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

function createPool() {
  if (!proxyUrl) {
    return { pool: new Pool({ connectionString: dbUrl }), viaProxy: false as const };
  }

  console.log(`[db] Detected HTTP(S) proxy (${proxyUrl}); connecting to Neon via WebSocket over the proxy.`);
  const agent = new HttpsProxyAgent(proxyUrl);
  class ProxiedWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols, { agent });
    }
  }
  neonConfig.webSocketConstructor = ProxiedWebSocket as unknown as typeof WebSocket;

  return { pool: new NeonPool({ connectionString: dbUrl }), viaProxy: true as const };
}

const { pool: dbPool, viaProxy } = createPool();

export const pool = dbPool;

export const db = (
  viaProxy ? drizzleNeon(dbPool as NeonPool, { schema }) : drizzle(dbPool as Pool, { schema })
) as NodePgDatabase<typeof schema>;

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
          tier: challenge.tier,
          firstStepLabel: challenge.firstStep.activityLabel,
          firstStepDistanceKm: String(challenge.firstStep.suggestedDistanceKm),
          firstStepElevationM: challenge.firstStep.suggestedElevationM ?? null,
        })
        .onConflictDoUpdate({
          target: schema.challenges.id,
          set: {
            tier: challenge.tier,
            firstStepLabel: challenge.firstStep.activityLabel,
            firstStepDistanceKm: String(challenge.firstStep.suggestedDistanceKm),
            firstStepElevationM: challenge.firstStep.suggestedElevationM ?? null,
          },
        });
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
