import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { buildWeeklyRecapShownEvent, type ShareSurface } from "@/lib/analytics";
import { fetchWeeklyRecap } from "@/lib/api";
import { qualifiesForRecap, type RecapTier, type WeeklyRecap } from "@/lib/weekly-recap";

/**
 * Follows the `stride:onboarding:v1` precedent in `src/routes/auth.tsx` — there
 * is no user-settings table to persist "already seen" against.
 */
const RECAP_STORAGE_KEY = "stride:weekly-recap:v1";

function readShownWeek(): string | null {
  try {
    return window.localStorage.getItem(RECAP_STORAGE_KEY);
  } catch {
    // Safari private mode throws on localStorage access.
    return null;
  }
}

function markShownWeek(weekStart: string): void {
  try {
    window.localStorage.setItem(RECAP_STORAGE_KEY, weekStart);
  } catch {
    // Non-fatal: worst case the card can reappear for the same week.
  }
}

/**
 * Decides whether a just-logged run earns the Power Runner moment.
 *
 * `evaluate()` is called from the save handler — not a `useEffect` — so the
 * impression event fires at the moment of the decision, matching the repo's
 * PostHog guidance to capture in event handlers rather than in effects
 * reacting to state.
 */
export function useWeeklyRecapGate() {
  const posthog = usePostHog();
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);

  /** Resolves true when the caller should show the modal instead of navigating. */
  async function evaluate(sport: string): Promise<boolean> {
    if (sport !== "Run") {
      return false;
    }

    try {
      const next = await fetchWeeklyRecap();

      if (!qualifiesForRecap(next, readShownWeek())) {
        return false;
      }

      markShownWeek(next.weekStart);

      const event = buildWeeklyRecapShownEvent({
        weekStart: next.weekStart,
        weekRunCount: next.runCount,
        weekDistanceKm: next.distanceKm,
        streakWeeks: next.streakWeeks,
        tier: next.tier,
      });
      posthog.capture(event.name, event.properties);

      setRecap(next);
      return true;
    } catch (error) {
      // The recap is a bonus moment; never let it strand a successfully saved run.
      posthog.captureException(error);
      return false;
    }
  }

  return { recap, evaluate, dismiss: () => setRecap(null) };
}

/**
 * Loads the current week's recap for the always-on surfaces (feed rail,
 * training log). Unlike the gate, this runs on mount because those surfaces
 * display progress continuously rather than reacting to an action.
 */
export function useWeeklyRecap() {
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchWeeklyRecap()
      .then((next) => {
        if (!cancelled) {
          setRecap(next);
        }
      })
      .catch(() => {
        // Leave the surface unrendered rather than breaking the page around it.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return recap;
}

export type RecapShareRequest = {
  recap: WeeklyRecap;
  surface: ShareSurface;
};

/**
 * Opens the share modal, optionally forcing a tier — "Share standard recap"
 * stays available even once Power Runner has unlocked.
 */
export function useRecapShare() {
  const posthog = usePostHog();
  const [request, setRequest] = useState<RecapShareRequest | null>(null);

  function open(recap: WeeklyRecap, surface: ShareSurface, tier?: RecapTier) {
    const shaped = tier ? { ...recap, tier } : recap;

    const event = buildWeeklyRecapShownEvent({
      weekStart: shaped.weekStart,
      weekRunCount: shaped.runCount,
      weekDistanceKm: shaped.distanceKm,
      streakWeeks: shaped.streakWeeks,
      tier: shaped.tier,
    });
    posthog.capture(event.name, event.properties);

    setRequest({ recap: shaped, surface });
  }

  return { request, open, close: () => setRequest(null) };
}
