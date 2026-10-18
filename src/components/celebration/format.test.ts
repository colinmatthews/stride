import { describe, expect, it } from "vitest";
import type { Activity } from "@/lib/mock-data";
import { compareToAverage, fmtMinutes, fmtPaceValue, ordinal, paceValueOf } from "./format";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    athleteId: "me",
    sport: "Run",
    title: "Morning run",
    date: "2026-10-17T15:00:00Z",
    distanceKm: 10,
    movingSeconds: 3000,
    elevationM: 80,
    avgPaceSecPerKm: 300,
    kudos: 0,
    comments: [],
    achievements: 0,
    routeSeed: 1,
    ...overrides,
  };
}

describe("ordinal", () => {
  it("uses the right English suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });
});

describe("fmtMinutes", () => {
  it("shows minutes alone under an hour", () => {
    expect(fmtMinutes(0)).toBe("0m");
    expect(fmtMinutes(45)).toBe("45m");
  });

  it("shows hours and minutes from an hour up", () => {
    expect(fmtMinutes(60)).toBe("1h 0m");
    expect(fmtMinutes(135)).toBe("2h 15m");
  });
});

describe("fmtPaceValue", () => {
  it("formats rides as speed and everything else as pace", () => {
    expect(fmtPaceValue("Ride", 28.25)).toBe("28.3 km/h");
    expect(fmtPaceValue("Run", 305)).toBe("5:05/km");
    expect(fmtPaceValue("Swim", 120)).toBe("2:00/km");
  });
});

describe("paceValueOf", () => {
  it("prefers recorded averages and derives them otherwise", () => {
    expect(paceValueOf(activity())).toBe(300);
    expect(paceValueOf(activity({ avgPaceSecPerKm: undefined }))).toBe(300);
    expect(paceValueOf(activity({ sport: "Ride", avgSpeedKmh: 31.5 }))).toBe(31.5);
    expect(paceValueOf(activity({ sport: "Ride", distanceKm: 30, movingSeconds: 3600 }))).toBe(30);
  });
});

describe("compareToAverage", () => {
  it("returns nothing without history", () => {
    expect(compareToAverage({ activity: activity(), averages: null })).toEqual([]);
  });

  it("compares distance, pace, and climb against the average run", () => {
    const rows = compareToAverage({
      activity: activity(),
      averages: { distanceKm: 8, paceValue: 320, elevationM: 100 },
    });

    expect(rows).toEqual([
      { label: "Distance", value: "10.0 km", delta: "+25% vs avg 8.0 km", positive: true },
      { label: "Pace", value: "5:00/km", delta: "20s/km faster than avg", positive: true },
      { label: "Climb", value: "80 m", delta: "−20 m vs avg", positive: false },
    ]);
  });

  it("treats higher speed as better for rides", () => {
    const [, speed] = compareToAverage({
      activity: activity({ sport: "Ride", avgPaceSecPerKm: undefined, avgSpeedKmh: 27 }),
      averages: { distanceKm: 10, paceValue: 30, elevationM: 80 },
    });

    expect(speed).toEqual({
      label: "Speed",
      value: "27.0 km/h",
      delta: "−3.0 km/h vs avg",
      positive: false,
    });
  });

  it("marks near-identical values as neutral and skips climb for swims", () => {
    const rows = compareToAverage({
      activity: activity({
        sport: "Swim",
        distanceKm: 2,
        movingSeconds: 2400,
        avgPaceSecPerKm: 1200,
      }),
      averages: { distanceKm: 2, paceValue: 1200.5, elevationM: 0 },
    });

    expect(rows.map((row) => row.label)).toEqual(["Distance", "Pace"]);
    expect(rows.map((row) => row.positive)).toEqual([null, null]);
  });

  it("formats pace gaps over a minute as m:ss", () => {
    const [, pace] = compareToAverage({
      activity: activity({ avgPaceSecPerKm: 400 }),
      averages: { distanceKm: 10, paceValue: 300, elevationM: 80 },
    });

    expect(pace.delta).toBe("1:40/km slower than avg");
  });
});
