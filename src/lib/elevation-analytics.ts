import type { ActivityElevation, ElevationFixTrigger, ElevationPreview } from "@/lib/api";

// Client events for the elevation fix funnel:
//   prompt_shown -> fix_opened -> fix_previewed -> (fix_closed | activity_corrected, server-side)
export const ELEVATION_EVENTS = {
  promptShown: "elevation_prompt_shown",
  promptDismissed: "elevation_prompt_dismissed",
  fixOpened: "elevation_fix_opened",
  fixPreviewed: "elevation_fix_previewed",
  fixClosed: "elevation_fix_closed",
} as const;

export type PreviewOutcome = "compare" | "accurate" | "blocked" | "error";

/** Device and suspected-issue fields shared by every elevation event. */
export function elevationEventBase(
  activity: { id: string; sport: string },
  elevation: ActivityElevation | null,
) {
  return {
    activity_id: activity.id,
    sport: activity.sport,
    device: elevation?.device?.name ?? null,
    device_model: elevation?.device?.model ?? null,
    elevation_source: elevation?.elevationSource ?? null,
    has_gps: elevation?.hasGps ?? false,
    suspected_error: elevation?.issue?.errorType ?? null,
  };
}

export function previewOutcome(preview: ElevationPreview): Exclude<PreviewOutcome, "error"> {
  if (preview.blockedReason) return "blocked";
  return preview.changed ? "compare" : "accurate";
}

/** What the preview found, so "nothing to fix" and "can't fix" are measurable per device. */
export function previewedEventProperties(
  trigger: ElevationFixTrigger,
  result: { preview: ElevationPreview } | { errorCode: string | null },
) {
  if (!("preview" in result)) {
    return { trigger, outcome: "error" as const, error_code: result.errorCode ?? "unknown" };
  }
  const { preview } = result;
  return {
    trigger,
    outcome: previewOutcome(preview),
    method: preview.method,
    error_type: preview.errorType,
    correction_direction: preview.direction,
    blocked_reason: preview.blockedReason,
    elevation_before_m: preview.elevationBeforeM,
    elevation_after_m: preview.elevationAfterM,
    elevation_delta_pct: preview.deltaPct,
    spike_count: preview.spikeCount,
    flatline_from_km: preview.flatRegion?.fromKm ?? null,
  };
}
