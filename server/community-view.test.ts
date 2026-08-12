import { describe, expect, it } from "vitest";
import {
  approximateCommunityLocation,
  buildCommunityView,
  communityContributionId,
  formatInitials,
  validateCommunityNote,
  type CommunityChallengeRow,
  type CommunityContributionRow,
} from "./community-view.js";

const challenge: CommunityChallengeRow = {
  id: "community-boulder",
  name: "Boulder Together",
  goalKm: "2000.00",
  endsAt: "2026-08-27",
  badge: "BT",
  slug: "community-momentum",
  localArea: "Boulder",
  startsAt: "2026-08-20",
  baselineDistanceKm: "1800.00",
  baselinePeople: 400,
  baselineBadges: 500,
  liveMovingCount: 18,
};

const contributions: CommunityContributionRow[] = [
  {
    id: "maya-contribution",
    athleteId: "maya",
    name: "Maya Sato",
    avatar: "maya.jpg",
    city: "North Boulder",
    distanceKm: "8.40",
    note: "Sunrise miles",
    latitude: "40.041700",
    longitude: "-105.281800",
    routeKey: "maya",
    tone: "green",
    baseKudos: 10,
    replies: 4,
    publishedAt: new Date("2026-08-11T12:00:00Z"),
  },
  {
    id: "my-contribution",
    athleteId: "current-user",
    name: "Alex Carter",
    avatar: "alex.jpg",
    city: "Boulder",
    distanceKm: "5.20",
    note: "Kept moving",
    latitude: "40.015000",
    longitude: "-105.270500",
    routeKey: "me",
    tone: "orange",
    baseKudos: 0,
    replies: 0,
    publishedAt: new Date("2026-08-11T13:00:00Z"),
  },
  {
    id: "other-contribution",
    athleteId: "not-followed",
    name: "Other Runner",
    avatar: "other.jpg",
    city: "Louisville",
    distanceKm: "3.10",
    note: "Easy miles",
    latitude: "40.000000",
    longitude: "-105.200000",
    routeKey: "other",
    tone: "ink",
    baseKudos: 2,
    replies: 1,
    publishedAt: new Date("2026-08-11T11:00:00Z"),
  },
];

describe("community challenge view", () => {
  it("filters Following without changing community-wide totals", () => {
    const view = buildCommunityView({
      userId: "current-user",
      scope: "following",
      challenge,
      contributions,
      reactions: [],
      followedIds: ["maya"],
      notification: null,
    });

    expect(view.participants.map((participant) => participant.id)).toEqual([
      "maya-contribution",
      "my-contribution",
    ]);
    expect(view.summary.distanceKm).toBe(1816.7);
    expect(view.summary.peopleMoving).toBe(403);
    expect(view.summary.badgesPlanted).toBe(503);
    expect(view.myContribution?.athleteId).toBe("me");
  });

  it("combines baseline and stored reactions and marks the current user's reaction", () => {
    const view = buildCommunityView({
      userId: "current-user",
      scope: "all",
      challenge,
      contributions,
      reactions: [
        { contributionId: "maya-contribution", userId: "current-user" },
        { contributionId: "maya-contribution", userId: "another-user" },
      ],
      followedIds: [],
      notification: null,
    });
    const maya = view.participants.find((participant) => participant.id === "maya-contribution");

    expect(maya).toMatchObject({ kudos: 12, reacted: true });
  });

  it("only marks untouched notification receipts as pending", () => {
    const baseNotification = {
      id: "notification-1",
      anchorContributionId: "maya-contribution",
      bundledContributions: 4,
      bundledDistanceKm: "24.10",
      createdAt: new Date("2026-08-11T10:00:00Z"),
      active: true,
      openedAt: null,
      dismissedAt: null,
    };
    const pending = buildCommunityView({
      userId: "current-user",
      scope: "all",
      challenge,
      contributions,
      reactions: [],
      followedIds: [],
      notification: baseNotification,
    });
    const opened = buildCommunityView({
      userId: "current-user",
      scope: "all",
      challenge,
      contributions,
      reactions: [],
      followedIds: [],
      notification: { ...baseNotification, openedAt: new Date(), active: false },
    });

    expect(pending.notification?.pending).toBe(true);
    expect(opened.notification?.pending).toBe(false);
  });
});

describe("community challenge safeguards", () => {
  it("normalizes notes and rejects empty or oversized posts", () => {
    expect(validateCommunityNote("  Good miles  ")).toBe("Good miles");
    expect(validateCommunityNote("   ")).toBeNull();
    expect(validateCommunityNote("x".repeat(501))).toBeNull();
  });

  it("uses a stable contribution identity and deterministic approximate location", () => {
    expect(communityContributionId("challenge", "athlete")).toBe("momentum-challenge-athlete");
    expect(approximateCommunityLocation("athlete")).toEqual(
      approximateCommunityLocation("athlete"),
    );
    expect(formatInitials("Maya Sato")).toBe("MS");
  });
});
