import { useSyncExternalStore } from "react";
import type { Challenge } from "./mock-data";

export interface ChallengeCompletion {
  challenge: Challenge;
  fromPct: number;
}

type Listener = () => void;

let current: ChallengeCompletion | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

// Called right after saving an activity that pushes a joined challenge to
// 100% — the celebration modal is mounted once at the app root, so this
// works no matter which page the user lands on next.
export function announceChallengeCompletion(completion: ChallengeCompletion) {
  current = completion;
  emit();
}

export function clearChallengeCompletion() {
  current = null;
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function useChallengeCompletion() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
