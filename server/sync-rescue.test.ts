import { describe, expect, it } from "vitest";
import { daysIntoFirst90, parseSyncFailureInput } from "./sync-rescue.js";

const validBody = {
  device: "Garmin Forerunner 265",
  reason: "Connection dropped 200m from the trailhead — the upload never completed.",
  failedAt: "2026-08-05T12:00:00.000Z",
  payload: {
    sport: "Run",
    title: "Tempo intervals",
    description: "Felt strong today.",
    distanceKm: 8.42,
    movingSeconds: 2536,
    elevationM: 96,
    avgHr: 154,
    avgPaceSecPerKm: 301,
    routeSeed: 501,
  },
};

describe("parseSyncFailureInput", () => {
  it("accepts a full device payload", () => {
    const result = parseSyncFailureInput(validBody);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.device).toBe("Garmin Forerunner 265");
      expect(result.value.sport).toBe("Run");
      expect(result.value.distanceKm).toBe(8.42);
      expect(result.value.movingSeconds).toBe(2536);
      expect(result.value.failedAt.toISOString()).toBe("2026-08-05T12:00:00.000Z");
    }
  });

  it("rejects a missing device", () => {
    const result = parseSyncFailureInput({ ...validBody, device: "  " });

    expect(result).toEqual({ ok: false, error: "device is required" });
  });

  it("rejects an unknown sport", () => {
    const result = parseSyncFailureInput({
      ...validBody,
      payload: { ...validBody.payload, sport: "Rowing" },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects non-positive distance", () => {
    const result = parseSyncFailureInput({
      ...validBody,
      payload: { ...validBody.payload, distanceKm: 0 },
    });

    expect(result).toEqual({ ok: false, error: "payload.distanceKm must be positive" });
  });

  it("rejects an unparseable failedAt", () => {
    const result = parseSyncFailureInput({ ...validBody, failedAt: "not-a-date" });

    expect(result).toEqual({ ok: false, error: "failedAt must be a valid timestamp" });
  });

  it("defaults failedAt to now and optional metrics to undefined", () => {
    const result = parseSyncFailureInput({
      device: "Wahoo ELEMNT",
      reason: "Timeout",
      payload: { sport: "Ride", title: "Commute", distanceKm: 12, movingSeconds: 1800 },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.avgHr).toBeUndefined();
      expect(result.value.avgPaceSecPerKm).toBeUndefined();
      expect(result.value.elevationM).toBe(0);
      expect(result.value.routeSeed).toBe(1);
      expect(Number.isNaN(result.value.failedAt.getTime())).toBe(false);
    }
  });
});

describe("daysIntoFirst90", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");

  it("is day 1 on the account's first day", () => {
    expect(daysIntoFirst90(new Date("2026-08-05T09:00:00.000Z"), now)).toBe(1);
  });

  it("counts days 1-based inside the window", () => {
    expect(daysIntoFirst90(new Date("2026-07-22T12:00:00.000Z"), now)).toBe(15);
  });

  it("is 90 on the last day of the window", () => {
    expect(daysIntoFirst90(new Date("2026-05-08T11:00:00.000Z"), now)).toBe(90);
  });

  it("is null once the window has passed", () => {
    expect(daysIntoFirst90(new Date("2026-05-06T12:00:00.000Z"), now)).toBeNull();
  });

  it("clamps clock skew to day 1 instead of going negative", () => {
    expect(daysIntoFirst90(new Date("2026-08-06T12:00:00.000Z"), now)).toBe(1);
  });
});
