import { describe, expect, it } from "vitest";
import { createActivityBodySchema } from "./validation.js";

describe("createActivityBodySchema", () => {
  it("accepts a valid GPS activity payload", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Run",
      title: "Morning run",
      distanceKm: 5.2,
      movingSeconds: 1800,
      elevationM: 40,
      routeSeed: 12,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a GPS activity with no distance", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Run",
      title: "Morning run",
      movingSeconds: 1800,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.distanceKm).toBeDefined();
    }
  });

  it("rejects a GPS activity with a zero distance", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Ride",
      distanceKm: 0,
      movingSeconds: 1800,
    });

    expect(result.success).toBe(false);
  });

  it.each(["Strength", "Yoga", "Stretching"] as const)(
    "accepts a valid %s (cross-training) payload with only a duration",
    (sport) => {
      const result = createActivityBodySchema.safeParse({
        sport,
        title: "Session",
        movingSeconds: 1800,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.distanceKm).toBeUndefined();
      }
    },
  );

  it("accepts a cross-training payload with an explicit zero distance", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Yoga",
      movingSeconds: 1800,
      distanceKm: 0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a cross-training payload with a nonzero distance", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Yoga",
      movingSeconds: 1800,
      distanceKm: 5,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.distanceKm).toBeDefined();
    }
  });

  it("rejects a cross-training payload with pace or speed set", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Strength",
      movingSeconds: 1800,
      avgSpeedKmh: 10,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing or non-positive duration for any sport", () => {
    expect(
      createActivityBodySchema.safeParse({ sport: "Strength", movingSeconds: 0 }).success,
    ).toBe(false);
    expect(createActivityBodySchema.safeParse({ sport: "Run", distanceKm: 5 }).success).toBe(false);
  });

  it("rejects an unknown sport value", () => {
    const result = createActivityBodySchema.safeParse({
      sport: "Pilates",
      movingSeconds: 1800,
    });

    expect(result.success).toBe(false);
  });
});
