// Sport lists shared between data.ts and validation.ts. Deliberately has no
// dependency on db.ts (which opens a real Postgres pool at import time) so
// that pure validation logic/tests don't need a database connection.
export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";
export type CrossTrainingSport = "Strength" | "Yoga" | "Stretching";
export type ActivityKind = Sport | CrossTrainingSport;

export const GPS_SPORTS = ["Run", "Ride", "Swim", "Hike", "Walk"] as const satisfies Sport[];
export const CROSS_TRAINING_SPORTS = [
  "Strength",
  "Yoga",
  "Stretching",
] as const satisfies CrossTrainingSport[];

export function isCrossTraining(sport: string): sport is CrossTrainingSport {
  return (CROSS_TRAINING_SPORTS as readonly string[]).includes(sport);
}
