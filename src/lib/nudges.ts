import { useEffect, useState } from "react";
import type { Challenge, Sport } from "./mock-data";

// Post-join activation nudge — a lightweight in-app prompt that surfaces the
// specific "first step" for a challenge a member just joined. It's meant to
// land within the window where converting joiners already tend to act, so we
// keep it alive for NUDGE_WINDOW_HOURS from the moment they joined.

export const NUDGE_WINDOW_HOURS = 48;

const STORAGE_KEY = "stride:activationNudge:v1";
const NUDGE_EVENT = "stride:activation-nudge-changed";

export interface ActivationNudge {
  challengeId: string;
  challengeName: string;
  sport: Sport | "Multisport";
  activityLabel: string;
  suggestedDistanceKm: number;
  suggestedElevationM?: number;
  joinedAt: number;
}

export function isNudgeActive(nudge: ActivationNudge): boolean {
  return Date.now() - nudge.joinedAt < NUDGE_WINDOW_HOURS * 60 * 60 * 1000;
}

export function createActivationNudge(challenge: Challenge): ActivationNudge {
  return {
    challengeId: challenge.id,
    challengeName: challenge.name,
    sport: challenge.sport,
    activityLabel: challenge.firstStep.activityLabel,
    suggestedDistanceKm: challenge.firstStep.suggestedDistanceKm,
    suggestedElevationM: challenge.firstStep.suggestedElevationM,
    joinedAt: Date.now(),
  };
}

function readNudge(): ActivationNudge | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivationNudge;
    if (!isNudgeActive(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setActivationNudge(nudge: ActivationNudge) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nudge));
  window.dispatchEvent(new Event(NUDGE_EVENT));
}

export function clearActivationNudge() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(NUDGE_EVENT));
}

export function formatHoursRemaining(hours: number): string {
  if (hours <= 0) return "Window closing";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m left`;
  return `${Math.floor(hours)}h left`;
}

export function useActivationNudge() {
  const [nudge, setNudge] = useState<ActivationNudge | null>(() => readNudge());

  useEffect(() => {
    const sync = () => setNudge(readNudge());
    sync();
    window.addEventListener(NUDGE_EVENT, sync);
    window.addEventListener("storage", sync);
    const interval = window.setInterval(sync, 60_000);
    return () => {
      window.removeEventListener(NUDGE_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.clearInterval(interval);
    };
  }, []);

  const hoursRemaining = nudge
    ? Math.max(0, NUDGE_WINDOW_HOURS - (Date.now() - nudge.joinedAt) / 3_600_000)
    : 0;

  return { nudge, hoursRemaining, dismiss: clearActivationNudge };
}
