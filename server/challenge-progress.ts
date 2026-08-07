export type ProgressActivityRow = {
  sport: string;
  distanceKm: number;
  elevationM: number;
  date: Date;
};

// A challenge's `endsAt` is a date-only column ("YYYY-MM-DD"); treat the
// challenge as active through the end of that day.
export function endOfChallengeDay(endsAt: string): Date {
  return new Date(`${endsAt}T23:59:59.999Z`);
}

// Pure and unit-testable: sums only the activities that fall within the
// window the user could actually have earned credit in for this specific
// challenge — matching sport, on or after they joined, on or before the
// challenge's deadline. This is what prevents a single run from inflating
// every challenge of that sport regardless of when the user joined, and
// prevents elevation challenges from picking up elevation gained doing a
// different sport.
export function computeChallengeProgress(
  activityRows: ProgressActivityRow[],
  challenge: { sport: string; metricType: string; endsAt: Date },
  joinedAt: Date,
): number {
  let total = 0;

  for (const row of activityRows) {
    if (row.sport !== challenge.sport) continue;
    if (row.date < joinedAt) continue;
    if (row.date > challenge.endsAt) continue;

    total += challenge.metricType === "elevation_m" ? row.elevationM : row.distanceKm;
  }

  return Math.round(total * 10) / 10;
}
