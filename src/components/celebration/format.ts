import { fmtDuration, fmtPace, type Activity, type Sport } from "@/lib/mock-data";
import type { SaveSummary } from "@/lib/save-summary";

export function sportNoun(sport: Sport) {
  return sport === "Ride"
    ? "ride"
    : sport === "Swim"
      ? "swim"
      : sport === "Hike"
        ? "hike"
        : sport === "Walk"
          ? "walk"
          : "run";
}

/** Sec/km for most sports; km/h for rides. Matches the server's calculation. */
export function paceValueOf(
  activity: Pick<
    Activity,
    "sport" | "avgPaceSecPerKm" | "avgSpeedKmh" | "distanceKm" | "movingSeconds"
  >,
) {
  if (activity.sport === "Ride") {
    return (
      activity.avgSpeedKmh ?? activity.distanceKm / (Math.max(1, activity.movingSeconds) / 3600)
    );
  }
  return activity.avgPaceSecPerKm ?? activity.movingSeconds / Math.max(0.01, activity.distanceKm);
}

/** True when `a` is a better pace than `b` for the sport. */
export function fasterThan(sport: Sport, a: number, b: number) {
  return sport === "Ride" ? a > b : a < b;
}

export function fmtPaceValue(sport: Sport, value: number) {
  return sport === "Ride" ? `${value.toFixed(1)} km/h` : fmtPace(value);
}

export function fmtMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export type Comparison = {
  label: string;
  value: string;
  delta: string;
  positive: boolean | null;
};

export function compareToAverage(
  summary: Pick<SaveSummary, "activity" | "averages">,
): Comparison[] {
  const { activity, averages } = summary;
  if (!averages) return [];
  const pace = paceValueOf(activity);
  const distPct = ((activity.distanceKm - averages.distanceKm) / averages.distanceKm) * 100;
  const paceDiff = Math.abs(pace - averages.paceValue);
  const faster = fasterThan(activity.sport, pace, averages.paceValue);
  const rows: Comparison[] = [
    {
      label: "Distance",
      value: `${activity.distanceKm.toFixed(1)} km`,
      delta: `${distPct >= 0 ? "+" : "−"}${Math.abs(Math.round(distPct))}% vs avg ${averages.distanceKm.toFixed(1)} km`,
      positive: Math.abs(distPct) < 1 ? null : distPct > 0,
    },
    {
      label: activity.sport === "Ride" ? "Speed" : "Pace",
      value: fmtPaceValue(activity.sport, pace),
      delta:
        activity.sport === "Ride"
          ? `${faster ? "+" : "−"}${paceDiff.toFixed(1)} km/h vs avg`
          : `${paceDiff < 60 ? `${Math.round(paceDiff)}s` : fmtDuration(paceDiff)}/km ${faster ? "faster" : "slower"} than avg`,
      positive: paceDiff < 1 ? null : faster,
    },
  ];
  if (activity.sport !== "Swim") {
    const elevDiff = activity.elevationM - averages.elevationM;
    rows.push({
      label: "Climb",
      value: `${activity.elevationM} m`,
      delta: `${elevDiff >= 0 ? "+" : "−"}${Math.abs(Math.round(elevDiff))} m vs avg`,
      positive: Math.abs(elevDiff) < 5 ? null : elevDiff > 0,
    });
  }
  return rows;
}

export function deltaTone(positive: boolean | null) {
  return positive ? "text-pr-foreground" : "text-muted-foreground";
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
