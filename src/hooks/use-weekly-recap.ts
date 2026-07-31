import { useState } from "react";
import { usePostHog } from "@posthog/react";
import { buildWeeklyRecapShownEvent } from "@/lib/analytics";
import { fetchWeeklyRecap } from "@/lib/api";
import { qualifiesForRecap, type WeeklyRecap } from "@/lib/weekly-recap";

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
 * Decides whether a just-logged run earns the Weekly Recap moment.
 *
 * `evaluate()` is called from the save handler — not a `useEffect` — so the
 * impression event fires at the moment of the decision, matching the repo's
 * PostHog guidance to capture in event handlers rather than in effects
 * reacting to state.
 */
export function useWeeklyRecapGate() {
  const posthog = usePostHog();
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);

  /** Resolves true when the caller should show the card instead of navigating. */
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
