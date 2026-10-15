import { useCallback, useSyncExternalStore } from "react";
import { usePostHog } from "@posthog/react";
import {
  getWorkoutSyncState,
  retryWorkoutSync,
  subscribeWorkoutSyncs,
  type WorkoutSync,
} from "@/lib/workout-syncs";

export function useWorkoutSyncs() {
  return useSyncExternalStore(subscribeWorkoutSyncs, getWorkoutSyncState, getWorkoutSyncState);
}

// Retry with the prototype's analytics. Failures are reported to the team by
// the server, not from here.
export function useRetrySync() {
  const posthog = usePostHog();

  return useCallback(
    async (sync: WorkoutSync) => {
      posthog.capture("sync_retry_clicked", {
        source: sync.deviceName,
        provider: sync.provider,
        attempt: sync.attempts + 1,
      });

      const outcome = await retryWorkoutSync(sync.id);

      if (outcome.kind === "error") {
        posthog.capture("sync_retry_network_error", {
          source: sync.deviceName,
          provider: sync.provider,
          error_ref: sync.ref,
        });
      }

      if (outcome.kind === "synced" || outcome.kind === "failed") {
        posthog.capture("sync_retry_result", {
          success: outcome.kind === "synced",
          source: sync.deviceName,
          provider: sync.provider,
          error_code: outcome.sync.errorCode,
          attempt: outcome.sync.attempts,
        });
      }

      return outcome;
    },
    [posthog],
  );
}
