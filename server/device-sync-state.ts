// Pure transition rules for a first-activity device sync. Kept free of db and
// network access so the rules can be tested directly — the service layer in
// device-sync.ts owns persistence.

export const SYNC_STATUSES = ["pending", "synced", "failed"] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

export type DeviceSyncState = {
  status: SyncStatus;
  attemptCount: number;
  failureReason: string | null;
  activityId: string | null;
};

/** A sync is abandoned rather than retried once it has burned this many attempts. */
export const MAX_ATTEMPTS = 5;

/** A pending sync older than this is treated as stuck rather than in-flight. */
export const STALE_PENDING_MS = 2 * 60 * 1000;

export function isSyncStatus(value: unknown): value is SyncStatus {
  return typeof value === "string" && (SYNC_STATUSES as readonly string[]).includes(value);
}

export function isTerminal(state: DeviceSyncState) {
  return state.status === "synced" || state.status === "failed";
}

/**
 * A pending row whose process died leaves the athlete watching a spinner
 * forever. Treat it as stuck so the UI can offer retry instead.
 */
export function isStuck(state: DeviceSyncState, startedAt: Date, now: Date) {
  if (state.status !== "pending") {
    return false;
  }

  return now.getTime() - startedAt.getTime() >= STALE_PENDING_MS;
}

/**
 * Retry is offered for a failed sync, or a pending one that has gone stale.
 * Never for an already-synced athlete — that would duplicate their activity.
 */
export function canRetry(state: DeviceSyncState, startedAt: Date, now: Date) {
  if (state.status === "synced") {
    return false;
  }

  if (state.attemptCount >= MAX_ATTEMPTS) {
    return false;
  }

  return state.status === "failed" || isStuck(state, startedAt, now);
}

/** Starting a fresh sync. Attempt counting begins at 1, not 0. */
export function startState(): DeviceSyncState {
  return { status: "pending", attemptCount: 1, failureReason: null, activityId: null };
}

/** Re-running after a failure or a stuck pending row. */
export function retryState(previous: DeviceSyncState): DeviceSyncState {
  return {
    status: "pending",
    attemptCount: previous.attemptCount + 1,
    failureReason: null,
    activityId: null,
  };
}

export function successState(previous: DeviceSyncState, activityId: string): DeviceSyncState {
  return {
    status: "synced",
    attemptCount: previous.attemptCount,
    failureReason: null,
    activityId,
  };
}

export function failureState(previous: DeviceSyncState, reason: string): DeviceSyncState {
  return {
    status: "failed",
    attemptCount: previous.attemptCount,
    // An empty reason would render as a blank error card, which is the exact
    // silence this feature exists to remove.
    failureReason: reason.trim() || "The import failed for an unknown reason.",
    activityId: previous.activityId,
  };
}
