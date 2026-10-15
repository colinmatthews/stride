import { randomInt } from "node:crypto";

// Pure workout-sync rules, kept free of database access so they can be unit
// tested. Persistence lives in sync-data.ts.

export const SPORTS = ["Run", "Ride", "Swim", "Hike", "Walk"] as const;
export type Sport = (typeof SPORTS)[number];

export type SyncProvider = "garmin" | "apple_health" | "other";

export const SYNC_ERROR_CODES = [
  // The upload never completed, or arrived incomplete.
  "upload_interrupted",
  // The source (e.g. Apple Health) refused to share the workout with Stride.
  "source_permission_denied",
  // The workout was valid but saving it failed on our side.
  "import_failed",
] as const;
export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

export type SyncStatus = "failed" | "stuck" | "synced";

// After this many athlete-initiated retries fail, retry is replaced by manual entry.
export const MAX_RETRY_ATTEMPTS = 2;

export type WorkoutPayload = {
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  avgSpeedKmh?: number;
  routeSeed: number;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveInt(value: unknown) {
  const parsed = num(value);
  return parsed !== undefined && parsed > 0 ? Math.round(parsed) : undefined;
}

export function isSport(value: unknown): value is Sport {
  return typeof value === "string" && (SPORTS as readonly string[]).includes(value);
}

export function isSyncErrorCode(value: unknown): value is SyncErrorCode {
  return typeof value === "string" && (SYNC_ERROR_CODES as readonly string[]).includes(value);
}

export function normalizeProvider(value: unknown): SyncProvider {
  return value === "garmin" || value === "apple_health" ? value : "other";
}

// Returns the workout if the device delivered everything we need to create an
// activity, otherwise null (treated as an incomplete upload).
export function parseWorkoutPayload(payload: unknown): WorkoutPayload | null {
  if (!payload || typeof payload !== "object") return null;

  const raw = payload as Record<string, unknown>;
  const distanceKm = num(raw.distanceKm);
  const movingSeconds = positiveInt(raw.movingSeconds);

  if (distanceKm === undefined || distanceKm < 0 || movingSeconds === undefined) return null;

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    movingSeconds,
    elevationM: Math.max(0, Math.round(num(raw.elevationM) ?? 0)),
    avgHr: positiveInt(raw.avgHr),
    avgPaceSecPerKm: positiveInt(raw.avgPaceSecPerKm),
    avgSpeedKmh: num(raw.avgSpeedKmh),
    routeSeed: Math.round(num(raw.routeSeed) ?? 1),
  };
}

export type RetryDecision =
  | { kind: "not_found" }
  | { kind: "already_synced" }
  | { kind: "retry_exhausted" }
  | { kind: "attempt"; attempts: number };

export function decideRetry(
  row: { userId: string; status: string; attempts: number } | undefined,
  userId: string,
): RetryDecision {
  // A sync owned by someone else is reported as missing so ids can't be probed.
  if (!row || row.userId !== userId) return { kind: "not_found" };
  if (row.status === "synced") return { kind: "already_synced" };
  if (row.status === "stuck") return { kind: "retry_exhausted" };
  return { kind: "attempt", attempts: row.attempts + 1 };
}

export function statusAfterFailedRetry(attempts: number): Exclude<SyncStatus, "synced"> {
  return attempts >= MAX_RETRY_ATTEMPTS ? "stuck" : "failed";
}

// No 0/O or 1/I/L, so refs read cleanly to support.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function createSyncRef(random: (max: number) => number = randomInt) {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += REF_ALPHABET[random(REF_ALPHABET.length)];
  }
  return `SYNC-${code}`;
}

export type WorkoutSyncRow = {
  id: string;
  ref: string;
  provider: string;
  deviceName: string;
  sport: string;
  title: string;
  startedAt: Date;
  status: string;
  errorCode: string | null;
  attempts: number;
  activityId: string | null;
};

export type WorkoutSyncDto = {
  id: string;
  ref: string;
  provider: SyncProvider;
  deviceName: string;
  sport: Sport;
  title: string;
  startedAt: string;
  status: SyncStatus;
  errorCode: SyncErrorCode | null;
  attempts: number;
  activityId?: string;
};

export function toWorkoutSyncDto(row: WorkoutSyncRow): WorkoutSyncDto {
  return {
    id: row.id,
    ref: row.ref,
    provider: normalizeProvider(row.provider),
    deviceName: row.deviceName,
    sport: isSport(row.sport) ? row.sport : "Run",
    title: row.title,
    startedAt: row.startedAt.toISOString(),
    status: row.status as SyncStatus,
    errorCode: isSyncErrorCode(row.errorCode) ? row.errorCode : null,
    attempts: row.attempts,
    activityId: row.activityId ?? undefined,
  };
}

export type IngestInput = {
  provider: SyncProvider;
  deviceName: string;
  externalId: string;
  sport: Sport;
  title: string;
  startedAt: Date;
  payload?: unknown;
  errorCode?: SyncErrorCode;
};

function shortText(value: unknown, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= max ? text : undefined;
}

// Validates the body a device integration posts to /api/syncs.
export function parseIngestBody(body: unknown): IngestInput | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  const externalId = shortText(raw.externalId, 200);
  const deviceName = shortText(raw.deviceName, 80);
  const title = shortText(raw.title, 200);
  const startedAt = new Date(typeof raw.startedAt === "string" ? raw.startedAt : NaN);

  if (!externalId || !deviceName || !title || !isSport(raw.sport)) return null;
  if (Number.isNaN(startedAt.getTime())) return null;

  return {
    provider: normalizeProvider(raw.provider),
    deviceName,
    externalId,
    sport: raw.sport,
    title,
    startedAt,
    payload: raw.payload,
    errorCode: isSyncErrorCode(raw.errorCode) ? raw.errorCode : undefined,
  };
}
