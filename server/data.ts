import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, lt, min, sum, type SQL } from "drizzle-orm";
import { db } from "./db.js";
import {
  activities as activitiesTable,
  activityComments,
  activityKudos,
  activitySegments,
  activitySplits,
  challengeActivities,
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
  buildLeaderboard,
  computeProgress,
  daysRemaining,
  projectPace,
  splitByStatus,
  type CandidateActivity,
  type ChallengeMetric,
  type ChallengeWindow,
  type ContributionStatus,
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
    challengesResult,
    challengeEntriesResult,
    challengeProgressResult,
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
      .select({ challengeId: challengeEntries.challengeId })
      .from(challengeEntries)
      .where(eq(challengeEntries.userId, userId)),
    db
      .select({
        sport: activitiesTable.sport,
        distanceKm: sum(activitiesTable.distanceKm),
        elevationM: sum(activitiesTable.elevationM),
      })
      .from(activitiesTable)
      .where(eq(activitiesTable.athleteId, userId))
      .groupBy(activitiesTable.sport),
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

  const distanceBySport = new Map<string, number>();
  let totalElevation = 0;

  for (const row of challengeProgressResult) {
    distanceBySport.set(row.sport, (distanceBySport.get(row.sport) ?? 0) + Number(row.distanceKm));
    totalElevation += Number(row.elevationM);
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
    myProgressKm:
      row.metricType === "elevation_m"
        ? totalElevation
        : Number((distanceBySport.get(row.sport) ?? 0).toFixed(1)),
    participants: row.participants,
    endsAt: row.endsAt,
    badge: row.badge,
    joined: joinedChallengeIds.has(row.id),
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

const CONTRIBUTION_STATUSES: ContributionStatus[] = ["counted", "dismissed"];

export function isContributionStatus(value: string): value is ContributionStatus {
  return (CONTRIBUTION_STATUSES as string[]).includes(value);
}

async function loadChallengeWindow(challengeId: string) {
  const rows = await db
    .select()
    .from(challengesTable)
    .where(eq(challengesTable.id, challengeId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const window: ChallengeWindow = {
    sport: row.sport,
    metricType: row.metricType as ChallengeMetric,
    goal: Number(row.goalKm),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };

  return { row, window };
}

function toCandidate(row: ActivityRow): CandidateActivity {
  return {
    id: row.id,
    athleteId: row.athleteId,
    sport: row.sport,
    title: row.title,
    date: row.date.toISOString(),
    distanceKm: Number(row.distanceKm),
    elevationM: row.elevationM,
  };
}

/**
 * Everything the challenge tracker page needs in one round trip: the athlete's
 * own qualifying activity split by confirmation state, their progress against
 * the goal, pace projection, and the leaderboard.
 */
export async function getChallengeTracker(userId: string, challengeId: string, now = new Date()) {
  const loaded = await loadChallengeWindow(challengeId);

  if (!loaded) {
    return undefined;
  }

  const { row, window } = loaded;

  const [fieldRows, contributionRows, entryRows] = await Promise.all([
    // Sport and window are filtered in SQL; `qualifies` re-checks in the pure
    // layer so the rule has exactly one definition for tests to target.
    db
      .select()
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.sport, window.sport),
          gte(activitiesTable.date, new Date(`${window.startsAt}T00:00:00.000Z`)),
          lt(activitiesTable.date, new Date(`${window.endsAt}T23:59:59.999Z`)),
        ),
      ),
    db
      .select({
        activityId: challengeActivities.activityId,
        status: challengeActivities.status,
      })
      .from(challengeActivities)
      .where(
        and(
          eq(challengeActivities.userId, userId),
          eq(challengeActivities.challengeId, challengeId),
        ),
      ),
    db
      .select({ challengeId: challengeEntries.challengeId })
      .from(challengeEntries)
      .where(
        and(eq(challengeEntries.userId, userId), eq(challengeEntries.challengeId, challengeId)),
      )
      .limit(1),
  ]);

  const field = fieldRows.map(toCandidate);
  const mine = field.filter((activity) => activity.athleteId === userId);
  const contributions = contributionRows.map((contribution) => ({
    activityId: contribution.activityId,
    status: contribution.status as ContributionStatus,
  }));

  const split = splitByStatus(mine, contributions, window);
  const progress = computeProgress(split, window);
  const pace = projectPace(progress, window, now);
  const leaderboard = buildLeaderboard(field, window, {
    selfId: userId,
    selfTotal: progress.countedTotal,
    now,
  });

  const unit = window.metricType === "elevation_m" ? "m" : "km";

  return {
    challenge: {
      id: row.id,
      name: row.name,
      sport: row.sport,
      goal: window.goal,
      unit,
      metricType: window.metricType,
      badge: row.badge,
      participants: row.participants,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      joined: entryRows.length > 0,
      daysLeft: daysRemaining(window, now),
      closed: daysRemaining(window, now) === 0,
    },
    progress,
    pace,
    pending: split.pending.map(toContributionDto),
    counted: split.counted.map(toContributionDto),
    leaderboard: leaderboard.map((entry) => ({
      ...entry,
      athleteId: aliasUserId(entry.athleteId, userId),
    })),
  };
}

function toContributionDto(activity: CandidateActivity) {
  return {
    id: activity.id,
    title: activity.title,
    sport: activity.sport,
    date: activity.date,
    distanceKm: activity.distanceKm,
    elevationM: activity.elevationM,
  };
}

/**
 * Record (or clear) the athlete's decision about one activity. Passing
 * `undefined` removes the row, returning the activity to the pending list so a
 * mis-tap is recoverable.
 */
export async function setChallengeActivityStatus(
  userId: string,
  challengeId: string,
  activityId: string,
  status: ContributionStatus | undefined,
  now = new Date(),
) {
  const loaded = await loadChallengeWindow(challengeId);

  if (!loaded) {
    throw new ChallengeTrackerError("Challenge not found", 404);
  }

  const activityRows = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, activityId))
    .limit(1);
  const activityRow = activityRows[0];

  if (!activityRow) {
    throw new ChallengeTrackerError("Activity not found", 404);
  }

  // Confirming someone else's activity would let an athlete inflate their own
  // total from the public feed.
  if (activityRow.athleteId !== userId) {
    throw new ChallengeTrackerError("You can only confirm your own activities", 403);
  }

  const candidate = toCandidate(activityRow);

  if (candidate.sport !== loaded.window.sport) {
    throw new ChallengeTrackerError("Activity sport does not match this challenge", 409);
  }

  if (
    candidate.date.slice(0, 10) < loaded.window.startsAt ||
    candidate.date.slice(0, 10) > loaded.window.endsAt
  ) {
    throw new ChallengeTrackerError("Activity falls outside the challenge window", 409);
  }

  if (status === undefined) {
    await db
      .delete(challengeActivities)
      .where(
        and(
          eq(challengeActivities.userId, userId),
          eq(challengeActivities.challengeId, challengeId),
          eq(challengeActivities.activityId, activityId),
        ),
      );
  } else {
    await db
      .insert(challengeActivities)
      .values({ userId, challengeId, activityId, status })
      .onConflictDoUpdate({
        target: [
          challengeActivities.userId,
          challengeActivities.challengeId,
          challengeActivities.activityId,
        ],
        set: { status },
      });
  }

  return getChallengeTracker(userId, challengeId, now);
}

export class ChallengeTrackerError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
