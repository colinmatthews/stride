import { Bike, Footprints, Mountain, PersonStanding, Waves } from "lucide-react";
import type { Sport } from "./mock-data";

export const MAX_MINUTES = 600;

export type GoalTracker =
  | { cohort: "holdout"; day: number }
  | {
      cohort: "treatment";
      day: number;
      goal: number;
      windowDays: number;
      checkInDay: number;
      endsAt: string;
      count: number;
      logged: { id: string; sport: Sport; title: string; day: number }[];
      loggedDays: number[];
      latestTitle: string | null;
      checkIn: "none" | "open" | "answered";
      checkInSent: boolean;
      completed: boolean;
    };

export type TreatmentTracker = Extract<GoalTracker, { cohort: "treatment" }>;

export type GoalTrackerResponse = {
  view: GoalTracker | null;
  checkInJustSent: boolean;
  completedJustNow: boolean;
} | null;

export const SPORT_ICONS: Record<Sport, typeof Bike> = {
  Run: Footprints,
  Ride: Bike,
  Swim: Waves,
  Hike: Mountain,
  Walk: PersonStanding,
};

export type Effort = { sport: Sport; minutes: number; km: number; title: string };
export type Preset = Effort & { id: string; label: string };

export const PRESETS: Preset[] = [
  { id: "walk", label: "10-min walk", sport: "Walk", minutes: 10, km: 0.8, title: "Short walk" },
  { id: "dog", label: "Dog walk", sport: "Walk", minutes: 20, km: 1.5, title: "Dog walk" },
  { id: "jog", label: "Easy jog", sport: "Run", minutes: 15, km: 2.2, title: "Easy jog" },
  { id: "spin", label: "Spin around town", sport: "Ride", minutes: 20, km: 6, title: "Quick spin" },
  { id: "laps", label: "A few laps", sport: "Swim", minutes: 15, km: 0.5, title: "A few laps" },
  { id: "hike", label: "Short hike", sport: "Hike", minutes: 30, km: 2.4, title: "Short hike" },
];

const KM_PER_MIN: Record<Sport, number> = {
  Run: 0.15,
  Ride: 0.3,
  Swim: 0.035,
  Hike: 0.08,
  Walk: 0.08,
};

export function customEffort(sport: Sport, minutes: number): Effort {
  return {
    sport,
    minutes,
    km: Math.max(0.1, Math.round(minutes * KM_PER_MIN[sport] * 10) / 10),
    title: `${minutes}-min ${sport.toLowerCase()}`,
  };
}

// Shapes a quick-log effort into the same payload the record form saves.
export function effortToActivity(effort: Effort, routeSeed: number) {
  const movingSeconds = effort.minutes * 60;
  return {
    sport: effort.sport,
    title: effort.title,
    distanceKm: effort.km,
    movingSeconds,
    elevationM: effort.sport === "Hike" ? 120 : effort.sport === "Swim" ? 0 : 12,
    avgPaceSecPerKm:
      effort.sport === "Ride" || effort.sport === "Swim"
        ? undefined
        : Math.round(movingSeconds / effort.km),
    avgSpeedKmh:
      effort.sport === "Ride"
        ? Math.round((effort.km / (effort.minutes / 60)) * 10) / 10
        : undefined,
    routeSeed,
  };
}

/* ===== Copy ===== */

// Say the goal outright; "first-two-weeks goal" alone means nothing to someone
// who hasn't been told about it.
export const goalTitle = (goal: number) => `Log ${goal} activities in your first two weeks`;
export const GOAL_HINT = "Any activity counts, even a short walk.";

export function deadlineLabel(endsAt: string) {
  // endsAt is the first instant after the window, so show the day before it.
  return new Date(new Date(endsAt).getTime() - 1).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function goalStatusLine(
  tracker: Pick<TreatmentTracker, "day" | "windowDays" | "count" | "goal" | "endsAt">,
) {
  if (tracker.count >= tracker.goal) return "Goal done. Five in your first two weeks.";
  const daysLeft = tracker.windowDays - tracker.day + 1;
  if (daysLeft <= 1) return "Last day. Any activity still counts.";
  return `${daysLeft} days left · ends ${deadlineLabel(tracker.endsAt)}`;
}

export function progressToast(total: number, goal: number) {
  return total >= goal
    ? `That's ${goal} in your first two weeks. Goal done.`
    : `${total} of ${goal} logged in your first two weeks.`;
}
