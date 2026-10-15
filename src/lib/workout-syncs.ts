import { ApiError, retryWorkoutSyncRequest } from "./api";
import { mergeActivities, type Sport } from "./mock-data";

export type SyncProvider = "garmin" | "apple_health" | "other";
export type SyncErrorCode = "upload_interrupted" | "source_permission_denied" | "import_failed";
export type SyncStatus = "failed" | "stuck" | "synced";

export interface WorkoutSync {
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
}

export interface WorkoutSyncState {
  // Workouts that haven't reached the feed yet ("failed" or "stuck").
  syncs: WorkoutSync[];
  // Syncs with a retry request in flight.
  pendingIds: ReadonlySet<string>;
  // Activities recovered by a retry this session, keyed by activity id.
  recentlySynced: ReadonlyMap<string, WorkoutSync>;
}

export type RetryOutcome =
  | { kind: "synced"; sync: WorkoutSync }
  | { kind: "failed"; sync: WorkoutSync }
  | { kind: "gone" }
  | { kind: "error" }
  | { kind: "skipped" };

const EMPTY_STATE: WorkoutSyncState = {
  syncs: [],
  pendingIds: new Set(),
  recentlySynced: new Map(),
};

let state: WorkoutSyncState = EMPTY_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<WorkoutSyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeWorkoutSyncs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorkoutSyncState() {
  return state;
}

// Unsynced workouts are the athlete's own, so they don't belong under Clubs.
export function showsSyncIssues(feedFilter: string) {
  return feedFilter !== "Clubs";
}

export function initializeWorkoutSyncs(syncs: WorkoutSync[]) {
  setState({ ...EMPTY_STATE, syncs: syncs.filter((sync) => sync.status !== "synced") });
}

function setPending(syncId: string, pending: boolean) {
  const pendingIds = new Set(state.pendingIds);
  if (pending) pendingIds.add(syncId);
  else pendingIds.delete(syncId);
  setState({ pendingIds });
}

function replaceSync(sync: WorkoutSync) {
  setState({ syncs: state.syncs.map((entry) => (entry.id === sync.id ? sync : entry)) });
}

export async function retryWorkoutSync(syncId: string): Promise<RetryOutcome> {
  const current = state.syncs.find((sync) => sync.id === syncId);

  if (!current || current.status !== "failed" || state.pendingIds.has(syncId)) {
    return { kind: "skipped" };
  }

  setPending(syncId, true);

  try {
    const { sync, activity } = await retryWorkoutSyncRequest(syncId);

    if (sync.status === "synced") {
      if (activity) mergeActivities([activity]);
      const recentlySynced = new Map(state.recentlySynced);
      if (sync.activityId) recentlySynced.set(sync.activityId, sync);
      setState({ recentlySynced, syncs: state.syncs.filter((entry) => entry.id !== syncId) });
      return { kind: "synced", sync };
    }

    replaceSync(sync);
    return { kind: "failed", sync };
  } catch (error) {
    // 409: retry limit was already reached (e.g. in another tab) — adopt server state.
    const sync =
      error instanceof ApiError && error.status === 409
        ? (error.payload as { sync?: WorkoutSync } | undefined)?.sync
        : undefined;
    if (sync) {
      replaceSync(sync);
      return { kind: "failed", sync };
    }

    if (error instanceof ApiError && error.status === 404) {
      setState({ syncs: state.syncs.filter((entry) => entry.id !== syncId) });
      return { kind: "gone" };
    }

    // Network or server error: the attempt may not have run, so leave the
    // sync as it was and let the athlete try again.
    return { kind: "error" };
  } finally {
    setPending(syncId, false);
  }
}
