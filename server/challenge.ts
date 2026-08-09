// Pure challenge-selection logic, kept free of DB access so it's cheap to
// unit test. `endsAt` is a date-only string (e.g. "2026-04-30") as stored by
// the `challenges.ends_at` column.

export type SelectableChallenge = { id: string; endsAt: string; sport: string };

export function challengeEndOfDay(endsAt: string): Date {
  return new Date(`${endsAt}T23:59:59.999Z`);
}

// Picks the challenge to nudge the athlete about: the soonest-closing
// challenge that hasn't ended yet. Returns null when every challenge has
// already closed, so callers know to skip the nudge entirely rather than
// showing a negative "closes in -12 days".
export function pickFeaturedChallenge<T extends SelectableChallenge>(
  challenges: T[],
  asOf: Date,
): T | null {
  const upcoming = challenges.filter((challenge) => challengeEndOfDay(challenge.endsAt) >= asOf);

  if (upcoming.length === 0) {
    return null;
  }

  return [...upcoming].sort(
    (a, b) => challengeEndOfDay(a.endsAt).getTime() - challengeEndOfDay(b.endsAt).getTime(),
  )[0];
}
