import type { Sport } from "./mock-data";

export type InviteState = "open" | "expired" | "revoked";

/** What a logged-out recipient receives from `GET /api/invites/:code`. */
export interface PublicInvite {
  code: string;
  state: InviteState;
  inviter: {
    name: string;
    avatar: string;
    city: string;
  };
  activity: {
    sport: Sport;
    title: string;
    date: string;
    distanceKm: number;
    movingSeconds: number;
    elevationM: number;
    avgSpeedKmh?: number;
    avgPaceSecPerKm?: number;
    routeSeed: number;
  };
  claimCount: number;
  isInviter: boolean;
  viewerClaimActivityId: string | null;
}

export interface InviteClaimSummary {
  athleteId: string;
  name: string;
  avatar: string;
  activityId: string;
  wasEdited: boolean;
  claimedAt: string;
}

/** The inviter's own view of a link they created. */
export interface InviteSummary {
  code: string;
  message: string;
  state: InviteState;
  createdAt: string;
  claims: InviteClaimSummary[];
}

const SPORT_NOUN: Record<Sport, string> = {
  Run: "run",
  Ride: "ride",
  Swim: "swim",
  Hike: "hike",
  Walk: "walk",
};

export function sportNoun(sport: Sport): string {
  return SPORT_NOUN[sport] ?? "workout";
}

export function splitDuration(totalSeconds: number) {
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: Math.floor(totalSeconds % 60),
  };
}

export function toTotalSeconds(hours: string, minutes: string, seconds: string): number {
  return (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
}

/**
 * Mirrors the server's `isEditedClaim` so the provenance pill can flip as the recipient
 * types, before anything is submitted. The server value is the authoritative one.
 */
export function isEditedClaim(
  source: { distanceKm: number; movingSeconds: number; elevationM: number },
  draft: { distanceKm: number; movingSeconds: number; elevationM: number },
): boolean {
  return (
    source.distanceKm !== draft.distanceKm ||
    source.movingSeconds !== draft.movingSeconds ||
    source.elevationM !== draft.elevationM
  );
}

/**
 * Hands the invite off to the device's own SMS or mail app with the body prefilled.
 * Stride never sends the message itself, so nothing is stored about who was contacted
 * and there is no provider to opt out of.
 */
export function smsHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}

export function mailtoHref(subject: string, message: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
