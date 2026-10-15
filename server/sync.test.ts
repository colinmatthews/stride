import { describe, expect, it } from "vitest";
import {
  MAX_RETRY_ATTEMPTS,
  createSyncRef,
  decideRetry,
  parseIngestBody,
  parseWorkoutPayload,
  statusAfterFailedRetry,
} from "./sync.js";

describe("parseWorkoutPayload", () => {
  it("rejects missing or incomplete workouts", () => {
    expect(parseWorkoutPayload(undefined)).toBeNull();
    expect(parseWorkoutPayload({ distanceKm: 5 })).toBeNull();
    expect(parseWorkoutPayload({ distanceKm: -1, movingSeconds: 60 })).toBeNull();
    expect(parseWorkoutPayload({ distanceKm: "5", movingSeconds: 60 })).toBeNull();
  });

  it("normalises a valid workout", () => {
    expect(
      parseWorkoutPayload({ distanceKm: 10.456, movingSeconds: 3000.4, elevationM: 120.6 }),
    ).toEqual({
      distanceKm: 10.46,
      movingSeconds: 3000,
      elevationM: 121,
      avgHr: undefined,
      avgPaceSecPerKm: undefined,
      avgSpeedKmh: undefined,
      routeSeed: 1,
    });
  });
});

describe("retry rules", () => {
  const row = { userId: "u1", status: "failed", attempts: 0 };

  it("counts the next attempt for a failed sync", () => {
    expect(decideRetry(row, "u1")).toEqual({ kind: "attempt", attempts: 1 });
  });

  it("hides syncs owned by another athlete", () => {
    expect(decideRetry(row, "someone-else")).toEqual({ kind: "not_found" });
    expect(decideRetry(undefined, "u1")).toEqual({ kind: "not_found" });
  });

  it("is idempotent once synced and refuses once stuck", () => {
    expect(decideRetry({ ...row, status: "synced" }, "u1")).toEqual({ kind: "already_synced" });
    expect(decideRetry({ ...row, status: "stuck" }, "u1")).toEqual({ kind: "retry_exhausted" });
  });

  it("marks a sync stuck after the last allowed retry fails", () => {
    expect(statusAfterFailedRetry(1)).toBe("failed");
    expect(statusAfterFailedRetry(MAX_RETRY_ATTEMPTS)).toBe("stuck");
  });
});

describe("createSyncRef", () => {
  it("produces a readable reference without ambiguous characters", () => {
    expect(createSyncRef(() => 0)).toBe("SYNC-222222");
    expect(createSyncRef()).toMatch(/^SYNC-[2-9A-HJKMNP-Z]{6}$/);
  });
});

describe("parseIngestBody", () => {
  const body = {
    provider: "garmin",
    deviceName: "Garmin Forerunner 265",
    externalId: "garmin-123",
    sport: "Run",
    title: "Morning tempo",
    startedAt: "2026-10-12T06:30:00.000Z",
  };

  it("accepts a device report without workout data", () => {
    expect(parseIngestBody({ ...body, errorCode: "upload_interrupted" })).toMatchObject({
      provider: "garmin",
      errorCode: "upload_interrupted",
      payload: undefined,
    });
  });

  it("maps unknown providers to other and ignores unknown error codes", () => {
    expect(parseIngestBody({ ...body, provider: "polar", errorCode: "gremlins" })).toMatchObject({
      provider: "other",
      errorCode: undefined,
    });
  });

  it("rejects bad input", () => {
    expect(parseIngestBody({ ...body, sport: "Rowing" })).toBeNull();
    expect(parseIngestBody({ ...body, startedAt: "yesterday-ish" })).toBeNull();
    expect(parseIngestBody({ ...body, title: "  " })).toBeNull();
    expect(parseIngestBody(undefined)).toBeNull();
  });
});
