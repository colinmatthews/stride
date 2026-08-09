// Pure helpers for the challenge nudge modal, kept free of DOM/React so
// they're cheap to unit test.

export function daysUntil(endsAt: string, now: Date): number {
  const end = new Date(`${endsAt}T23:59:59.999Z`);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

const DISMISS_STORAGE_PREFIX = "challenge-nudge-dismissed";

export function dismissStorageKey(userId: string, challengeId: string): string {
  return `${DISMISS_STORAGE_PREFIX}:${userId}:${challengeId}`;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The modal resurfaces once per calendar day until the athlete joins —
// dismissing it only silences it for the rest of today.
export function shouldShowChallengeNudge(lastDismissedIso: string | null, now: Date): boolean {
  if (!lastDismissedIso) {
    return true;
  }

  const lastDismissed = new Date(lastDismissedIso);

  if (Number.isNaN(lastDismissed.getTime())) {
    return true;
  }

  return dateKey(lastDismissed) !== dateKey(now);
}
