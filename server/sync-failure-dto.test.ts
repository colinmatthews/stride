import { describe, expect, it } from "vitest";
import { mapSyncFailure, type SyncFailureRow } from "./sync-failure-dto.js";

function row(overrides: Partial<SyncFailureRow> = {}): SyncFailureRow {
  return {
    id: "fail-1",
    athleteId: "user-123",
    deviceName: "Forerunner 955",
    deviceType: "watch",
    attemptedAt: new Date("2025-06-01T09:00:00.000Z"),
    sportGuess: "Run",
    gpsPointsCaptured: 0,
    routeSeed: null,
    reason: "Connection dropped mid-sync",
    ...overrides,
  };
}

describe("mapSyncFailure", () => {
  it("aliases the authenticated user's own id to me", () => {
    const dto = mapSyncFailure(row({ athleteId: "user-123" }), "user-123");

    expect(dto.athleteId).toBe("me");
  });

  it("leaves other athletes' ids untouched", () => {
    const dto = mapSyncFailure(row({ athleteId: "user-123" }), "someone-else");

    expect(dto.athleteId).toBe("user-123");
  });

  it("formats attemptedAt as an ISO string", () => {
    const dto = mapSyncFailure(
      row({ attemptedAt: new Date("2025-06-01T09:00:00.000Z") }),
      "user-123",
    );

    expect(dto.attemptedAt).toBe("2025-06-01T09:00:00.000Z");
  });

  it("maps a null routeSeed to undefined", () => {
    const dto = mapSyncFailure(row({ routeSeed: null }), "user-123");

    expect(dto.routeSeed).toBeUndefined();
  });

  it("passes through a real routeSeed", () => {
    const dto = mapSyncFailure(row({ routeSeed: 202 }), "user-123");

    expect(dto.routeSeed).toBe(202);
  });
});
