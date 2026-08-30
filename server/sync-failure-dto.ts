// STR-27: pure mapping logic for turning a sync_failures row into the DTO
// the client renders as a recovery prompt in the feed. Kept dependency-free
// (no db import) so it can be unit tested without a live database, the same
// way database-scope.ts is.
export type Sport = "Run" | "Ride" | "Swim" | "Hike" | "Walk";

export type SyncFailureRow = {
  id: string;
  athleteId: string;
  deviceName: string;
  deviceType: string;
  attemptedAt: Date;
  sportGuess: string;
  gpsPointsCaptured: number;
  routeSeed: number | null;
  reason: string;
};

export type SyncFailureDto = {
  id: string;
  athleteId: string;
  deviceName: string;
  deviceType: "watch" | "bike" | "strap" | "phone";
  attemptedAt: string;
  sportGuess: Sport;
  gpsPointsCaptured: number;
  routeSeed?: number;
  reason: string;
};

// Aliases the authenticated user's own id to "me", matching how activities
// and athletes are aliased elsewhere in the API so the client never has to
// know its own real user id.
export function mapSyncFailure(row: SyncFailureRow, currentUserId: string): SyncFailureDto {
  return {
    id: row.id,
    athleteId: row.athleteId === currentUserId ? "me" : row.athleteId,
    deviceName: row.deviceName,
    deviceType: row.deviceType as SyncFailureDto["deviceType"],
    attemptedAt: row.attemptedAt.toISOString(),
    sportGuess: row.sportGuess as Sport,
    gpsPointsCaptured: row.gpsPointsCaptured,
    routeSeed: row.routeSeed ?? undefined,
    reason: row.reason,
  };
}
