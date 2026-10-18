import { describe, expect, it } from "vitest";
import { rawElevationGain } from "./elevation.js";
import { generateSeedActivities } from "./seed.js";

// Seeded devices and streams are synthetic demo data (there is no real device sync).
describe("seeded recording devices and elevation streams", () => {
  const activities = generateSeedActivities();
  const recorded = activities.filter((activity) => activity.sport !== "Swim");

  it("is deterministic, so restarts don't change devices or streams", () => {
    // Dates are relative to "now"; everything this PR seeds must not be.
    const pick = (list: typeof activities) =>
      list.map(({ id, device, elevationStream }) => ({ id, device, elevationStream }));
    expect(pick(generateSeedActivities())).toEqual(pick(activities));
  });

  it("gives every activity a device, and bike computers only to rides", () => {
    const bikeOnly = ["Garmin Edge 840", "Wahoo ELEMNT Bolt"];
    for (const activity of activities) {
      expect(activity.device).toBeDefined();
      if (activity.sport !== "Ride") expect(bikeOnly).not.toContain(activity.device!.name);
    }
  });

  it("gives swims no elevation stream", () => {
    for (const activity of activities.filter((a) => a.sport === "Swim")) {
      expect(activity.elevationStream).toBeUndefined();
    }
  });

  it("records a stream whose climb matches the activity's reported elevation", () => {
    expect(recorded.length).toBeGreaterThan(0);
    for (const activity of recorded) {
      const stream = activity.elevationStream!;
      expect(stream.elevationM).toHaveLength(stream.distanceKm.length);
      expect(stream.distanceKm.at(-1)).toBeCloseTo(activity.distanceKm, 1);
      // Rounding samples to 0.1 m moves the total by a few metres at most.
      expect(Math.abs(rawElevationGain(stream.elevationM) - activity.elevationM)).toBeLessThan(
        Math.max(5, activity.elevationM * 0.02),
      );
    }
  });
});
