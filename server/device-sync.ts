import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { deviceSyncs } from "./db/schema.js";
import { createActivity, getActivityById } from "./data.js";
import type { Sport } from "./seed.js";
import {
  canRetry,
  failureState,
  isStuck,
  retryState,
  startState,
  successState,
  type DeviceSyncState,
  type SyncStatus,
} from "./device-sync-state.js";

export class DeviceSyncError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * What a connected device hands back for the athlete's most recent effort.
 * Shaped to match createActivity's input so the import writes through the
 * same path as any other activity.
 */
export type ImportedActivity = {
  sport: Sport;
  title: string;
  description?: string;
  distanceKm: number;
  movingSeconds: number;
  elevationM: number;
  avgHr?: number;
  avgPaceSecPerKm?: number;
  routeSeed: number;
};

export type DeviceImporter = (input: {
  userId: string;
  deviceName: string;
}) => Promise<ImportedActivity>;

/**
 * INTEGRATION SEAM. There is no vendor OAuth in this repo yet, so the importer
 * is injectable and selected by configuration:
 *
 *   1. DEVICE_SYNC_PROVIDER_URL set → real HTTP fetch against that provider.
 *   2. Otherwise, outside production → derive an activity locally so the flow
 *      is exercisable in dev.
 *   3. Otherwise (production, unconfigured) → fail loudly. Production must
 *      never invent training data for an athlete.
 */
export function resolveImporter(): DeviceImporter {
  const providerUrl = process.env.DEVICE_SYNC_PROVIDER_URL;

  if (providerUrl) {
    return httpDeviceImporter(providerUrl);
  }

  if (process.env.NODE_ENV === "production") {
    return async () => {
      throw new DeviceSyncError(
        "No device provider is configured. Set DEVICE_SYNC_PROVIDER_URL to enable device sync.",
        503,
      );
    };
  }

  return localDeviceImporter;
}

export function httpDeviceImporter(providerUrl: string): DeviceImporter {
  return async ({ userId, deviceName }) => {
    const response = await fetch(
      `${providerUrl.replace(/\/$/, "")}/latest-activity?athlete=${encodeURIComponent(userId)}`,
      { headers: { Accept: "application/json", "X-Device-Name": deviceName } },
    );

    if (!response.ok) {
      throw new DeviceSyncError(
        `Device provider returned ${response.status} while importing the activity.`,
        502,
      );
    }

    return (await response.json()) as ImportedActivity;
  };
}

/**
 * Dev-only importer. Derives a plausible first effort from the athlete id so
 * repeated runs are stable. Never reached when NODE_ENV === "production".
 */
export const localDeviceImporter: DeviceImporter = async ({ userId }) => {
  let seed = 0;
  for (const char of userId) {
    seed = (seed * 31 + char.charCodeAt(0)) % 100000;
  }

  const distanceKm = Number((4 + (seed % 70) / 10).toFixed(2));
  const paceSecPerKm = 260 + (seed % 90);

  return {
    sport: "Run",
    title: "Morning shakeout",
    description: "First activity synced from your device.",
    distanceKm,
    movingSeconds: Math.round(distanceKm * paceSecPerKm),
    elevationM: 20 + (seed % 120),
    avgHr: 132 + (seed % 30),
    avgPaceSecPerKm: paceSecPerKm,
    routeSeed: (seed % 9000) + 1,
  };
};

export type DeviceSyncView = DeviceSyncState & {
  deviceName: string;
  startedAt: string;
  updatedAt: string;
  canRetry: boolean;
  stuck: boolean;
};

type Row = typeof deviceSyncs.$inferSelect;

function toState(row: Row): DeviceSyncState {
  return {
    status: row.status as SyncStatus,
    attemptCount: row.attemptCount,
    failureReason: row.failureReason,
    activityId: row.activityId,
  };
}

function toView(row: Row, now = new Date()): DeviceSyncView {
  const state = toState(row);

  return {
    ...state,
    deviceName: row.deviceName,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canRetry: canRetry(state, row.startedAt, now),
    stuck: isStuck(state, row.startedAt, now),
  };
}

async function readRow(userId: string) {
  const rows = await db.select().from(deviceSyncs).where(eq(deviceSyncs.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getDeviceSync(userId: string): Promise<DeviceSyncView | null> {
  const row = await readRow(userId);
  return row ? toView(row) : null;
}

async function writeState(userId: string, deviceName: string, state: DeviceSyncState) {
  const now = new Date();

  await db
    .insert(deviceSyncs)
    .values({
      userId,
      deviceName,
      status: state.status,
      attemptCount: state.attemptCount,
      failureReason: state.failureReason,
      activityId: state.activityId,
      startedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: deviceSyncs.userId,
      set: {
        deviceName,
        status: state.status,
        attemptCount: state.attemptCount,
        failureReason: state.failureReason,
        activityId: state.activityId,
        // startedAt is only refreshed when a run begins, so staleness is
        // measured from the current attempt rather than the first one.
        ...(state.status === "pending" ? { startedAt: now } : {}),
        updatedAt: now,
      },
    });
}

/**
 * Runs the import and records the outcome. Any importer failure is captured as
 * a `failed` row with a reason rather than propagating — a thrown error here
 * would leave the athlete on a blank screen, which is the bug this feature
 * exists to fix.
 */
async function runImport(
  userId: string,
  deviceName: string,
  pending: DeviceSyncState,
  importer: DeviceImporter,
): Promise<DeviceSyncView> {
  try {
    const imported = await importer({ userId, deviceName });
    const activityId = await createActivity({ userId, ...imported });

    await writeState(userId, deviceName, successState(pending, activityId));
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "The import failed for an unknown reason.";

    await writeState(userId, deviceName, failureState(pending, reason));
  }

  const row = await readRow(userId);

  if (!row) {
    throw new DeviceSyncError("Device sync record disappeared mid-import", 500);
  }

  return toView(row);
}

export async function startDeviceSync(
  userId: string,
  deviceName: string,
  importer: DeviceImporter = resolveImporter(),
): Promise<DeviceSyncView> {
  const existing = await readRow(userId);
  const now = new Date();

  if (existing) {
    const state = toState(existing);

    // Already imported — starting again would duplicate the athlete's activity.
    if (state.status === "synced") {
      return toView(existing, now);
    }

    // A genuinely in-flight run: report it rather than racing a second import.
    if (state.status === "pending" && !isStuck(state, existing.startedAt, now)) {
      return toView(existing, now);
    }

    return retryDeviceSync(userId, importer);
  }

  const pending = startState();
  await writeState(userId, deviceName, pending);

  return runImport(userId, deviceName, pending, importer);
}

export async function retryDeviceSync(
  userId: string,
  importer: DeviceImporter = resolveImporter(),
): Promise<DeviceSyncView> {
  const existing = await readRow(userId);

  if (!existing) {
    throw new DeviceSyncError("No device sync to retry", 404);
  }

  const state = toState(existing);
  const now = new Date();

  if (state.status === "synced") {
    throw new DeviceSyncError("This device has already synced", 409);
  }

  if (!canRetry(state, existing.startedAt, now)) {
    if (state.attemptCount >= 5) {
      throw new DeviceSyncError("Too many sync attempts. Contact support.", 429);
    }

    throw new DeviceSyncError("A sync is already in progress", 409);
  }

  const pending = retryState(state);
  await writeState(userId, existing.deviceName, pending);

  return runImport(userId, existing.deviceName, pending, importer);
}

/** The imported activity, for rendering a preview of what landed in the feed. */
export async function getSyncedActivity(userId: string) {
  const rows = await db
    .select({ activityId: deviceSyncs.activityId })
    .from(deviceSyncs)
    .where(and(eq(deviceSyncs.userId, userId), eq(deviceSyncs.status, "synced")))
    .limit(1);

  const activityId = rows[0]?.activityId;

  return activityId ? getActivityById(userId, activityId) : null;
}
