// Pure helpers for the challenge nudge banner, kept free of DOM/React so
// they're cheap to unit test.

export function daysUntil(endsAt: string, now: Date): number {
  const end = new Date(`${endsAt}T23:59:59.999Z`);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}
