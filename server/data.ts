import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, lt, min, or, sql, type SQL } from "drizzle-orm";
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

const BOOTSTRAP_ACTIVITY_LIMIT = 40;
const MAX_ACTIVITY_PAGE_LIMIT = 100;

type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

type ActivityRow = typeof activitiesTable.$inferSelect;
type AthleteRow = typeof users.$inferSelect;
type ChallengeRow = typeof challengesTable.$inferSelect;

// Drizzle's transaction client has a different type than db. Accept both.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type ChallengeCredit = {
  challengeId: string;
  before: number;
  after: number;
  completedNow: boolean;
};

type PendingCompletion = {
  challengeId: string;
  suggestedChallengeId: string | null;
};

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
  challengeCredits?: ChallengeCredit[];
  newCompletions?: PendingCompletion[];
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

// Compute per-challenge progress for the given user and challenge IDs in a single query.
// Returns 0 for any challenge with no qualifying activities.
async function computeChallengeProgress(
  executor: DbOrTx,
  userId: string,
  challengeIds: string[],
): Promise<Map<string, number>> {
  if (challengeIds.length === 0) return new Map();

  const rows = await executor
    .select({
      challengeId: challengeEntries.challengeId,
      progress: sql<string>`COALESCE(SUM(CASE WHEN ${challengesTable.metricType} = 'elevation_m'
        THEN ${activitiesTable.elevationM}
        ELSE CAST(${activitiesTable.distanceKm} AS NUMERIC) END), 0)`,
    })
    .from(challengeEntries)
    .innerJoin(challengesTable, eq(challengesTable.id, challengeEntries.challengeId))
    .leftJoin(
      activitiesTable,
      and(
        eq(activitiesTable.athleteId, userId),
        or(
          eq(challengesTable.sport, "Multisport"),
          eq(activitiesTable.sport, challengesTable.sport),
        ),
        sql`${activitiesTable.date} >= ${challengesTable.startsAt}::timestamp AT TIME ZONE 'UTC'`,
        sql`${activitiesTable.date} < (${challengesTable.endsAt} + 1)::timestamp AT TIME ZONE 'UTC'`,
      ),
    )
    .where(
      and(eq(challengeEntries.userId, userId), inArray(challengeEntries.challengeId, challengeIds)),
    )
    .groupBy(challengeEntries.challengeId);

  return new Map(rows.map((row) => [row.challengeId, Number(row.progress)]));
}

// Pick the best challenge to suggest after a completion: same sport, earliest end date.
// Falls back to any unjoined active challenge. Returns null when none exist.
function selectSuggestedChallenge(
  completedId: string,
  completedSport: string,
  allChallenges: ChallengeRow[],
  joinedIds: Set<string>,
  at: Date,
): string | null {
  const today = at.toISOString().slice(0, 10);
  const eligible = allChallenges.filter(
    (c) => !joinedIds.has(c.id) && c.id !== completedId && c.endsAt >= today,
  );
  const sameSport = eligible.filter((c) => c.sport === completedSport || c.sport === "Multisport");
  const pool = sameSport.length > 0 ? sameSport : eligible;
  pool.sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  return pool[0]?.id ?? null;
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
    challengesResult,
    challengeEntriesResult,
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
    db.select().from(challengesTable).orderBy(asc(challengesTable.endsAt)),
    db
      .select({
        challengeId: challengeEntries.challengeId,
        completedAt: challengeEntries.completedAt,
        completionSeenAt: challengeEntries.completionSeenAt,
      })
      .from(challengeEntries)
      .where(eq(challengeEntries.userId, userId)),
  ]);

  const followedIds = new Set(followsResult.map((row) => row.followedId));
  const joinedClubIds = new Set(clubMembershipsResult.map((row) => row.clubId));
  const joinedChallengeIds = new Set(challengeEntriesResult.map((row) => row.challengeId));
  const myBestBySegment = new Map(
    mySegmentBests.map((row) => [row.segmentId, row.effortSeconds ?? undefined]),
  );

  // Compute per-challenge progress (correct sport + date boundary scoping)
  const progressMap = await computeChallengeProgress(db, userId, Array.from(joinedChallengeIds));

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

  const challenges = challengesResult.map((row) => ({
    id: row.id,
    name: row.name,
    sport: row.sport,
    goalKm: Number(row.goalKm),
    myProgressKm: joinedChallengeIds.has(row.id)
      ? Number((progressMap.get(row.id) ?? 0).toFixed(2))
      : 0,
    participants: row.participants,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    badge: row.badge,
    metricType: row.metricType,
    joined: joinedChallengeIds.has(row.id),
  }));

  // Pending completions: completed but not yet acknowledged
  const pendingCompletions: PendingCompletion[] = [];
  const allJoinedIds = joinedChallengeIds;

  for (const entry of challengeEntriesResult) {
    if (entry.completedAt !== null && entry.completionSeenAt === null) {
      const completedChallenge = challengesResult.find((c) => c.id === entry.challengeId);
      pendingCompletions.push({
        challengeId: entry.challengeId,
        suggestedChallengeId: completedChallenge
          ? selectSuggestedChallenge(
              entry.challengeId,
              completedChallenge.sport,
              challengesResult,
              allJoinedIds,
              new Date(),
            )
          : null,
      });
    }
  }

  return {
    me,
    athletes: [me, ...athletes.filter((athlete) => athlete.id !== "me")],
    activities: activityPage.activities,
    activityNextCursor: activityPage.nextCursor,
    segments,
    clubs,
    challenges,
    pendingCompletions,
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
}): Promise<{
  id: string;
  challengeCredits: ChallengeCredit[];
  newCompletions: PendingCompletion[];
}> {
  const activityDate = new Date();
  // Normalize to 2 decimal places, matching numeric(10,2) storage
  const distanceKm = Math.round(input.distanceKm * 100) / 100;

  return db.transaction(async (tx) => {
    // Lock all active challenge entries matching this activity's sport.
    // Includes already-completed challenges so credits continue accumulating.
    // ORDER BY challenge_id for consistent lock ordering to prevent deadlocks.
    const lockedEntries = await tx.execute(sql`
      SELECT ce.challenge_id, ce.completed_at, c.goal_km, c.metric_type, c.sport
      FROM challenge_entries ce
      JOIN challenges c ON c.id = ce.challenge_id
      WHERE ce.user_id = ${input.userId}
        AND (c.sport = 'Multisport' OR c.sport = ${input.sport})
        AND ${activityDate} >= c.starts_at::timestamp AT TIME ZONE 'UTC'
        AND ${activityDate} < (c.ends_at + 1)::timestamp AT TIME ZONE 'UTC'
      ORDER BY ce.challenge_id
      FOR UPDATE OF ce
    `);

    type LockedEntry = {
      challenge_id: string;
      completed_at: Date | null;
      goal_km: string;
      metric_type: string;
      sport: string;
    };
    const entries = lockedEntries.rows as LockedEntry[];
    const lockedChallengeIds = entries.map((e) => e.challenge_id);

    // Compute progress before this activity is inserted
    const beforeMap = await computeChallengeProgress(tx, input.userId, lockedChallengeIds);

    // Insert the activity
    const id = `act-${randomUUID()}`;

    await tx.insert(activitiesTable).values({
      id,
      athleteId: input.userId,
      sport: input.sport,
      title: input.title,
      description: input.description ?? null,
      date: activityDate,
      distanceKm: String(distanceKm),
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

    // Compute credits for each locked challenge
    const challengeCredits: ChallengeCredit[] = [];
    const newlyCompletedIds: string[] = [];

    for (const entry of entries) {
      const goal = Number(entry.goal_km);
      const before = Number(beforeMap.get(entry.challenge_id) ?? 0);
      const contribution = entry.metric_type === "elevation_m" ? input.elevationM : distanceKm;
      const after = before + contribution;
      const completedNow = entry.completed_at === null && before < goal && after >= goal;

      challengeCredits.push({ challengeId: entry.challenge_id, before, after, completedNow });

      if (completedNow) {
        newlyCompletedIds.push(entry.challenge_id);
      }
    }

    // Persist first-time completions
    if (newlyCompletedIds.length > 0) {
      await tx
        .update(challengeEntries)
        .set({ completedAt: activityDate })
        .where(
          and(
            eq(challengeEntries.userId, input.userId),
            inArray(challengeEntries.challengeId, newlyCompletedIds),
            sql`${challengeEntries.completedAt} IS NULL`,
          ),
        );
    }

    // Fetch the full catalog and all of the user's joined challenges for suggestion logic.
    // The locked query above only covers active, sport-matched challenges.
    const [allChallenges, allJoinedRows] = await Promise.all([
      tx.select().from(challengesTable),
      tx
        .select({ challengeId: challengeEntries.challengeId })
        .from(challengeEntries)
        .where(eq(challengeEntries.userId, input.userId)),
    ]);
    const allJoinedIds = new Set(allJoinedRows.map((r) => r.challengeId));

    const newCompletions: PendingCompletion[] = newlyCompletedIds.map((completedId) => {
      const completedEntry = entries.find((e) => e.challenge_id === completedId)!;
      return {
        challengeId: completedId,
        suggestedChallengeId: selectSuggestedChallenge(
          completedId,
          completedEntry.sport,
          allChallenges,
          allJoinedIds,
          activityDate,
        ),
      };
    });

    return { id, challengeCredits, newCompletions };
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
  const existing = await db
    .select({ challengeId: challengeEntries.challengeId })
    .from(challengeEntries)
    .where(and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)))
    .limit(1);
  const challengeRows = await db
    .select({ participants: challengesTable.participants })
    .from(challengesTable)
    .where(eq(challengesTable.id, challengeId))
    .limit(1);
  const challenge = challengeRows[0];

  if (!challenge) {
    throw new Error("Challenge not found");
  }

  if (existing.length > 0) {
    await db
      .delete(challengeEntries)
      .where(
        and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)),
      );
  } else {
    await db.insert(challengeEntries).values({ userId, challengeId });
  }

  const participants =
    existing.length > 0 ? Math.max(challenge.participants - 1, 0) : challenge.participants + 1;
  await db.update(challengesTable).set({ participants }).where(eq(challengesTable.id, challengeId));

  return {
    joined: existing.length === 0,
    participants,
  };
}

export async function acknowledgeChallengeCompletion(userId: string, challengeId: string) {
  await db
    .update(challengeEntries)
    .set({ completionSeenAt: new Date() })
    .where(
      and(
        eq(challengeEntries.userId, userId),
        eq(challengeEntries.challengeId, challengeId),
        isNotNull(challengeEntries.completedAt),
      ),
    );
}
