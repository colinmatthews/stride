import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cohortTag } from "./lib/cohort.js";
import { loadEnv, requireEnv } from "./lib/config.js";
import { closePool, getPool } from "./lib/db.js";
import { Rng } from "./lib/rng.js";
import type { SynthUser } from "./generate-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const USERS_PATH = resolve(__dirname, "../../data/synth-users.json");
const BATCH_SIZE = 500;

type PHEvent = {
  event: string;
  distinct_id: string;
  timestamp: string;
  properties: Record<string, unknown>;
};

const PAGE_PATHS = [
  "/feed",
  "/feed",
  "/feed",
  "/profile",
  "/activities",
  "/segments",
  "/clubs",
  "/challenges",
  "/settings",
];

const CANCEL_REASONS = [
  "too_expensive",
  "not_using",
  "found_alternative",
  "missing_features",
  "temporary_break",
  "other",
];

async function loadUsers(): Promise<SynthUser[]> {
  const raw = await readFile(USERS_PATH, "utf8");
  const parsed = JSON.parse(raw) as SynthUser[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`No users in ${USERS_PATH} — run synth:users first`);
  }
  return parsed;
}

function mkEvent(
  event: string,
  distinctId: string,
  timestamp: Date,
  properties: Record<string, unknown> = {},
): PHEvent {
  return {
    event,
    distinct_id: distinctId,
    timestamp: timestamp.toISOString(),
    properties: {
      cohort_id: cohortTag(),
      ...properties,
    },
  };
}

function buildRegistrationEvents(users: SynthUser[]): PHEvent[] {
  return users.map((user) =>
    mkEvent("user_registered", user.id, new Date(user.signupDate), {
      persona: user.persona,
      plan: user.plan,
      primary_sport: user.primarySport,
      city: user.city,
      country: user.country,
      $set: {
        email: user.email,
        name: user.name,
        handle: user.handle,
        persona: user.persona,
        plan: user.plan,
        status: user.status,
        city: user.city,
        country: user.country,
        primary_sport: user.primarySport,
        signup_date: user.signupDate,
        cohort_id: cohortTag(),
      },
    }),
  );
}

function buildSubscriptionEvents(users: SynthUser[], rng: Rng): PHEvent[] {
  const events: PHEvent[] = [];
  for (const user of users) {
    if (user.plan === "free") continue;
    const signup = new Date(user.signupDate);
    const start = new Date(signup.getTime() + rng.int(0, 7) * 86_400_000);
    events.push(
      mkEvent("subscription_started", user.id, start, {
        plan_tier: "premium",
        billing_cycle: rng.pick(["monthly", "annual"]),
      }),
    );
    if (user.cancelledAt) {
      events.push(
        mkEvent("subscription_cancelled", user.id, new Date(user.cancelledAt), {
          plan_tier: "premium",
          reason: rng.pick(CANCEL_REASONS),
          $set: {
            plan: "cancelled",
            status: "churned",
            cancelled_at: user.cancelledAt,
          },
        }),
      );
    }
  }
  return events;
}

async function buildActivityEvents(userIds: string[]): Promise<PHEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    athlete_id: string;
    sport: string;
    distance_km: string;
    moving_seconds: number;
    elevation_m: number;
    photo: string | null;
    date: Date;
  }>(
    `
      SELECT id, athlete_id, sport, distance_km::text, moving_seconds, elevation_m, photo, date
      FROM activities
      WHERE athlete_id = ANY($1)
    `,
    [userIds],
  );
  return rows.map((row) =>
    mkEvent("activity_created", row.athlete_id, row.date, {
      activity_id: row.id,
      sport: row.sport,
      distance_km: Number(row.distance_km),
      moving_seconds: row.moving_seconds,
      elevation_m: row.elevation_m,
      has_photo: row.photo !== null,
    }),
  );
}

async function buildKudosEvents(userIds: string[]): Promise<PHEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: string;
    activity_id: string;
    created_at: Date;
    activity_owner_id: string;
    sport: string;
  }>(
    `
      SELECT k.user_id, k.activity_id, k.created_at, a.athlete_id AS activity_owner_id, a.sport
      FROM activity_kudos k
      JOIN activities a ON a.id = k.activity_id
      WHERE k.user_id = ANY($1)
    `,
    [userIds],
  );
  return rows.map((row) =>
    mkEvent("activity_kudoed", row.user_id, row.created_at, {
      activity_id: row.activity_id,
      activity_owner_id: row.activity_owner_id,
      sport: row.sport,
    }),
  );
}

async function buildCommentEvents(userIds: string[]): Promise<PHEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    athlete_id: string;
    activity_id: string;
    created_at: Date;
    text: string;
    activity_owner_id: string;
  }>(
    `
      SELECT c.id, c.athlete_id, c.activity_id, c.created_at, c.text, a.athlete_id AS activity_owner_id
      FROM activity_comments c
      JOIN activities a ON a.id = c.activity_id
      WHERE c.athlete_id = ANY($1)
    `,
    [userIds],
  );
  return rows.map((row) =>
    mkEvent("activity_commented", row.athlete_id, row.created_at, {
      activity_id: row.activity_id,
      comment_id: row.id,
      activity_owner_id: row.activity_owner_id,
      text_length: row.text.length,
    }),
  );
}

async function buildFollowEvents(userIds: string[]): Promise<PHEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    follower_id: string;
    followed_id: string;
    created_at: Date;
  }>(
    `
      SELECT follower_id, followed_id, created_at
      FROM follows
      WHERE follower_id = ANY($1)
    `,
    [userIds],
  );
  return rows.map((row) =>
    mkEvent("athlete_followed", row.follower_id, row.created_at, {
      followed_id: row.followed_id,
    }),
  );
}

async function buildClubJoinEvents(userIds: string[]): Promise<PHEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: string;
    club_id: string;
    created_at: Date;
    name: string;
    sport: string;
  }>(
    `
      SELECT cm.user_id, cm.club_id, cm.created_at, c.name, c.sport
      FROM club_memberships cm
      JOIN clubs c ON c.id = cm.club_id
      WHERE cm.user_id = ANY($1)
    `,
    [userIds],
  );
  return rows.map((row) =>
    mkEvent("club_joined", row.user_id, row.created_at, {
      club_id: row.club_id,
      club_name: row.name,
      club_sport: row.sport,
    }),
  );
}

async function buildChallengeJoinEvents(userIds: string[]): Promise<PHEvent[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: string;
    challenge_id: string;
    created_at: Date;
    name: string;
    sport: string;
  }>(
    `
      SELECT ce.user_id, ce.challenge_id, ce.created_at, ch.name, ch.sport
      FROM challenge_entries ce
      JOIN challenges ch ON ch.id = ce.challenge_id
      WHERE ce.user_id = ANY($1)
    `,
    [userIds],
  );
  return rows.map((row) =>
    mkEvent("challenge_joined", row.user_id, row.created_at, {
      challenge_id: row.challenge_id,
      challenge_name: row.name,
      challenge_sport: row.sport,
    }),
  );
}

function buildSessionEvents(users: SynthUser[], rng: Rng): PHEvent[] {
  const events: PHEvent[] = [];
  const windowStart = Date.now() - 90 * 86_400_000;
  for (const user of users) {
    const signup = new Date(user.signupDate).getTime();
    const endActive =
      (user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : Date.now());
    const windowEnd = Math.min(Date.now(), endActive);
    const rangeStart = Math.max(signup, windowStart);
    if (windowEnd <= rangeStart) continue;

    const sessionCount = Math.max(
      user.status === "active" ? 3 : 1,
      Math.floor(user.activityTarget * 1.4),
    );

    for (let i = 0; i < sessionCount; i += 1) {
      const sessionStart = new Date(rangeStart + rng.next() * (windowEnd - rangeStart));
      events.push(
        mkEvent("user_logged_in", user.id, sessionStart, {
          auth_method: "email",
        }),
      );
      const bootstrap = new Date(sessionStart.getTime() + 500);
      events.push(
        mkEvent("bootstrap_loaded", user.id, bootstrap, {
          is_first_session: i === 0,
        }),
      );
      const pageviewCount = rng.int(2, 5);
      let cursor = bootstrap.getTime();
      for (let p = 0; p < pageviewCount; p += 1) {
        cursor += rng.int(5_000, 120_000);
        const path = rng.pick(PAGE_PATHS);
        events.push(
          mkEvent("$pageview", user.id, new Date(cursor), {
            $current_url: `https://stride.app${path}`,
            $pathname: path,
          }),
        );
      }
    }
  }
  return events;
}

async function postBatch(events: PHEvent[]): Promise<void> {
  const env = loadEnv();
  const apiKey = requireEnv("POSTHOG_API_KEY");
  const host = env.VITE_PUBLIC_POSTHOG_HOST.replace(/\/$/, "");
  const response = await fetch(`${host}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      historical_migration: true,
      batch: events,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PostHog batch failed: ${response.status} ${body}`);
  }
}

async function sendAll(events: PHEvent[]): Promise<void> {
  const total = events.length;
  console.log(`Sending ${total} events in batches of ${BATCH_SIZE}…`);
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = events.slice(i, i + BATCH_SIZE);
    await postBatch(chunk);
    const sent = Math.min(i + BATCH_SIZE, total);
    if (sent % (BATCH_SIZE * 5) === 0 || sent === total) {
      console.log(`  ${sent}/${total}`);
    }
  }
}

async function main() {
  const users = await loadUsers();
  const userIds = users.map((u) => u.id);
  const rng = new Rng(loadEnv().SYNTH_RNG_SEED + 1);

  console.log("Querying DB…");
  const [
    activityEvents,
    kudosEvents,
    commentEvents,
    followEvents,
    clubEvents,
    challengeEvents,
  ] = await Promise.all([
    buildActivityEvents(userIds),
    buildKudosEvents(userIds),
    buildCommentEvents(userIds),
    buildFollowEvents(userIds),
    buildClubJoinEvents(userIds),
    buildChallengeJoinEvents(userIds),
  ]);

  const registrationEvents = buildRegistrationEvents(users);
  const subscriptionEvents = buildSubscriptionEvents(users, rng);
  const sessionEvents = buildSessionEvents(users, rng);

  const allEvents = [
    ...registrationEvents,
    ...subscriptionEvents,
    ...activityEvents,
    ...kudosEvents,
    ...commentEvents,
    ...followEvents,
    ...clubEvents,
    ...challengeEvents,
    ...sessionEvents,
  ].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  console.log({
    user_registered: registrationEvents.length,
    subscription: subscriptionEvents.length,
    activity_created: activityEvents.length,
    activity_kudoed: kudosEvents.length,
    activity_commented: commentEvents.length,
    athlete_followed: followEvents.length,
    club_joined: clubEvents.length,
    challenge_joined: challengeEvents.length,
    session_events: sessionEvents.length,
    total: allEvents.length,
  });

  await sendAll(allEvents);
  await closePool();
  console.log("Done. Events may take a minute to appear in PostHog.");
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => {});
  process.exit(1);
});
