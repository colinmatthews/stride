import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt, min, sql, type SQL } from "drizzle-orm";
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
  computeChallengeProgress,
  endOfChallengeDay,
  type ProgressActivityRow,
} from "./challenge-progress.js";

const BOOTSTRAP_ACTIVITY_LIMIT = 40;
const MAX_ACTIVITY_PAGE_LIMIT = 100;

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

// Accepts either the module-level `db` or a `db.transaction()` callback's
// `tx` handle — both share the same query-builder API, but `tx` doesn't
// structurally satisfy `typeof db` (it lacks the pool-level `$client`).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | Tx;

export async function getUserActivityRows(
  userId: string,
  dbClient: DbClient = db,
): Promise<ProgressActivityRow[]> {
  const rows = await dbClient
    .select({
      sport: activitiesTable.sport,
      distanceKm: activitiesTable.distanceKm,
      elevationM: activitiesTable.elevationM,
      date: activitiesTable.date,
    })
    .from(activitiesTable)
    .where(eq(activitiesTable.athleteId, userId));

  return rows.map((row) => ({
    sport: row.sport,
    distanceKm: Number(row.distanceKm),
    elevationM: row.elevationM,
    date: row.date,
  }));
}

async function buildChallengesDto(
  userId: string,
  activityRows?: ProgressActivityRow[],
  dbClient: DbClient = db,
) {
  const [challengesResult, challengeEntriesResult, rows] = await Promise.all([
    dbClient.select().from(challengesTable).orderBy(asc(challengesTable.endsAt)),
    dbClient
      .select({ challengeId: challengeEntries.challengeId, createdAt: challengeEntries.createdAt })
      .from(challengeEntries)
      .where(eq(challengeEntries.userId, userId)),
    activityRows ? Promise.resolve(activityRows) : getUserActivityRows(userId, dbClient),
  ]);

  const joinedAtByChallengeId = new Map(
    challengeEntriesResult.map((row) => [row.challengeId, row.createdAt]),
  );

  return challengesResult.map((row) => {
    const joinedAt = joinedAtByChallengeId.get(row.id);

    return {
      id: row.id,
      name: row.name,
      sport: row.sport,
      goalKm: Number(row.goalKm),
      myProgressKm: joinedAt
        ? computeChallengeProgress(
            rows,
            { sport: row.sport, metricType: row.metricType, endsAt: endOfChallengeDay(row.endsAt) },
            joinedAt,
          )
        : 0,
      participants: row.participants,
      endsAt: row.endsAt,
      badge: row.badge,
      joined: joinedAtByChallengeId.has(row.id),
    };
  });
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

export async function buildBootstrap(userId: string) {
  const [
    usersResult,
    followsResult,
    activityPage,
    segmentsResult,
    mySegmentBests,
    clubsResult,
    clubMembershipsResult,
    challenges,
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
    buildChallengesDto(userId),
  ]);

  const followedIds = new Set(followsResult.map((row) => row.followedId));
  const joinedClubIds = new Set(clubMembershipsResult.map((row) => row.clubId));
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

type CreateActivityInput = {
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
};

export async function createActivity(
  input: CreateActivityInput & { date?: Date },
  dbClient: DbClient = db,
) {
  const id = `act-${randomUUID()}`;

  await dbClient.insert(activitiesTable).values({
    id,
    athleteId: input.userId,
    sport: input.sport,
    title: input.title,
    description: input.description ?? null,
    date: input.date ?? new Date(),
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

export type ChallengeProgressUpdate = {
  id: string;
  name: string;
  sport: string;
  badge: string;
  goalKm: number;
  metricType: string;
  contribution: number;
  progressAfter: number;
  completed: boolean;
};

// Inserts the activity, then reports how it affected every joined,
// matching-sport challenge this activity actually counted toward —
// including ones it merely advanced, not just ones it completed.
// `completed` is derived by comparing progress before vs. after this
// activity (using the same computeChallengeProgress used everywhere else),
// rather than a stored "completed" flag — so a challenge that was already
// complete before this activity is never re-flagged, with no extra state
// to keep in sync.
//
// Runs inside a transaction with the user's matching challengeEntries rows
// locked (SELECT ... FOR UPDATE) before reading their activity history. Two
// concurrent saves for the same user (e.g. a retried request) would
// otherwise both read the pre-insert activity total and could both
// independently conclude they "crossed the goal", firing two completions
// for one real event. The lock forces the second transaction to wait for
// the first to commit its insert before it reads, so its own before/after
// comparison sees the first activity already counted.
export async function createActivityWithChallengeUpdates(input: CreateActivityInput) {
  return db.transaction(async (tx) => {
    const now = new Date();

    const joinedMatchingChallenges = await tx
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
      .where(
        and(eq(challengeEntries.userId, input.userId), eq(challengesTable.sport, input.sport)),
      )
      .for("update", { of: challengeEntries });

    const existingRows = await getUserActivityRows(input.userId, tx);

    const newRow: ProgressActivityRow = {
      sport: input.sport,
      distanceKm: input.distanceKm,
      elevationM: input.elevationM,
      date: now,
    };
    const rowsAfter = [...existingRows, newRow];

    const challengeUpdates: ChallengeProgressUpdate[] = [];

    for (const challenge of joinedMatchingChallenges) {
      const goalKm = Number(challenge.goalKm);
      const window = {
        sport: challenge.sport,
        metricType: challenge.metricType,
        endsAt: endOfChallengeDay(challenge.endsAt),
      };
      const progressBefore = computeChallengeProgress(existingRows, window, challenge.joinedAt);
      const progressAfter = computeChallengeProgress(rowsAfter, window, challenge.joinedAt);

      // progressAfter === progressBefore means this activity fell outside
      // the challenge's window (e.g. joined but the challenge has since
      // ended) — nothing to report for it.
      if (progressAfter > progressBefore) {
        challengeUpdates.push({
          id: challenge.id,
          name: challenge.name,
          sport: challenge.sport,
          badge: challenge.badge,
          goalKm,
          metricType: challenge.metricType,
          contribution: challenge.metricType === "elevation_m" ? input.elevationM : input.distanceKm,
          progressAfter,
          completed: progressBefore < goalKm && progressAfter >= goalKm,
        });
      }
    }

    const activityId = await createActivity({ ...input, date: now }, tx);
    const challenges = await buildChallengesDto(input.userId, rowsAfter, tx);

    return { activityId, challenges, challengeUpdates };
  });
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
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ challengeId: challengeEntries.challengeId })
      .from(challengeEntries)
      .where(
        and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)),
      )
      .limit(1);
    const challengeRows = await tx
      .select({ id: challengesTable.id })
      .from(challengesTable)
      .where(eq(challengesTable.id, challengeId))
      .limit(1);

    if (!challengeRows[0]) {
      throw new Error("Challenge not found");
    }

    const isLeaving = existing.length > 0;

    if (isLeaving) {
      await tx
        .delete(challengeEntries)
        .where(
          and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)),
        );
    } else {
      await tx.insert(challengeEntries).values({ userId, challengeId });
    }

    // Atomic SQL-level increment/decrement (not read-then-write in JS) so
    // concurrent join/leave requests from different users can't race and
    // corrupt the counter.
    const [updated] = await tx
      .update(challengesTable)
      .set({
        participants: isLeaving
          ? sql`greatest(${challengesTable.participants} - 1, 0)`
          : sql`${challengesTable.participants} + 1`,
      })
      .where(eq(challengesTable.id, challengeId))
      .returning({ participants: challengesTable.participants });

    return {
      joined: !isLeaving,
      participants: updated.participants,
    };
  });
}
