import { randomBytes } from "node:crypto";

export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

const INVITE_TTL_DAYS = 30;

// Crockford-style alphabet: no I/L/O/U, so a code read aloud off a phone screen or
// retyped out of a text message can't land on the wrong invite.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 10;

export const SPORT_NOUN: Record<Sport, string> = {
  Run: "run",
  Ride: "ride",
  Swim: "swim",
  Hike: "hike",
  Walk: "walk",
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Maps raw bytes onto the code alphabet. Split out from `generateInviteCode` so the
 * encoding can be tested against known input without stubbing the crypto module.
 */
export function encodeInviteCode(bytes: Uint8Array): string {
  let code = "";

  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }

  return code;
}

export function generateInviteCode(): string {
  return encodeInviteCode(randomBytes(CODE_LENGTH));
}

export function inviteExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type InviteState = "open" | "expired";

export function inviteState(invite: { expiresAt: Date }, now: Date): InviteState {
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "open";
}

/**
 * Postgres unique-violation. The claim path pre-checks for an existing claim, but two
 * concurrent requests can both pass that check — the composite primary key is what
 * actually rejects the second, and this turns that into a 409 rather than a 500.
 *
 * Walks the `cause` chain because Drizzle wraps driver errors: the 23505 lives on
 * `error.cause`, not on the error itself.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return false;
    }

    if ((current as { code?: unknown }).code === "23505") {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * True when the claimer changed any of the three numbers that came off the inviter's
 * watch. Drives the "Matched"/"Edited" provenance pill and the claim analytics.
 */
export function isEditedClaim(
  source: { distanceKm: number; movingSeconds: number; elevationM: number },
  claimed: { distanceKm: number; movingSeconds: number; elevationM: number },
): boolean {
  return (
    source.distanceKm !== claimed.distanceKm ||
    source.movingSeconds !== claimed.movingSeconds ||
    source.elevationM !== claimed.elevationM
  );
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(remainder)}` : `${minutes}:${pad(remainder)}`;
}

export function buildInviteMessage(input: {
  inviterName: string;
  sport: Sport;
  distanceKm: number;
  durationLabel: string;
  elevationM: number;
  url: string;
}): string {
  return [
    `${input.inviterName} is inviting you to log the ${SPORT_NOUN[input.sport]} you did together in Stride.`,
    "",
    `${input.distanceKm.toFixed(2)} km · ${input.durationLabel} · ${input.elevationM} m`,
    "",
    "Take credit for it and post it to your own record:",
    input.url,
  ].join("\n");
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/j/${code}`;
}
