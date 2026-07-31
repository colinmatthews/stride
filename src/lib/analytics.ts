/**
 * Typed payload builders for share instrumentation.
 *
 * Every other capture in the app is a bare string literal written inline at the
 * call site — three of them inside ternaries — so a typo is silently
 * unmeasurable. `activity_shared` is the event share rate will be read from, so
 * it gets a builder instead: the names and the property union are checked at
 * compile time, and the payload is a pure value we can unit-test in the
 * existing node-environment vitest setup with no DOM and no new dependency.
 */

export const ACTIVITY_SHARED = "activity_shared" as const;
export const WEEKLY_RECAP_SHOWN = "weekly_recap_shown" as const;

/**
 * Where the share was initiated from. Mirrors the `entry_mode` discriminator
 * already used on `activity_saved` (src/routes/record.tsx) — same event, one
 * literal property separating origins.
 */
export const SHARE_SURFACES = ["weekly_recap", "activity_detail"] as const;
export type ShareSurface = (typeof SHARE_SURFACES)[number];

/**
 * Where the share went.
 *
 * These are the destinations *our own UI* controls. The Web Share API is
 * deliberately opaque — `navigator.share()` resolves without telling us which
 * app the user picked — so `system_share_sheet` is as granular as an OS share
 * can honestly get. Inventing finer values (e.g. "instagram") would be a lie.
 */
export const SHARE_DESTINATIONS = ["system_share_sheet", "image_download", "clipboard"] as const;
export type ShareDestination = (typeof SHARE_DESTINATIONS)[number];

export type ActivitySharedInput = {
  surface: ShareSurface;
  destination: ShareDestination;
  /** Present when the share came from a single activity, absent for a week recap. */
  activityId?: string;
  weekStart?: string;
  weekRunCount?: number;
  weekDistanceKm?: number;
  streakWeeks?: number;
  /** True when the PNG card was attached to the share rather than a bare link. */
  hasImage?: boolean;
};

export type AnalyticsEvent<TName extends string, TProperties> = {
  name: TName;
  properties: TProperties;
};

function omitUndefined<T extends Record<string, unknown>>(properties: T): T {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Build the `activity_shared` payload.
 *
 * Capture this only once a share has actually *completed*. The existing share
 * button swallows rejections with `.catch(() => {})`, which means a cancelled
 * OS share sheet looks identical to a successful one — firing on click would
 * inflate the numerator of the very rate this event exists to make honest.
 */
export function buildActivitySharedEvent(input: ActivitySharedInput) {
  return {
    name: ACTIVITY_SHARED,
    properties: omitUndefined({
      surface: input.surface,
      destination: input.destination,
      activity_id: input.activityId,
      week_start: input.weekStart,
      week_run_count: input.weekRunCount,
      week_distance_km: input.weekDistanceKm,
      streak_weeks: input.streakWeeks,
      has_image: input.hasImage,
    }),
  } satisfies AnalyticsEvent<typeof ACTIVITY_SHARED, Record<string, unknown>>;
}

export type WeeklyRecapShownInput = {
  weekStart: string;
  weekRunCount: number;
  weekDistanceKm: number;
  streakWeeks: number;
};

/**
 * The denominator. Without an impression event, a share count can't be turned
 * into a share *rate* — you'd only know how many people shared, not how many
 * were offered the chance.
 */
export function buildWeeklyRecapShownEvent(input: WeeklyRecapShownInput) {
  return {
    name: WEEKLY_RECAP_SHOWN,
    properties: {
      week_start: input.weekStart,
      week_run_count: input.weekRunCount,
      week_distance_km: input.weekDistanceKm,
      streak_weeks: input.streakWeeks,
    },
  } satisfies AnalyticsEvent<typeof WEEKLY_RECAP_SHOWN, Record<string, unknown>>;
}
