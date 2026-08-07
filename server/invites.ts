import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db.js";
import {
  activities as activitiesTable,
  follows,
  inviteClaims,
  invites as invitesTable,
  users,
} from "./db/schema.js";
import {
  HttpError,
  buildInviteMessage,
  formatDuration,
  generateInviteCode,
  inviteExpiryFrom,
  inviteState,
  inviteUrl,
  isEditedClaim,
  isUniqueViolation,
  type Sport,
} from "./invite-codes.js";

export { HttpError } from "./invite-codes.js";

const ALREADY_CLAIMED = "You've already logged this activity";

export async function createInvite(input: {
  userId: string;
  activityId: string;
  origin: string;
}): Promise<{ code: string; url: string; message: string }> {
  const activityRows = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, input.activityId))
    .limit(1);
  const activity = activityRows[0];

  if (!activity) {
    throw new HttpError(404, "Activity not found");
  }

  if (activity.athleteId !== input.userId) {
    throw new HttpError(403, "You can only invite people to your own activity");
  }

  const inviterRows = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  const inviter = inviterRows[0];

  if (!inviter) {
    throw new HttpError(404, "Inviter not found");
  }

  const code = generateInviteCode();
  const url = inviteUrl(input.origin, code);
  const message = buildInviteMessage({
    inviterName: inviter.name,
    sport: activity.sport as Sport,
    distanceKm: Number(activity.distanceKm),
    durationLabel: formatDuration(activity.movingSeconds),
    elevationM: activity.elevationM,
    url,
  });

  await db.insert(invitesTable).values({
    id: `inv-${randomUUID()}`,
    code,
    activityId: input.activityId,
    inviterId: input.userId,
    message,
    expiresAt: inviteExpiryFrom(new Date()),
  });

  return { code, url, message };
}

/**
 * The public view of an invite. Deliberately narrow: it is served to anyone holding
 * the link, so it carries the inviter's public profile fields only — never their
 * email, and never the rest of their training history.
 */
export async function getPublicInvite(code: string, viewerId: string | null) {
  const rows = await db
    .select({
      invite: invitesTable,
      activity: activitiesTable,
      inviterName: users.name,
      inviterAvatar: users.avatarUrl,
      inviterCity: users.city,
    })
    .from(invitesTable)
    .innerJoin(activitiesTable, eq(activitiesTable.id, invitesTable.activityId))
    .innerJoin(users, eq(users.id, invitesTable.inviterId))
    .where(eq(invitesTable.code, code))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  const state = inviteState(row.invite, new Date());
  const claimCount = await countClaims(row.invite.id);

  let viewerClaimActivityId: string | null = null;

  if (viewerId) {
    const existing = await db
      .select({ activityId: inviteClaims.activityId })
      .from(inviteClaims)
      .where(and(eq(inviteClaims.inviteId, row.invite.id), eq(inviteClaims.userId, viewerId)))
      .limit(1);
    viewerClaimActivityId = existing[0]?.activityId ?? null;
  }

  return {
    code: row.invite.code,
    state,
    inviter: {
      name: row.inviterName,
      avatar: row.inviterAvatar,
      city: row.inviterCity,
    },
    activity: {
      sport: row.activity.sport as Sport,
      title: row.activity.title,
      date: row.activity.date.toISOString(),
      distanceKm: Number(row.activity.distanceKm),
      movingSeconds: row.activity.movingSeconds,
      elevationM: row.activity.elevationM,
      avgSpeedKmh: row.activity.avgSpeedKmh === null ? undefined : Number(row.activity.avgSpeedKmh),
      avgPaceSecPerKm: row.activity.avgPaceSecPerKm ?? undefined,
      routeSeed: row.activity.routeSeed,
    },
    claimCount,
    isInviter: viewerId !== null && viewerId === row.invite.inviterId,
    viewerClaimActivityId,
  };
}

async function countClaims(inviteId: string) {
  const rows = await db
    .select({ userId: inviteClaims.userId })
    .from(inviteClaims)
    .where(eq(inviteClaims.inviteId, inviteId));

  return rows.length;
}

/** The inviter's own view: which invites exist for an activity, and who claimed them. */
export async function listInvitesForActivity(userId: string, activityId: string) {
  const inviteRows = await db
    .select()
    .from(invitesTable)
    .where(and(eq(invitesTable.activityId, activityId), eq(invitesTable.inviterId, userId)))
    .orderBy(asc(invitesTable.createdAt));

  if (inviteRows.length === 0) {
    return { invites: [] };
  }

  const now = new Date();
  const invites = await Promise.all(
    inviteRows.map(async (invite) => {
      const claims = await db
        .select({
          userId: inviteClaims.userId,
          activityId: inviteClaims.activityId,
          wasEdited: inviteClaims.wasEdited,
          claimedAt: inviteClaims.claimedAt,
          name: users.name,
          avatar: users.avatarUrl,
        })
        .from(inviteClaims)
        .innerJoin(users, eq(users.id, inviteClaims.userId))
        .where(eq(inviteClaims.inviteId, invite.id))
        .orderBy(asc(inviteClaims.claimedAt));

      return {
        code: invite.code,
        message: invite.message,
        state: inviteState(invite, now),
        createdAt: invite.createdAt.toISOString(),
        claims: claims.map((claim) => ({
          athleteId: claim.userId,
          name: claim.name,
          avatar: claim.avatar,
          activityId: claim.activityId,
          wasEdited: claim.wasEdited,
          claimedAt: claim.claimedAt.toISOString(),
        })),
      };
    }),
  );

  return { invites };
}

/**
 * Turns an invite into a real activity on the claimer's own record. Everything happens
 * in one transaction so a claim can never leave a dangling activity behind, and the
 * (invite, user) primary key is what actually enforces one-claim-per-person.
 */
export async function claimInvite(input: {
  code: string;
  userId: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  title: string;
  description?: string;
}): Promise<{ activityId: string; wasEdited: boolean }> {
  const rows = await db
    .select({ invite: invitesTable, activity: activitiesTable })
    .from(invitesTable)
    .innerJoin(activitiesTable, eq(activitiesTable.id, invitesTable.activityId))
    .where(eq(invitesTable.code, input.code))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new HttpError(404, "That invite link doesn't exist");
  }

  if (inviteState(row.invite, new Date()) !== "open") {
    throw new HttpError(410, "That invite link has expired");
  }

  if (row.invite.inviterId === input.userId) {
    throw new HttpError(409, "This is your own invite — the activity is already on your log");
  }

  // Fast path for the common case. This is advisory only — two concurrent requests can
  // both pass it, which is why the transaction below also translates the primary-key
  // rejection into the same 409 instead of letting a raw driver error become a 500.
  const existing = await db
    .select({ activityId: inviteClaims.activityId })
    .from(inviteClaims)
    .where(and(eq(inviteClaims.inviteId, row.invite.id), eq(inviteClaims.userId, input.userId)))
    .limit(1);

  if (existing[0]) {
    throw new HttpError(409, ALREADY_CLAIMED);
  }

  if (input.distanceKm <= 0 || input.movingSeconds <= 0) {
    throw new HttpError(400, "Distance and duration are required");
  }

  const sport = row.activity.sport as Sport;
  const wasEdited = isEditedClaim(
    {
      distanceKm: Number(row.activity.distanceKm),
      movingSeconds: row.activity.movingSeconds,
      elevationM: row.activity.elevationM,
    },
    {
      distanceKm: input.distanceKm,
      movingSeconds: input.movingSeconds,
      elevationM: input.elevationM,
    },
  );

  const activityId = `act-${randomUUID()}`;
  const inviterId = row.invite.inviterId;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(activitiesTable).values({
        id: activityId,
        athleteId: input.userId,
        sport,
        title: input.title,
        description: input.description ?? null,
        // The claimer's copy carries its own timestamp — they logged it now, even
        // though the effort happened on the inviter's date.
        date: new Date(),
        distanceKm: String(input.distanceKm),
        movingSeconds: input.movingSeconds,
        elevationM: input.elevationM,
        avgHr: null,
        avgPaceSecPerKm:
          sport === "Ride" ? null : Math.round(input.movingSeconds / input.distanceKm),
        avgSpeedKmh:
          sport === "Ride"
            ? String(Math.round((input.distanceKm / (input.movingSeconds / 3600)) * 10) / 10)
            : null,
        kudos: 0,
        achievements: 0,
        photo: null,
        // Same seed as the source: they covered the same ground, so the route preview
        // should match. Distance edits only change the label, not the shape.
        routeSeed: row.activity.routeSeed,
      });

      await tx.insert(inviteClaims).values({
        inviteId: row.invite.id,
        userId: input.userId,
        activityId,
        wasEdited,
      });

      // Close the social loop for real rather than showing copy that claims it.
      const alreadyFollowing = await tx
        .select({ followedId: follows.followedId })
        .from(follows)
        .where(and(eq(follows.followerId, input.userId), eq(follows.followedId, inviterId)))
        .limit(1);

      if (alreadyFollowing.length === 0) {
        await tx.insert(follows).values({ followerId: input.userId, followedId: inviterId });

        const [claimer] = await tx
          .select({ followingCount: users.followingCount })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        const [inviter] = await tx
          .select({ followersCount: users.followersCount })
          .from(users)
          .where(eq(users.id, inviterId))
          .limit(1);

        if (claimer) {
          await tx
            .update(users)
            .set({ followingCount: claimer.followingCount + 1 })
            .where(eq(users.id, input.userId));
        }

        if (inviter) {
          await tx
            .update(users)
            .set({ followersCount: inviter.followersCount + 1 })
            .where(eq(users.id, inviterId));
        }
      }
    });
  } catch (error) {
    // Lost the race against a concurrent claim by the same user. The primary key did
    // its job; report it the same way the pre-check would have.
    if (isUniqueViolation(error)) {
      throw new HttpError(409, ALREADY_CLAIMED);
    }

    throw error;
  }

  return { activityId, wasEdited };
}
