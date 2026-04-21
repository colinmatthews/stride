import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";

import type { Sport } from "../../server/seed.js";
import { SEEDED_CLUBS, SEEDED_CHALLENGES, SEEDED_SEGMENTS } from "../../server/seed.js";
import { personaById } from "./fixtures/personas.js";
import { ACTIVITY_DESCRIPTIONS, ACTIVITY_PHOTOS, SPORT_PROFILES } from "./fixtures/sports.js";
import { bulkInsert, closePool, getPool } from "./lib/db.js";
import { Rng } from "./lib/rng.js";
import type { SynthUser } from "./generate-users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const USERS_PATH = resolve(__dirname, "../../data/synth-users.json");
const WINDOW_DAYS = 90;

interface ActivityRow {
  id: string;
  athleteId: string;
  sport: Sport;
  title: string;
  description: string | null;
  date: Date;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr: number | null;
  avgPaceSecPerKm: number | null;
  avgSpeedKmh: number | null;
  achievements: number;
  photo: string | null;
  routeSeed: number;
}

interface SplitRow {
  activityId: string;
  position: number;
  km: number;
  paceSec: number;
  hr: number;
  elev: number;
}

interface SegmentEffortRow {
  activityId: string;
  position: number;
  segmentId: string;
  rank: number;
  effortSeconds: number;
}

interface FollowRow {
  followerId: string;
  followedId: string;
  createdAt: Date;
}

interface KudoRow {
  userId: string;
  activityId: string;
  createdAt: Date;
}

interface MembershipRow {
  userId: string;
  targetId: string;
  createdAt: Date;
}

const COMMENT_TEMPLATES = [
  "Massive effort!",
  "Beautiful route.",
  "Wow, strong pace.",
  "I need to join next time.",
  "Recovery week?",
  "Crushing it.",
  "How are those legs today?",
  "PR? That looks quick.",
];

async function loadUsers(): Promise<SynthUser[]> {
  const raw = await readFile(USERS_PATH, "utf8");
  const parsed = JSON.parse(raw) as SynthUser[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`No users in ${USERS_PATH} — run synth:users first`);
  }
  return parsed;
}

function activeWindow(user: SynthUser, now: Date): { start: Date; end: Date } {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const signup = new Date(user.signupDate);
  const start = signup > windowStart ? signup : windowStart;
  const end = user.lastActiveAt ? new Date(user.lastActiveAt) : now;
  return { start, end };
}

function pickSport(user: SynthUser, rng: Rng): Sport {
  const persona = personaById(user.persona);
  return rng.weighted(persona.sportMix.map((m) => ({ value: m.sport, weight: m.weight })));
}

function generateActivityFor(user: SynthUser, index: number, now: Date, rng: Rng): ActivityRow | null {
  const { start, end } = activeWindow(user, now);
  const windowMs = end.getTime() - start.getTime();
  if (windowMs <= 0 || user.activityTarget <= 0) return null;

  const sport = pickSport(user, rng);
  const profile = SPORT_PROFILES[sport];
  const date = new Date(start.getTime() + rng.next() * windowMs);

  const distanceKm = rng.float(profile.distanceKm[0], profile.distanceKm[1]);
  const avgHr = rng.int(profile.avgHr[0], profile.avgHr[1]);
  const elevationM = rng.int(profile.elevationM[0], profile.elevationM[1]);

  let movingSeconds: number;
  let avgPaceSecPerKm: number | null = null;
  let avgSpeedKmh: number | null = null;

  if (profile.speedKmh) {
    const speed = rng.float(profile.speedKmh[0], profile.speedKmh[1]);
    avgSpeedKmh = Math.round(speed * 10) / 10;
    movingSeconds = Math.floor((distanceKm / speed) * 3600);
  } else if (profile.paceSecPerKm) {
    const pace = rng.int(profile.paceSecPerKm[0], profile.paceSecPerKm[1]);
    avgPaceSecPerKm = pace;
    movingSeconds = Math.floor(distanceKm * pace);
  } else {
    movingSeconds = Math.floor(distanceKm * 360);
  }

  const title = rng.pick(profile.titles);
  const description = rng.chance(profile.descriptionChance)
    ? rng.pick(ACTIVITY_DESCRIPTIONS)
    : null;
  const photo = rng.chance(profile.photoChance) ? rng.pick(ACTIVITY_PHOTOS) : null;

  return {
    id: `act-${user.id}-${index}`,
    athleteId: user.id,
    sport,
    title,
    description,
    date,
    distanceKm: Math.round(distanceKm * 100) / 100,
    movingSeconds,
    elevationM,
    avgHr,
    avgPaceSecPerKm,
    avgSpeedKmh,
    achievements: rng.int(0, 3),
    photo,
    routeSeed: rng.int(1, 1_000_000),
  };
}

function generateSplitsFor(activity: ActivityRow, rng: Rng): SplitRow[] {
  if (activity.sport === "Swim") return [];
  const kmCount = Math.max(1, Math.floor(activity.distanceKm));
  const basePace =
    activity.avgPaceSecPerKm ??
    (activity.avgSpeedKmh ? Math.floor(3600 / activity.avgSpeedKmh) : 360);
  return Array.from({ length: kmCount }, (_, index) => ({
    activityId: activity.id,
    position: index,
    km: index + 1,
    paceSec: Math.max(120, basePace + rng.int(-20, 20)),
    hr: (activity.avgHr ?? 140) + rng.int(-10, 10),
    elev: rng.int(-20, 40),
  }));
}

function generateSegmentEffortsFor(activity: ActivityRow, rng: Rng): SegmentEffortRow[] {
  if (activity.sport !== "Run" && activity.sport !== "Ride") return [];
  if (!rng.chance(0.25)) return [];
  const candidates = SEEDED_SEGMENTS.filter((s) => s.sport === activity.sport);
  if (candidates.length === 0) return [];
  const segment = rng.pick(candidates);
  return [
    {
      activityId: activity.id,
      position: 0,
      segmentId: segment.id,
      rank: rng.int(1, 500),
      effortSeconds: segment.korSec + rng.int(30, 900),
    },
  ];
}

function generateCommentsFor(
  activity: ActivityRow,
  users: SynthUser[],
  rng: Rng,
): { id: string; activityId: string; athleteId: string; text: string; createdAt: Date }[] {
  if (!rng.chance(0.35)) return [];
  const commenterCount = rng.int(1, 2);
  const comments: { id: string; activityId: string; athleteId: string; text: string; createdAt: Date }[] = [];
  for (let i = 0; i < commenterCount; i += 1) {
    const commenter = users[rng.int(0, users.length - 1)];
    if (commenter.id === activity.athleteId) continue;
    const offsetMs = rng.int(60, 3 * 86_400) * 1000;
    comments.push({
      id: `comment-${activity.id}-${i}`,
      activityId: activity.id,
      athleteId: commenter.id,
      text: rng.pick(COMMENT_TEMPLATES),
      createdAt: new Date(activity.date.getTime() + offsetMs),
    });
  }
  return comments;
}

function generateFollows(users: SynthUser[], rng: Rng, now: Date): FollowRow[] {
  const followsByUser = new Map<string, Set<string>>();
  const popularityWeight = (u: SynthUser) => {
    const persona = personaById(u.persona);
    const base = persona.activitiesPerWeek[1] * (u.status === "active" ? 1.5 : 0.5);
    return Math.max(0.1, base);
  };
  const weightedUsers = users.map((u) => ({ value: u, weight: popularityWeight(u) }));

  for (const user of users) {
    const target = user.followsGivenTarget;
    if (target <= 0) continue;
    const set = new Set<string>();
    const safety = target * 4;
    for (let i = 0; i < safety && set.size < target; i += 1) {
      const candidate = rng.weighted(weightedUsers);
      if (candidate.id === user.id) continue;
      set.add(candidate.id);
    }
    followsByUser.set(user.id, set);
  }

  const follows: FollowRow[] = [];
  for (const [followerId, followedSet] of followsByUser) {
    const follower = users.find((u) => u.id === followerId)!;
    const signup = new Date(follower.signupDate);
    for (const followedId of followedSet) {
      const daysAfterSignup = rng.int(0, 30);
      const followDate = new Date(
        Math.min(now.getTime(), signup.getTime() + daysAfterSignup * 86_400_000),
      );
      follows.push({ followerId, followedId, createdAt: followDate });
    }
  }
  return follows;
}

function generateKudos(
  activities: ActivityRow[],
  users: SynthUser[],
  rng: Rng,
): KudoRow[] {
  const kudos: KudoRow[] = [];
  const popularityBySport = new Map<Sport, number>([
    ["Run", 0.8],
    ["Ride", 0.7],
    ["Swim", 0.4],
    ["Hike", 0.5],
    ["Walk", 0.3],
  ]);
  for (const activity of activities) {
    const owner = users.find((u) => u.id === activity.athleteId);
    if (!owner) continue;
    const ownerPopularity = personaById(owner.persona).followsGivenRange[1] / 400;
    const sportBoost = popularityBySport.get(activity.sport) ?? 0.5;
    const expected = Math.max(0, Math.floor(rng.float(0, 12) * ownerPopularity * sportBoost));
    if (expected === 0) continue;
    const seen = new Set<string>();
    for (let i = 0; i < expected * 3 && seen.size < expected; i += 1) {
      const kudoer = users[rng.int(0, users.length - 1)];
      if (kudoer.id === activity.athleteId) continue;
      if (seen.has(kudoer.id)) continue;
      seen.add(kudoer.id);
      const offset = rng.int(60, 5 * 86_400) * 1000;
      kudos.push({
        userId: kudoer.id,
        activityId: activity.id,
        createdAt: new Date(activity.date.getTime() + offset),
      });
    }
  }
  return kudos;
}

function generateClubMemberships(users: SynthUser[], rng: Rng, now: Date): MembershipRow[] {
  const rows: MembershipRow[] = [];
  for (const user of users) {
    for (const club of SEEDED_CLUBS) {
      const sportMatch =
        club.sport === "Multisport" ||
        club.sport === user.primarySport ||
        rng.chance(0.15);
      if (!sportMatch) continue;
      if (!rng.chance(user.clubJoinChance)) continue;
      const daysAfter = rng.int(0, 60);
      const joined = new Date(
        Math.min(now.getTime(), new Date(user.signupDate).getTime() + daysAfter * 86_400_000),
      );
      rows.push({ userId: user.id, targetId: club.id, createdAt: joined });
    }
  }
  return rows;
}

function generateChallengeEntries(users: SynthUser[], rng: Rng, now: Date): MembershipRow[] {
  const rows: MembershipRow[] = [];
  for (const user of users) {
    for (const challenge of SEEDED_CHALLENGES) {
      const sportMatch =
        challenge.sport === "Multisport" ||
        challenge.sport === user.primarySport ||
        rng.chance(0.1);
      if (!sportMatch) continue;
      if (!rng.chance(user.challengeJoinChance)) continue;
      const daysAfter = rng.int(0, 30);
      const joined = new Date(
        Math.min(now.getTime(), new Date(user.signupDate).getTime() + daysAfter * 86_400_000),
      );
      rows.push({ userId: user.id, targetId: challenge.id, createdAt: joined });
    }
  }
  return rows;
}

async function upsertUsers(client: PoolClient, users: SynthUser[]): Promise<void> {
  await bulkInsert(
    client,
    "users",
    ["id", "email", "name", "handle", "avatar_url", "city", "country", "bio", "created_at"],
    users,
    (u) => [u.id, u.email, u.name, u.handle, u.avatar, u.city, u.country, u.bio, new Date(u.signupDate)],
    `ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       handle = EXCLUDED.handle,
       avatar_url = EXCLUDED.avatar_url,
       city = EXCLUDED.city,
       country = EXCLUDED.country,
       bio = EXCLUDED.bio,
       created_at = EXCLUDED.created_at`,
    500,
  );
}

async function insertActivities(client: PoolClient, rows: ActivityRow[]): Promise<void> {
  await bulkInsert(
    client,
    "activities",
    [
      "id",
      "athlete_id",
      "sport",
      "title",
      "description",
      "date",
      "distance_km",
      "moving_seconds",
      "elevation_m",
      "avg_hr",
      "avg_pace_sec_per_km",
      "avg_speed_kmh",
      "kudos",
      "achievements",
      "photo",
      "route_seed",
    ],
    rows,
    (a) => [
      a.id,
      a.athleteId,
      a.sport,
      a.title,
      a.description,
      a.date,
      a.distanceKm,
      a.movingSeconds,
      a.elevationM,
      a.avgHr,
      a.avgPaceSecPerKm,
      a.avgSpeedKmh,
      0,
      a.achievements,
      a.photo,
      a.routeSeed,
    ],
    "ON CONFLICT (id) DO NOTHING",
    500,
  );
}

async function insertSplits(client: PoolClient, rows: SplitRow[]): Promise<void> {
  await bulkInsert(
    client,
    "activity_splits",
    ["activity_id", "position", "km", "pace_sec", "hr", "elev"],
    rows,
    (s) => [s.activityId, s.position, s.km, s.paceSec, s.hr, s.elev],
    "ON CONFLICT (activity_id, position) DO NOTHING",
    2000,
  );
}

async function insertSegmentEfforts(
  client: PoolClient,
  rows: SegmentEffortRow[],
): Promise<void> {
  await bulkInsert(
    client,
    "activity_segments",
    ["activity_id", "position", "segment_id", "rank", "effort_seconds"],
    rows,
    (s) => [s.activityId, s.position, s.segmentId, s.rank, s.effortSeconds],
    "ON CONFLICT (activity_id, position) DO NOTHING",
    2000,
  );
}

async function insertComments(
  client: PoolClient,
  rows: { id: string; activityId: string; athleteId: string; text: string; createdAt: Date }[],
): Promise<void> {
  await bulkInsert(
    client,
    "activity_comments",
    ["id", "activity_id", "athlete_id", "text", "created_at"],
    rows,
    (c) => [c.id, c.activityId, c.athleteId, c.text, c.createdAt],
    "ON CONFLICT (id) DO NOTHING",
    1000,
  );
}

async function insertFollows(client: PoolClient, rows: FollowRow[]): Promise<void> {
  await bulkInsert(
    client,
    "follows",
    ["follower_id", "followed_id", "created_at"],
    rows,
    (f) => [f.followerId, f.followedId, f.createdAt],
    "ON CONFLICT (follower_id, followed_id) DO NOTHING",
    2000,
  );
}

async function insertKudos(client: PoolClient, rows: KudoRow[]): Promise<void> {
  await bulkInsert(
    client,
    "activity_kudos",
    ["user_id", "activity_id", "created_at"],
    rows,
    (k) => [k.userId, k.activityId, k.createdAt],
    "ON CONFLICT (user_id, activity_id) DO NOTHING",
    2000,
  );
}

async function insertClubMemberships(
  client: PoolClient,
  rows: MembershipRow[],
): Promise<void> {
  await bulkInsert(
    client,
    "club_memberships",
    ["user_id", "club_id", "created_at"],
    rows,
    (m) => [m.userId, m.targetId, m.createdAt],
    "ON CONFLICT (user_id, club_id) DO NOTHING",
    2000,
  );
}

async function insertChallengeEntries(
  client: PoolClient,
  rows: MembershipRow[],
): Promise<void> {
  await bulkInsert(
    client,
    "challenge_entries",
    ["user_id", "challenge_id", "created_at"],
    rows,
    (m) => [m.userId, m.targetId, m.createdAt],
    "ON CONFLICT (user_id, challenge_id) DO NOTHING",
    2000,
  );
}

async function recomputeCounters(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE users u SET
      followers_count = COALESCE((SELECT COUNT(*) FROM follows WHERE followed_id = u.id), 0),
      following_count = COALESCE((SELECT COUNT(*) FROM follows WHERE follower_id = u.id), 0)
  `);
  await client.query(`
    UPDATE activities a SET
      kudos = COALESCE((SELECT COUNT(*) FROM activity_kudos WHERE activity_id = a.id), 0)
  `);
  await client.query(`
    UPDATE clubs c SET
      members = COALESCE((SELECT COUNT(*) FROM club_memberships WHERE club_id = c.id), 0)
  `);
  await client.query(`
    UPDATE challenges ch SET
      participants = COALESCE((SELECT COUNT(*) FROM challenge_entries WHERE challenge_id = ch.id), 0)
  `);
}

async function main() {
  const users = await loadUsers();
  const now = new Date();
  const rng = new Rng(2026);

  console.log(`Loaded ${users.length} users. Building activities…`);

  const activities: ActivityRow[] = [];
  const splits: SplitRow[] = [];
  const efforts: SegmentEffortRow[] = [];
  const comments: { id: string; activityId: string; athleteId: string; text: string; createdAt: Date }[] = [];

  for (const user of users) {
    const userRng = rng.derive(user.id);
    for (let i = 0; i < user.activityTarget; i += 1) {
      const activity = generateActivityFor(user, i, now, userRng);
      if (!activity) continue;
      activities.push(activity);
      splits.push(...generateSplitsFor(activity, userRng));
      efforts.push(...generateSegmentEffortsFor(activity, userRng));
      comments.push(...generateCommentsFor(activity, users, userRng));
    }
  }

  console.log(`Built ${activities.length} activities, ${splits.length} splits, ${efforts.length} segment efforts, ${comments.length} comments.`);

  const follows = generateFollows(users, rng.derive("follows"), now);
  const kudos = generateKudos(activities, users, rng.derive("kudos"));
  const clubMemberships = generateClubMemberships(users, rng.derive("clubs"), now);
  const challengeEntries = generateChallengeEntries(users, rng.derive("challenges"), now);

  console.log(`Built ${follows.length} follows, ${kudos.length} kudos, ${clubMemberships.length} club memberships, ${challengeEntries.length} challenge entries.`);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("Upserting users…");
    await upsertUsers(client, users);

    console.log("Inserting activities…");
    await insertActivities(client, activities);

    console.log("Inserting splits…");
    await insertSplits(client, splits);

    console.log("Inserting segment efforts…");
    await insertSegmentEfforts(client, efforts);

    console.log("Inserting comments…");
    await insertComments(client, comments);

    console.log("Inserting follows…");
    await insertFollows(client, follows);

    console.log("Inserting kudos…");
    await insertKudos(client, kudos);

    console.log("Inserting club memberships…");
    await insertClubMemberships(client, clubMemberships);

    console.log("Inserting challenge entries…");
    await insertChallengeEntries(client, challengeEntries);

    console.log("Recomputing counters…");
    await recomputeCounters(client);

    await client.query("COMMIT");
    console.log("Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
