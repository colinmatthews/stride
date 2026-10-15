import { describe, expect, it } from "vitest";
import {
  PRESETS,
  customEffort,
  effortToActivity,
  goalStatusLine,
  progressToast,
} from "./goal-tracker";

const tracker = { goal: 5, windowDays: 14, endsAt: "2026-10-15T15:00:00.000Z" };

describe("quick-log efforts", () => {
  it("turns every preset into a valid activity the server accepts", () => {
    for (const preset of PRESETS) {
      const payload = effortToActivity(preset, 7);
      expect(payload.distanceKm).toBeGreaterThan(0);
      expect(payload.movingSeconds).toBe(preset.minutes * 60);
      expect(payload.routeSeed).toBe(7);
    }
  });

  it("uses speed for rides and pace for runs, walks, and hikes", () => {
    const ride = effortToActivity(customEffort("Ride", 30), 1);
    expect(ride.avgSpeedKmh).toBe(18);
    expect(ride.avgPaceSecPerKm).toBeUndefined();

    const walk = effortToActivity(customEffort("Walk", 10), 1);
    expect(walk.avgPaceSecPerKm).toBe(750);
    expect(walk.avgSpeedKmh).toBeUndefined();

    const swim = effortToActivity(customEffort("Swim", 10), 1);
    expect(swim.avgPaceSecPerKm).toBeUndefined();
    expect(swim.elevationM).toBe(0);
  });

  it("never estimates a zero distance for a short custom effort", () => {
    expect(customEffort("Swim", 1).km).toBe(0.1);
    expect(customEffort("Walk", 10).title).toBe("10-min walk");
  });
});

describe("goal copy", () => {
  it("counts down the days left", () => {
    expect(goalStatusLine({ ...tracker, day: 4, count: 1 })).toMatch(/^11 days left · ends /);
  });

  it("calls out the last day", () => {
    expect(goalStatusLine({ ...tracker, day: 14, count: 2 })).toBe(
      "Last day. Any activity still counts.",
    );
  });

  it("marks the goal done at 5", () => {
    expect(goalStatusLine({ ...tracker, day: 6, count: 5 })).toBe(
      "Goal done. Five in your first two weeks.",
    );
  });

  it("shows progress after each save", () => {
    expect(progressToast(4, 5)).toBe("4 of 5 logged in your first two weeks.");
    expect(progressToast(5, 5)).toBe("That's 5 in your first two weeks. Goal done.");
  });
});
