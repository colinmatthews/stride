// Pure streak math, kept free of DB access so it's cheap to unit test.
// A "streak" is the count of consecutive calendar months, ending at
// `asOf`'s month, in which an athlete logged at least one activity.

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function computeMonthlyStreak(activityDates: Date[], asOf: Date): number {
  const monthsWithActivity = new Set(activityDates.map(monthKey));
  let streak = 0;
  let cursor = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));

  while (monthsWithActivity.has(monthKey(cursor))) {
    streak += 1;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1));
  }

  return streak;
}
