import type { WorkoutSync } from "./workout-syncs";

// Athlete-facing wording for failed workout syncs. Garmin and Apple Health copy
// comes from the validated prototype; other devices get a generic version.

type Problem = { cause: string; steps: string[]; stillHasIt: string };

export function describeSyncProblem(sync: Pick<WorkoutSync, "provider" | "errorCode">): Problem {
  if (sync.errorCode === "import_failed") {
    return {
      cause: "Stride hit a problem while saving this workout.",
      steps: [],
      stillHasIt: "Nothing is lost: we kept the data your device sent.",
    };
  }

  if (sync.provider === "apple_health") {
    return {
      cause:
        sync.errorCode === "source_permission_denied"
          ? "Stride couldn't read this workout from the Health app on your iPhone."
          : "Your iPhone lost its connection while sending this workout.",
      steps: [
        "Open the Health app on your iPhone and check that the workout is listed.",
        "In Health, tap your profile picture, then Apps → Stride, and make sure Workouts is turned on.",
      ],
      stillHasIt: "Nothing is lost: your iPhone still has it.",
    };
  }

  if (sync.provider === "garmin") {
    return {
      cause: "Your watch lost its connection while sending this workout.",
      steps: [
        "Open the Garmin Connect app on your phone and check that the workout is there. If it isn't, sync your watch in Garmin Connect first.",
        "Keep your watch next to your phone with Bluetooth turned on.",
      ],
      stillHasIt: "Nothing is lost: your watch still has it.",
    };
  }

  return {
    cause: "Your device couldn't send this workout to Stride.",
    steps: ["Open your device's companion app and check that the workout is there."],
    stillHasIt: "Nothing is lost: your device still has it.",
  };
}

export function syncStatusMessage(sync: WorkoutSync) {
  const problem = describeSyncProblem(sync);

  if (sync.status === "stuck") {
    return {
      headline: "This workout still isn't syncing.",
      body: `${problem.stillHasIt} Add it manually so it counts this week.`,
    };
  }

  if (sync.attempts > 0) {
    return {
      headline: "That didn't work yet.",
      body:
        problem.steps.length > 0
          ? "If it keeps failing, open What to check below before you try again."
          : "Give it a minute, then try again.",
    };
  }

  return {
    headline: `This workout didn't reach Stride from your ${sync.deviceName}.`,
    body: `${problem.cause} ${problem.stillHasIt}`,
  };
}

export const SYNC_TONE_STYLES = {
  stuck: {
    dot: "bg-destructive",
    border: "border-destructive/40",
    bg: "bg-destructive/5",
    label: "Still not syncing",
  },
  syncing: {
    dot: "bg-muted-foreground",
    border: "border-border",
    bg: "bg-surface-2",
    label: "Syncing",
  },
  failed: {
    dot: "bg-[color:var(--accent)]",
    border: "border-[color:var(--accent)]/60",
    bg: "bg-[color:var(--accent)]/10",
    label: "Didn't sync",
  },
} as const;

export function syncTone(sync: WorkoutSync, pending: boolean): keyof typeof SYNC_TONE_STYLES {
  if (pending) return "syncing";
  return sync.status === "stuck" ? "stuck" : "failed";
}
