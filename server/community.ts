import { randomUUID } from "node:crypto";
import { and, count, desc, eq, notInArray } from "drizzle-orm";
import { db } from "./db.js";
import {
  activities,
  challenges,
  challengeEntries,
  communityChallenges,
  communityContributionReactions,
  communityContributions,
  communityNotificationReceipts,
  follows,
  users,
} from "./db/schema.js";
import {
  approximateCommunityLocation,
  buildCommunityView,
  communityContributionId,
  type CommunityScope,
} from "./community-view.js";

const DEFAULT_CHALLENGE_ID = "community-boulder";

export class NoEligibleCommunityActivityError extends Error {
  constructor() {
    super("No eligible run is available for this challenge");
    this.name = "NoEligibleCommunityActivityError";
  }
}

async function ensureNotification(userId: string, challengeId: string) {
  const existing = await db
    .select()
    .from(communityNotificationReceipts)
    .where(
      and(
        eq(communityNotificationReceipts.recipientId, userId),
        eq(communityNotificationReceipts.challengeId, challengeId),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const anchors = await db
    .select({ id: communityContributions.id })
    .from(communityContributions)
    .where(
      and(
        eq(communityContributions.challengeId, challengeId),
        eq(communityContributions.id, "momentum-maya"),
      ),
    )
    .limit(1);

  if (!anchors[0]) return null;

  const id = `momentum-notification-${randomUUID()}`;
  const inserted = await db
    .insert(communityNotificationReceipts)
    .values({
      id,
      challengeId,
      recipientId: userId,
      anchorContributionId: anchors[0].id,
      bundledContributions: 4,
      bundledDistanceKm: "24.10",
    })
    .returning();

  return inserted[0] ?? null;
}

async function getEligibleActivity(userId: string, challengeId: string) {
  const contributedActivities = await db
    .select({ activityId: communityContributions.activityId })
    .from(communityContributions)
    .where(
      and(
        eq(communityContributions.challengeId, challengeId),
        eq(communityContributions.userId, userId),
      ),
    );
  const activityIds = contributedActivities
    .map((row) => row.activityId)
    .filter((id): id is string => Boolean(id));

  const filters = [eq(activities.athleteId, userId), eq(activities.sport, "Run")];
  if (activityIds.length > 0) filters.push(notInArray(activities.id, activityIds));

  const [rows, badgeRows] = await Promise.all([
    db
      .select({ id: activities.id, title: activities.title, distanceKm: activities.distanceKm })
      .from(activities)
      .where(and(...filters))
      .orderBy(desc(activities.date))
      .limit(1),
    db.select({ count: count() }).from(challengeEntries).where(eq(challengeEntries.userId, userId)),
  ]);

  return rows[0]
    ? {
        activityId: rows[0].id,
        title: rows[0].title,
        distanceKm: Number(rows[0].distanceKm),
        badgesEarned: badgeRows[0]?.count ?? 0,
      }
    : null;
}

export async function getCommunityChallenge(
  userId: string,
  challengeId = DEFAULT_CHALLENGE_ID,
  scope: CommunityScope = "all",
) {
  const challengeRows = await db
    .select({
      id: challenges.id,
      name: challenges.name,
      goalKm: challenges.goalKm,
      endsAt: challenges.endsAt,
      badge: challenges.badge,
      slug: communityChallenges.slug,
      localArea: communityChallenges.localArea,
      startsAt: communityChallenges.startsAt,
      baselineDistanceKm: communityChallenges.baselineDistanceKm,
      baselinePeople: communityChallenges.baselinePeople,
      baselineBadges: communityChallenges.baselineBadges,
      liveMovingCount: communityChallenges.liveMovingCount,
    })
    .from(communityChallenges)
    .innerJoin(challenges, eq(challenges.id, communityChallenges.challengeId))
    .where(eq(communityChallenges.challengeId, challengeId))
    .limit(1);
  const challenge = challengeRows[0];

  if (!challenge) return null;

  const [allContributionRows, reactionRows, followedRows, notification, eligibleActivity] =
    await Promise.all([
      db
        .select({
          id: communityContributions.id,
          athleteId: communityContributions.userId,
          name: users.name,
          avatar: users.avatarUrl,
          city: communityContributions.localArea,
          distanceKm: communityContributions.distanceKm,
          note: communityContributions.note,
          latitude: communityContributions.latitude,
          longitude: communityContributions.longitude,
          routeKey: communityContributions.routeKey,
          tone: communityContributions.tone,
          baseKudos: communityContributions.baseKudos,
          replies: communityContributions.repliesCount,
          publishedAt: communityContributions.publishedAt,
        })
        .from(communityContributions)
        .innerJoin(users, eq(users.id, communityContributions.userId))
        .where(eq(communityContributions.challengeId, challengeId))
        .orderBy(desc(communityContributions.publishedAt)),
      db
        .select({
          contributionId: communityContributionReactions.contributionId,
          userId: communityContributionReactions.userId,
        })
        .from(communityContributionReactions)
        .innerJoin(
          communityContributions,
          eq(communityContributions.id, communityContributionReactions.contributionId),
        )
        .where(eq(communityContributions.challengeId, challengeId)),
      db
        .select({ followedId: follows.followedId })
        .from(follows)
        .where(eq(follows.followerId, userId)),
      ensureNotification(userId, challengeId),
      getEligibleActivity(userId, challengeId),
    ]);

  return {
    ...buildCommunityView({
      userId,
      scope,
      challenge,
      contributions: allContributionRows,
      reactions: reactionRows,
      followedIds: followedRows.map((row) => row.followedId),
      notification,
    }),
    eligibleActivity,
  };
}

export async function postCommunityContribution(input: {
  userId: string;
  challengeId?: string;
  activityId?: string | null;
  note: string;
}) {
  const challengeId = input.challengeId ?? DEFAULT_CHALLENGE_ID;
  const existing = await db
    .select({ id: communityContributions.id })
    .from(communityContributions)
    .where(
      and(
        eq(communityContributions.challengeId, challengeId),
        eq(communityContributions.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(communityContributions)
      .set({ note: input.note, publishedAt: new Date() })
      .where(eq(communityContributions.id, existing[0].id));
    return getCommunityChallenge(input.userId, challengeId);
  }

  const eligible = await getEligibleActivity(input.userId, challengeId);
  if (!eligible) {
    throw new NoEligibleCommunityActivityError();
  }
  const location = approximateCommunityLocation(input.userId);
  const id = communityContributionId(challengeId, input.userId);
  const activityId =
    input.activityId && input.activityId === eligible.activityId
      ? input.activityId
      : eligible.activityId;
  const distanceKm = eligible.distanceKm;

  await db.transaction(async (tx) => {
    await tx
      .insert(challengeEntries)
      .values({ userId: input.userId, challengeId })
      .onConflictDoNothing();
    await tx
      .insert(communityContributions)
      .values({
        id,
        challengeId,
        userId: input.userId,
        activityId,
        distanceKm: String(distanceKm),
        note: input.note,
        localArea: "Boulder",
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        routeKey: "me",
        tone: "orange",
      })
      .onConflictDoUpdate({
        target: [communityContributions.challengeId, communityContributions.userId],
        set: { note: input.note, publishedAt: new Date() },
      });
  });

  return getCommunityChallenge(input.userId, challengeId);
}

export async function toggleCommunityReaction(userId: string, contributionId: string) {
  const existing = await db
    .select({ contributionId: communityContributionReactions.contributionId })
    .from(communityContributionReactions)
    .where(
      and(
        eq(communityContributionReactions.userId, userId),
        eq(communityContributionReactions.contributionId, contributionId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .delete(communityContributionReactions)
      .where(
        and(
          eq(communityContributionReactions.userId, userId),
          eq(communityContributionReactions.contributionId, contributionId),
        ),
      );
  } else {
    await db.insert(communityContributionReactions).values({ userId, contributionId });
  }

  const contributionRows = await db
    .select({ baseKudos: communityContributions.baseKudos })
    .from(communityContributions)
    .where(eq(communityContributions.id, contributionId))
    .limit(1);
  if (!contributionRows[0]) return null;

  const reactions = await db
    .select({ userId: communityContributionReactions.userId })
    .from(communityContributionReactions)
    .where(eq(communityContributionReactions.contributionId, contributionId));

  return {
    reacted: !existing[0],
    kudos: contributionRows[0].baseKudos + reactions.length,
  };
}

export async function updateCommunityNotification(
  userId: string,
  notificationId: string,
  action: "open" | "dismiss",
) {
  const set =
    action === "open"
      ? { openedAt: new Date(), active: false }
      : { dismissedAt: new Date(), active: false };
  const rows = await db
    .update(communityNotificationReceipts)
    .set(set)
    .where(
      and(
        eq(communityNotificationReceipts.id, notificationId),
        eq(communityNotificationReceipts.recipientId, userId),
      ),
    )
    .returning({ id: communityNotificationReceipts.id });

  return rows[0] ?? null;
}
