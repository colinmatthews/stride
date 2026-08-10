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
import { db } from "./db.js";
import {
  activities as activitiesTable,
  activityComments,
  activityKudos,
  activitySegments,
  activitySplits,
  challengeEntries,
  challenges as challengesTable,
  clubMemberships,
  clubs as clubsTable,
  follows,
  segments as segmentsTable,
  users,
} from "./db/schema.js";
import { USER_AVATARS } from "./seed.js";
import {
  badgeFor,
  blurbFor,
  canView,
  firstDay,
  lastDay,
  monthIndexOf,
  parseChallengeDraft,
  progressFor,
  statusOf,
  todayISO,
  type EffortBucket,
  type GoalMetric,
  type Visibility,
} from "./challenges.js";

const BOOTSTRAP_ACTIVITY_LIMIT = 40;
const MAX_ACTIVITY_PAGE_LIMIT = 100;
/**
 * How far back the Past tab reaches. History grows forever in the table but the
 * bootstrap payload shouldn't, so it ships a rolling year.
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

type ChallengeRow = typeof challengesTable.$inferSelect;

/**
 * One challenge as the client sees it. Progress and the participant count are
 * both derived here rather than stored, so neither can drift out of agreement
 * with the activity log or the join table.
 */
function mapChallenge(
  row: ChallengeRow,
  options: {
    userId: string;
    today: string;
    joined: boolean;
    participants: number;
    buckets: Map<string, EffortBucket>;
    author: AthleteRow;
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
    visibility: row.visibility as Visibility,
    participants: options.participants,
    joined: options.joined,
    progress: {
      total: progress.total,
      pct: progress.pct,
      activities: progress.activities,
      lastDate: progress.lastDate,
      complete: progress.complete,
    },
    createdBy: {
      name: options.author.name,
      handle: options.author.handle,
      isMe: options.author.id === options.userId,
    },
  };
}

/**
 * The athlete's own effort, bucketed by sport and calendar month. A challenge
 * runs over a whole month, so one bucket is exactly one challenge window —
 * which means every challenge's progress comes out of this single query.
 *
 * Future-dated activities are excluded: a challenge counts effort up to today,
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
 * How many athletes have joined each challenge. Counted from the join table
 * rather than kept as a column, so it can't drift.
 */
async function listParticipantCounts() {
  const rows = await db
    .select({ challengeId: challengeEntries.challengeId, participants: count() })
    .from(challengeEntries)
    .groupBy(challengeEntries.challengeId);

  return new Map(rows.map((row) => [row.challengeId, Number(row.participants)]));
}

export async function buildBootstrap(userId: string) {
  const today = todayISO();
  const currentMonthIdx = monthIndexOf(today);

  const [
    usersResult,
    followsResult,
    activityPage,
    segmentsResult,
    mySegmentBests,
    clubsResult,
    clubMembershipsResult,
    challengesResult,
    challengeEntriesResult,
    participantCounts,
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
      .from(challengesTable)
      .where(gte(challengesTable.monthIdx, currentMonthIdx - BOOTSTRAP_HISTORY_MONTHS))
      .orderBy(desc(challengesTable.monthIdx), asc(challengesTable.name)),
    db
      .select({ challengeId: challengeEntries.challengeId })
      .from(challengeEntries)
      .where(eq(challengeEntries.userId, userId)),
    listParticipantCounts(),
    listEffortBuckets(userId),
  ]);

  const followedIds = new Set(followsResult.map((row) => row.followedId));
  const joinedClubIds = new Set(clubMembershipsResult.map((row) => row.clubId));
  const joinedChallengeIds = new Set(challengeEntriesResult.map((row) => row.challengeId));
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

  const challenges = challengesResult
    .filter((row) => canView(row, userId, followedIds))
    .flatMap((row) => {
      const author = athletesById.get(row.createdBy);

      // The author FK cascades on user delete, so a row without one shouldn't
      // exist. Skip rather than throw: one orphan shouldn't blank the app.
      if (!author) {
        return [];
      }

      return [
        mapChallenge(row, {
          userId,
          today,
          joined: joinedChallengeIds.has(row.id),
          participants: participantCounts.get(row.id) ?? 0,
          buckets: effortBuckets,
          author,
        }),
      ];
    });

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

export async function toggleChallengeEntry(userId: string, challengeId: string) {
  const [challenge] = await db
    .select()
    .from(challengesTable)
    .where(eq(challengesTable.id, challengeId))
    .limit(1);

  if (!challenge) {
    throw new NotFoundError("Challenge not found");
  }

  // Joining is a read of someone else's challenge first. Without this check an
  // athlete could join a private challenge by posting its id directly.
  const followsResult = await db
    .select({ followedId: follows.followedId })
    .from(follows)
    .where(eq(follows.followerId, userId));

  if (!canView(challenge, userId, new Set(followsResult.map((row) => row.followedId)))) {
    throw new NotFoundError("Challenge not found");
  }

  // A finished challenge can't be joined — there is no window left to count in.
  if (statusOf(challenge.monthIdx, todayISO()) === "past") {
    throw new ValidationError("This challenge has already finished");
  }

  const existing = await db
    .select({ challengeId: challengeEntries.challengeId })
    .from(challengeEntries)
    .where(and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)))
    .limit(1);
  const joined = existing.length === 0;

  if (joined) {
    await db.insert(challengeEntries).values({ userId, challengeId }).onConflictDoNothing();
  } else {
    await db
      .delete(challengeEntries)
      .where(
        and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)),
      );
  }

  const [{ participants }] = await db
    .select({ participants: count() })
    .from(challengeEntries)
    .where(eq(challengeEntries.challengeId, challengeId));

  return { joined, participants: Number(participants) };
}

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

/**
 * A challenge an athlete made for themselves and whoever they choose to share
 * it with. Progress on it is summed from their real activities in the month it
 * runs, so it starts counting the moment it exists.
 */
export async function createChallenge(
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
  const today = todayISO();
  const parsed = parseChallengeDraft(input, today);

  if (!parsed.ok) {
    throw new ValidationError(parsed.error);
  }

  const { draft } = parsed;
  const id = `challenge-${randomUUID()}`;

  const [row] = await db
    .insert(challengesTable)
    .values({
      id,
      name: draft.name,
      sport: draft.sport,
      metric: draft.metric,
      goal: String(draft.goal),
      badge: badgeFor(draft.name),
      blurb: blurbFor(draft.visibility),
      startsAt: firstDay(draft.monthIdx),
      endsAt: lastDay(draft.monthIdx),
      monthIdx: draft.monthIdx,
      visibility: draft.visibility,
      createdBy: userId,
    })
    .returning();

  // The author is in it by definition — nobody creates a challenge to sit out.
  await db.insert(challengeEntries).values({ userId, challengeId: id }).onConflictDoNothing();

  const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  return mapChallenge(row, {
    userId,
    today,
    joined: true,
    participants: 1,
    buckets: await listEffortBuckets(userId),
    author,
  });
}
