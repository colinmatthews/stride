import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  max,
  min,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { db, mintEditions } from "./db.js";
import {
  activities as activitiesTable,
  activityComments,
  activityKudos,
  activitySegments,
  activitySplits,
  challengeEditions,
  challengeEntries,
  clubMemberships,
  clubs as clubsTable,
  follows,
  segments as segmentsTable,
  users,
} from "./db/schema.js";
import { USER_AVATARS } from "./seed.js";
import {
  HORIZON_MONTHS,
  firstDay,
  lastDay,
  monthIndexOf,
  progressFor,
  statusOf,
  todayISO,
  type EffortBucket,
  type GoalMetric,
  type Visibility,
} from "./challenge-engine.js";

const BOOTSTRAP_ACTIVITY_LIMIT = 40;
const MAX_ACTIVITY_PAGE_LIMIT = 100;
/**
 * How far back the Past tab reaches. History grows forever in the table but the
 * bootstrap payload shouldn't, so the shelf ships a rolling year.
 */
const BOOTSTRAP_HISTORY_MONTHS = 12;

type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

type ActivityRow = typeof activitiesTable.$inferSelect;
type AthleteRow = typeof users.$inferSelect;

type ActivityDto = {
  id: string;
  athleteId: string;
  sport: Sport;
  title: string;
  description?: string;
  date: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  avgSpeedKmh?: number;
  kudos: number;
  comments: { id: string; athleteId: string; text: string }[];
  achievements: number;
  photo?: string;
  routeSeed: number;
  splits?: { km: number; paceSec: number; hr: number; elev: number }[];
  segments?: { id: string; rank: number }[];
  kudoed?: boolean;
};

function aliasUserId(id: string, currentUserId: string) {
  return id === currentUserId ? "me" : id;
}

function resolveAliasedUserId(id: string, currentUserId: string) {
  return id === "me" ? currentUserId : id;
}

function numberOrUndefined(value: string | number | null) {
  if (value === null) {
    return undefined;
  }

  return Number(value);
}

function parsePageLimit(value: unknown, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(MAX_ACTIVITY_PAGE_LIMIT, Math.floor(parsed));
}

async function createUniqueHandle(baseHandle: string) {
  const normalized =
    baseHandle
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(0, 18) || "athlete";
  let candidate = normalized;
  let suffix = 1;

  while (true) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, candidate))
      .limit(1);

    if (existing.length === 0) {
      return candidate;
    }

    suffix += 1;
    candidate = `${normalized}${suffix}`;
  }
}

function pickAvatar(seed: string) {
  const total = seed.split("").reduce((acc, character) => acc + character.charCodeAt(0), 0);
  return USER_AVATARS[total % USER_AVATARS.length];
}

function mapAthlete(row: AthleteRow, currentUserId: string, followedIds: Set<string>) {
  return {
    id: aliasUserId(row.id, currentUserId),
    name: row.name,
    handle: row.handle,
    avatar: row.avatarUrl,
    city: row.city,
    country: row.country,
    followers: row.followersCount,
    following: row.followingCount,
    bio: row.bio,
    isFollowing: row.id !== currentUserId ? followedIds.has(row.id) : false,
  };
}

async function hydrateActivities(rows: ActivityRow[], userId: string): Promise<ActivityDto[]> {
  const activityIds = rows.map((row) => row.id);

  if (activityIds.length === 0) {
    return [];
  }

  const [commentsRows, splitRows, activitySegmentRows, kudoRows] = await Promise.all([
    db
      .select()
      .from(activityComments)
      .where(inArray(activityComments.activityId, activityIds))
      .orderBy(asc(activityComments.createdAt)),
    db
      .select()
      .from(activitySplits)
      .where(inArray(activitySplits.activityId, activityIds))
      .orderBy(asc(activitySplits.activityId), asc(activitySplits.position)),
    db
      .select()
      .from(activitySegments)
      .where(inArray(activitySegments.activityId, activityIds))
      .orderBy(asc(activitySegments.activityId), asc(activitySegments.position)),
    db
      .select({ activityId: activityKudos.activityId })
      .from(activityKudos)
      .where(and(eq(activityKudos.userId, userId), inArray(activityKudos.activityId, activityIds))),
  ]);

  const commentsByActivity = new Map<
    string,
    Array<{ id: string; athleteId: string; text: string }>
  >();
  for (const row of commentsRows) {
    const existing = commentsByActivity.get(row.activityId) ?? [];
    existing.push({
      id: row.id,
      athleteId: aliasUserId(row.athleteId, userId),
      text: row.text,
    });
    commentsByActivity.set(row.activityId, existing);
  }

  const splitsByActivity = new Map<
    string,
    Array<{ km: number; paceSec: number; hr: number; elev: number }>
  >();
  for (const row of splitRows) {
    const existing = splitsByActivity.get(row.activityId) ?? [];
    existing.push({
      km: row.km,
      paceSec: row.paceSec,
      hr: row.hr,
      elev: row.elev,
    });
    splitsByActivity.set(row.activityId, existing);
  }

  const segmentEffortsByActivity = new Map<string, Array<{ id: string; rank: number }>>();
  for (const row of activitySegmentRows) {
    const existing = segmentEffortsByActivity.get(row.activityId) ?? [];
    existing.push({
      id: row.segmentId,
      rank: row.rank,
    });
    segmentEffortsByActivity.set(row.activityId, existing);
  }

  const myKudoedActivityIds = new Set(kudoRows.map((row) => row.activityId));

  return rows.map((row) => ({
    id: row.id,
    athleteId: aliasUserId(row.athleteId, userId),
    sport: row.sport as Sport,
    title: row.title,
    description: row.description ?? undefined,
    date: row.date.toISOString(),
    distanceKm: Number(row.distanceKm),
    movingSeconds: row.movingSeconds,
    elevationM: row.elevationM,
    avgHr: row.avgHr ?? undefined,
    avgPaceSecPerKm: row.avgPaceSecPerKm ?? undefined,
    avgSpeedKmh: numberOrUndefined(row.avgSpeedKmh),
    kudos: row.kudos,
    comments: commentsByActivity.get(row.id) ?? [],
    achievements: row.achievements,
    photo: row.photo ?? undefined,
    routeSeed: row.routeSeed,
    splits: splitsByActivity.get(row.id),
    segments: segmentEffortsByActivity.get(row.id),
    kudoed: myKudoedActivityIds.has(row.id),
  }));
}

export async function findUserForAuth(email: string) {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      password_hash: users.passwordHash,
      password_salt: users.passwordSalt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  name: string;
}) {
  const id = randomUUID();
  const handle = await createUniqueHandle(input.name || input.email.split("@")[0] || "athlete");
  const avatar = pickAvatar(input.email);

  await db.insert(users).values({
    id,
    email: input.email,
    passwordHash: input.passwordHash,
    passwordSalt: input.passwordSalt,
    name: input.name,
    handle,
    avatarUrl: avatar,
    city: "Toronto",
    country: "CA",
    bio: "New to Stride.",
    followersCount: 0,
    followingCount: 0,
  });

  return { id };
}

export async function listActivities(
  userId: string,
  options: { athleteId?: string; athleteIds?: string[]; cursor?: string; limit?: unknown } = {},
) {
  const limit = parsePageLimit(options.limit, BOOTSTRAP_ACTIVITY_LIMIT);
  const filters: SQL[] = [];

  if (options.athleteId) {
    filters.push(eq(activitiesTable.athleteId, resolveAliasedUserId(options.athleteId, userId)));
  } else if (options.athleteIds) {
    filters.push(inArray(activitiesTable.athleteId, options.athleteIds));
  }

  if (options.cursor) {
    const cursorDate = new Date(options.cursor);

    if (!Number.isNaN(cursorDate.getTime())) {
      filters.push(lt(activitiesTable.date, cursorDate));
    }
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await db
    .select()
    .from(activitiesTable)
    .where(where)
    .orderBy(desc(activitiesTable.date))
    .limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const activities = await hydrateActivities(pageRows, userId);
  const nextRow = rows[limit];

  return {
    activities,
    nextCursor: nextRow?.date.toISOString(),
  };
}

async function listFeedActivities(userId: string, limit: number) {
  const followedUsers = await db
    .select({ followedId: follows.followedId })
    .from(follows)
    .where(eq(follows.followerId, userId));

  return listActivities(userId, {
    athleteIds: [userId, ...followedUsers.map((row) => row.followedId)],
    limit,
  });
}

export async function getActivityById(userId: string, activityId: string) {
  const rows = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, activityId))
    .limit(1);
  const activities = await hydrateActivities(rows, userId);

  return activities[0] ?? null;
}

type EditionRow = typeof challengeEditions.$inferSelect;

/**
 * One edition as the client sees it. Progress is derived here rather than
 * stored, so it can never disagree with the athlete's activity log.
 */
function mapEdition(
  row: EditionRow,
  options: {
    userId: string;
    today: string;
    joined: boolean;
    buckets: Map<string, EffortBucket>;
    author?: AthleteRow;
  },
) {
  const metric = row.metric as GoalMetric;
  const goal = Number(row.goal);
  const progress = progressFor(
    { sport: row.sport as Sport, metric, goal, monthIdx: row.monthIdx },
    options.buckets,
  );

  return {
    id: row.id,
    seriesId: row.seriesId,
    name: row.name,
    sport: row.sport as Sport,
    metric,
    goal,
    unit: metric === "elevation" ? ("m" as const) : ("km" as const),
    badge: row.badge,
    blurb: row.blurb,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    monthIdx: row.monthIdx,
    status: statusOf(row.monthIdx, options.today),
    source: row.source as "auto" | "mine",
    visibility: row.visibility as Visibility,
    participants: row.participants,
    joined: options.joined,
    progress: {
      total: progress.total,
      pct: progress.pct,
      activities: progress.activities,
      lastDate: progress.lastDate,
      complete: progress.complete,
    },
    createdBy: options.author
      ? {
          name: options.author.name,
          handle: options.author.handle,
          isMe: options.author.id === options.userId,
        }
      : null,
  };
}

/**
 * The athlete's own effort, bucketed by sport and calendar month. Challenge
 * editions run over whole months, so one bucket is exactly one edition window
 * — which means every edition's progress comes out of this single query.
 *
 * Future-dated activities are excluded: an edition counts effort up to today,
 * never past it.
 */
async function listEffortBuckets(userId: string) {
  const monthIdxColumn = sql<number>`(
    EXTRACT(YEAR FROM ${activitiesTable.date} AT TIME ZONE 'UTC')::int * 12
    + EXTRACT(MONTH FROM ${activitiesTable.date} AT TIME ZONE 'UTC')::int - 1
  )`;

  const rows = await db
    .select({
      sport: activitiesTable.sport,
      monthIdx: monthIdxColumn,
      distanceKm: sum(activitiesTable.distanceKm),
      elevationM: sum(activitiesTable.elevationM),
      activities: count(),
      lastDate: max(activitiesTable.date),
    })
    .from(activitiesTable)
    .where(and(eq(activitiesTable.athleteId, userId), lte(activitiesTable.date, sql`NOW()`)))
    .groupBy(activitiesTable.sport, monthIdxColumn);

  const buckets = new Map<string, EffortBucket>();

  for (const row of rows) {
    buckets.set(`${row.sport}:${Number(row.monthIdx)}`, {
      distanceKm: Number(row.distanceKm ?? 0),
      elevationM: Number(row.elevationM ?? 0),
      activities: Number(row.activities),
      lastDate: row.lastDate ? new Date(row.lastDate).toISOString().slice(0, 10) : null,
    });
  }

  return buckets;
}

/**
 * The last month this process minted for. Seeding runs at boot, but a server
 * that stays up across a month boundary would otherwise sail past the engine's
 * horizon and start serving a shelf with nothing upcoming on it — so the first
 * request of a new month tops it up. Minting is idempotent, so racing instances
 * are harmless.
 */
let lastMintedMonthIdx: number | null = null;

async function ensureShelfFresh(currentMonthIdx: number, today: string) {
  if (lastMintedMonthIdx === currentMonthIdx) {
    return;
  }

  await mintEditions(db, today);
  lastMintedMonthIdx = currentMonthIdx;
}

export async function buildBootstrap(userId: string) {
  const today = todayISO();
  const currentMonthIdx = monthIndexOf(today);

  await ensureShelfFresh(currentMonthIdx, today);

  const [
    usersResult,
    followsResult,
    activityPage,
    segmentsResult,
    mySegmentBests,
    clubsResult,
    clubMembershipsResult,
    editionsResult,
    challengeEntriesResult,
    effortBuckets,
  ] = await Promise.all([
    db.select().from(users).orderBy(asc(users.createdAt)),
    db
      .select({ followedId: follows.followedId })
      .from(follows)
      .where(eq(follows.followerId, userId)),
    listFeedActivities(userId, BOOTSTRAP_ACTIVITY_LIMIT),
    db.select().from(segmentsTable).orderBy(asc(segmentsTable.name)),
    db
      .select({
        segmentId: activitySegments.segmentId,
        effortSeconds: min(activitySegments.effortSeconds),
      })
      .from(activitySegments)
      .innerJoin(activitiesTable, eq(activitiesTable.id, activitySegments.activityId))
      .where(eq(activitiesTable.athleteId, userId))
      .groupBy(activitySegments.segmentId),
    db.select().from(clubsTable).orderBy(asc(clubsTable.name)),
    db
      .select({ clubId: clubMemberships.clubId })
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, userId)),
    db
      .select()
      .from(challengeEditions)
      .where(
        and(
          gte(challengeEditions.monthIdx, currentMonthIdx - BOOTSTRAP_HISTORY_MONTHS),
          lte(challengeEditions.monthIdx, currentMonthIdx + HORIZON_MONTHS),
        ),
      )
      .orderBy(desc(challengeEditions.monthIdx), asc(challengeEditions.name)),
    db
      .select({ editionId: challengeEntries.editionId })
      .from(challengeEntries)
      .where(eq(challengeEntries.userId, userId)),
    listEffortBuckets(userId),
  ]);

  const followedIds = new Set(followsResult.map((row) => row.followedId));
  const joinedClubIds = new Set(clubMembershipsResult.map((row) => row.clubId));
  const joinedEditionIds = new Set(challengeEntriesResult.map((row) => row.editionId));
  const myBestBySegment = new Map(
    mySegmentBests.map((row) => [row.segmentId, row.effortSeconds ?? undefined]),
  );

  const athletes = usersResult.map((row) => mapAthlete(row, userId, followedIds));
  const me = athletes.find((athlete) => athlete.id === "me");

  if (!me) {
    throw new Error("Authenticated user not found");
  }

  const segments = segmentsResult.map((row) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    location: row.location,
    distanceKm: Number(row.distanceKm),
    avgGrade: Number(row.avgGrade),
    elevationM: row.elevationM,
    attempts: row.attempts,
    athletes: row.athletes,
    myBestSec: myBestBySegment.get(row.id),
    korSec: row.korSec,
    korAthlete: row.korAthlete,
    routeSeed: row.routeSeed,
  }));

  const clubs = clubsResult.map((row) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    city: row.city,
    members: row.members,
    cover: row.cover,
    description: row.description,
    joined: joinedClubIds.has(row.id),
  }));

  const athletesById = new Map(usersResult.map((row) => [row.id, row]));

  const challenges = editionsResult
    // A private edition is the author's alone; a friends-only one reaches the
    // people they follow. Anything else the engine minted is public.
    .filter((row) => {
      if (row.visibility === "public") {
        return true;
      }

      // Everything the engine mints is public, so a non-public edition without
      // an author is malformed rather than merely hidden.
      if (!row.createdBy) {
        return false;
      }

      if (row.createdBy === userId) {
        return true;
      }

      return row.visibility === "friends" && followedIds.has(row.createdBy);
    })
    .map((row) =>
      mapEdition(row, {
        userId,
        today,
        joined: joinedEditionIds.has(row.id),
        buckets: effortBuckets,
        author: row.createdBy ? athletesById.get(row.createdBy) : undefined,
      }),
    );

  return {
    me,
    athletes: [me, ...athletes.filter((athlete) => athlete.id !== "me")],
    activities: activityPage.activities,
    activityNextCursor: activityPage.nextCursor,
    segments,
    clubs,
    challenges,
  };
}

export async function createActivity(input: {
  userId: string;
  sport: Sport;
  title: string;
  description?: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  avgSpeedKmh?: number;
  routeSeed: number;
}) {
  const id = `act-${randomUUID()}`;

  await db.insert(activitiesTable).values({
    id,
    athleteId: input.userId,
    sport: input.sport,
    title: input.title,
    description: input.description ?? null,
    date: new Date(),
    distanceKm: String(input.distanceKm),
    movingSeconds: input.movingSeconds,
    elevationM: input.elevationM,
    avgHr: input.avgHr ?? null,
    avgPaceSecPerKm: input.avgPaceSecPerKm ?? null,
    avgSpeedKmh: input.avgSpeedKmh === undefined ? null : String(input.avgSpeedKmh),
    kudos: 0,
    achievements: 0,
    photo: null,
    routeSeed: input.routeSeed,
  });

  return id;
}

export async function toggleKudo(userId: string, activityId: string) {
  const existing = await db
    .select({ activityId: activityKudos.activityId })
    .from(activityKudos)
    .where(and(eq(activityKudos.userId, userId), eq(activityKudos.activityId, activityId)))
    .limit(1);
  const activityRows = await db
    .select({ kudos: activitiesTable.kudos })
    .from(activitiesTable)
    .where(eq(activitiesTable.id, activityId))
    .limit(1);
  const current = activityRows[0];

  if (!current) {
    throw new Error("Activity not found");
  }

  if (existing.length > 0) {
    await db
      .delete(activityKudos)
      .where(and(eq(activityKudos.userId, userId), eq(activityKudos.activityId, activityId)));
  } else {
    await db.insert(activityKudos).values({ userId, activityId });
  }

  const kudos = existing.length > 0 ? Math.max(current.kudos - 1, 0) : current.kudos + 1;
  await db.update(activitiesTable).set({ kudos }).where(eq(activitiesTable.id, activityId));

  return {
    kudos,
    kudoed: existing.length === 0,
  };
}

export async function addComment(userId: string, activityId: string, text: string) {
  const commentId = `comment-${randomUUID()}`;

  await db.insert(activityComments).values({
    id: commentId,
    activityId,
    athleteId: userId,
    text,
  });

  return {
    id: commentId,
    athleteId: "me",
    text,
  };
}

export async function toggleFollow(userId: string, athleteId: string) {
  const targetId = resolveAliasedUserId(athleteId, userId);

  if (userId === targetId) {
    throw new Error("Cannot follow yourself");
  }

  const existing = await db
    .select({ followedId: follows.followedId })
    .from(follows)
    .where(and(eq(follows.followerId, userId), eq(follows.followedId, targetId)))
    .limit(1);
  const [currentUser, targetUser] = await Promise.all([
    db
      .select({ followingCount: users.followingCount })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ followersCount: users.followersCount })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1),
  ]);

  if (!targetUser[0] || !currentUser[0]) {
    throw new Error("Athlete not found");
  }

  if (existing.length > 0) {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, userId), eq(follows.followedId, targetId)));
  } else {
    await db.insert(follows).values({ followerId: userId, followedId: targetId });
  }

  const followers =
    existing.length > 0
      ? Math.max(targetUser[0].followersCount - 1, 0)
      : targetUser[0].followersCount + 1;
  const meFollowing =
    existing.length > 0
      ? Math.max(currentUser[0].followingCount - 1, 0)
      : currentUser[0].followingCount + 1;

  await Promise.all([
    db.update(users).set({ followersCount: followers }).where(eq(users.id, targetId)),
    db.update(users).set({ followingCount: meFollowing }).where(eq(users.id, userId)),
  ]);

  return {
    following: existing.length === 0,
    followers,
    meFollowing,
  };
}

export async function toggleClubMembership(userId: string, clubId: string) {
  const existing = await db
    .select({ clubId: clubMemberships.clubId })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.clubId, clubId)))
    .limit(1);
  const clubRows = await db
    .select({ members: clubsTable.members })
    .from(clubsTable)
    .where(eq(clubsTable.id, clubId))
    .limit(1);
  const club = clubRows[0];

  if (!club) {
    throw new Error("Club not found");
  }

  if (existing.length > 0) {
    await db
      .delete(clubMemberships)
      .where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.clubId, clubId)));
  } else {
    await db.insert(clubMemberships).values({ userId, clubId });
  }

  const members = existing.length > 0 ? Math.max(club.members - 1, 0) : club.members + 1;
  await db.update(clubsTable).set({ members }).where(eq(clubsTable.id, clubId));

  return {
    joined: existing.length === 0,
    members,
  };
}

export async function toggleChallengeEntry(userId: string, editionId: string) {
  const existing = await db
    .select({ editionId: challengeEntries.editionId })
    .from(challengeEntries)
    .where(and(eq(challengeEntries.userId, userId), eq(challengeEntries.editionId, editionId)))
    .limit(1);
  const editionRows = await db
    .select({ participants: challengeEditions.participants })
    .from(challengeEditions)
    .where(eq(challengeEditions.id, editionId))
    .limit(1);
  const edition = editionRows[0];

  if (!edition) {
    throw new Error("Challenge not found");
  }

  if (existing.length > 0) {
    await db
      .delete(challengeEntries)
      .where(and(eq(challengeEntries.userId, userId), eq(challengeEntries.editionId, editionId)));
  } else {
    await db.insert(challengeEntries).values({ userId, editionId });
  }

  const participants =
    existing.length > 0 ? Math.max(edition.participants - 1, 0) : edition.participants + 1;
  await db
    .update(challengeEditions)
    .set({ participants })
    .where(eq(challengeEditions.id, editionId));

  return {
    joined: existing.length === 0,
    participants,
  };
}

const SPORTS: Sport[] = ["Run", "Ride", "Swim", "Hike", "Walk"];
const VISIBILITIES: Visibility[] = ["public", "friends", "private"];

export class ValidationError extends Error {}

/**
 * A challenge an athlete made. It lands on the same shelf as the minted ones
 * and counts the same activities — the only difference is that it carries a
 * byline and runs for one month rather than recurring.
 */
export async function createChallengeEdition(
  userId: string,
  input: {
    name?: unknown;
    sport?: unknown;
    metric?: unknown;
    goal?: unknown;
    monthIdx?: unknown;
    visibility?: unknown;
  },
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const goal = Number(input.goal);
  const monthIdx = Number(input.monthIdx);
  const today = todayISO();
  const currentMonthIdx = monthIndexOf(today);

  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("Name must be between 2 and 80 characters");
  }

  if (!SPORTS.includes(input.sport as Sport)) {
    throw new ValidationError("Unknown sport");
  }

  if (input.metric !== "distance" && input.metric !== "elevation") {
    throw new ValidationError("Metric must be distance or elevation");
  }

  if (!Number.isFinite(goal) || goal <= 0 || goal > 100_000) {
    throw new ValidationError("Goal must be a positive number");
  }

  if (!VISIBILITIES.includes(input.visibility as Visibility)) {
    throw new ValidationError("Unknown visibility");
  }

  // This month or next only — the same horizon the engine works to. Letting an
  // athlete post a challenge for next December would put a row on the shelf
  // that nothing else in the feature knows how to show.
  if (
    !Number.isInteger(monthIdx) ||
    monthIdx < currentMonthIdx ||
    monthIdx > currentMonthIdx + HORIZON_MONTHS
  ) {
    throw new ValidationError("A challenge can only run this month or next");
  }

  const metric = input.metric as GoalMetric;
  const visibility = input.visibility as Visibility;
  const id = `mine-${randomUUID()}`;

  const [row] = await db
    .insert(challengeEditions)
    .values({
      id,
      seriesId: null,
      name,
      sport: input.sport as Sport,
      metric,
      goal: String(goal),
      badge: name.slice(0, 4).toUpperCase().trim() || "MINE",
      blurb:
        visibility === "private"
          ? "Just for you."
          : visibility === "friends"
            ? "Open to people you follow."
            : "Open to anyone on Stride.",
      startsAt: firstDay(monthIdx),
      endsAt: lastDay(monthIdx),
      monthIdx,
      source: "mine",
      visibility,
      participants: 1,
      createdBy: userId,
    })
    .returning();

  // The author is in it by definition — nobody creates a challenge to sit out.
  await db.insert(challengeEntries).values({ userId, editionId: id }).onConflictDoNothing();

  const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  return mapEdition(row, {
    userId,
    today,
    joined: true,
    buckets: await listEffortBuckets(userId),
    author,
  });
}
