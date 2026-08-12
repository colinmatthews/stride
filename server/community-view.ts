export type CommunityScope = "all" | "following";
export type CommunityTone = "orange" | "green" | "yellow" | "ink";

export type CommunityChallengeRow = {
  id: string;
  name: string;
  goalKm: string;
  endsAt: string;
  badge: string;
  slug: string;
  localArea: string;
  startsAt: string;
  baselineDistanceKm: string;
  baselinePeople: number;
  baselineBadges: number;
  liveMovingCount: number;
};

export type CommunityContributionRow = {
  id: string;
  athleteId: string;
  name: string;
  avatar: string;
  city: string;
  distanceKm: string;
  note: string;
  latitude: string;
  longitude: string;
  routeKey: string;
  tone: string;
  baseKudos: number;
  replies: number;
  publishedAt: Date;
};

export type CommunityNotificationRow = {
  id: string;
  anchorContributionId: string;
  bundledContributions: number;
  bundledDistanceKm: string;
  createdAt: Date;
  active: boolean;
  openedAt: Date | null;
  dismissedAt: Date | null;
};

export function formatInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function approximateCommunityLocation(userId: string) {
  const hash = [...userId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return {
    latitude: 40.015 + ((hash % 17) - 8) * 0.0011,
    longitude: -105.2705 + ((hash % 13) - 6) * 0.0012,
  };
}

export function communityContributionId(challengeId: string, userId: string) {
  return `momentum-${challengeId}-${userId}`;
}

export function validateCommunityNote(value: unknown) {
  const note = String(value ?? "").trim();
  return note.length > 0 && note.length <= 500 ? note : null;
}

export function buildCommunityView(input: {
  userId: string;
  scope: CommunityScope;
  challenge: CommunityChallengeRow;
  contributions: CommunityContributionRow[];
  reactions: Array<{ contributionId: string; userId: string }>;
  followedIds: string[];
  notification: CommunityNotificationRow | null;
}) {
  const followedIds = new Set(input.followedIds);
  const reactionCountByContribution = new Map<string, number>();
  const myReactions = new Set<string>();

  for (const reaction of input.reactions) {
    reactionCountByContribution.set(
      reaction.contributionId,
      (reactionCountByContribution.get(reaction.contributionId) ?? 0) + 1,
    );
    if (reaction.userId === input.userId) myReactions.add(reaction.contributionId);
  }

  const allParticipants = input.contributions.map((row) => ({
    id: row.id,
    athleteId: row.athleteId === input.userId ? "me" : row.athleteId,
    name: row.name,
    initials: formatInitials(row.name),
    avatar: row.avatar,
    city: row.city,
    distanceKm: Number(row.distanceKm),
    note: row.note,
    publishedAt: row.publishedAt.toISOString(),
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    routeKey: row.routeKey,
    tone: row.tone as CommunityTone,
    kudos: row.baseKudos + (reactionCountByContribution.get(row.id) ?? 0),
    replies: row.replies,
    reacted: myReactions.has(row.id),
    isFollowing: followedIds.has(row.athleteId),
    isMine: row.athleteId === input.userId,
  }));
  const participants =
    input.scope === "following"
      ? allParticipants.filter((participant) => participant.isFollowing || participant.isMine)
      : allParticipants;
  const contributedDistance = allParticipants.reduce(
    (total, participant) => total + participant.distanceKm,
    0,
  );
  const distanceKm = Number(input.challenge.baselineDistanceKm) + contributedDistance;
  const notification = input.notification
    ? {
        id: input.notification.id,
        anchorContributionId: input.notification.anchorContributionId,
        bundledContributions: input.notification.bundledContributions,
        bundledDistanceKm: Number(input.notification.bundledDistanceKm),
        createdAt: input.notification.createdAt.toISOString(),
        pending:
          input.notification.active &&
          !input.notification.openedAt &&
          !input.notification.dismissedAt,
      }
    : null;

  return {
    challenge: {
      id: input.challenge.id,
      slug: input.challenge.slug,
      name: input.challenge.name,
      localArea: input.challenge.localArea,
      startsAt: input.challenge.startsAt,
      endsAt: input.challenge.endsAt,
      goalKm: Number(input.challenge.goalKm),
      badge: input.challenge.badge,
    },
    summary: {
      distanceKm,
      peopleMoving: input.challenge.baselinePeople + allParticipants.length,
      badgesPlanted: input.challenge.baselineBadges + allParticipants.length,
      liveMovingCount: input.challenge.liveMovingCount,
      remainingKm: Math.max(Number(input.challenge.goalKm) - distanceKm, 0),
      addedToday: allParticipants.length + 58,
      cities: 18,
    },
    participants,
    myContribution: allParticipants.find((participant) => participant.isMine) ?? null,
    notification,
  };
}
