import { describe, expect, it } from "vitest";
import {
  distanceUnit,
  elevationUnit,
  fmtDistance,
  fmtElevation,
  fmtPace,
  fmtPaceValue,
  fmtSpeed,
  fromDistance,
  fromElevation,
  isUnitSystem,
  paceUnit,
  resplit,
  speedUnit,
  toDistance,
  toElevation,
  toPaceSeconds,
  type Split,
} from "./units";

function splits(count: number, paceSec = 300): Split[] {
  return Array.from({ length: count }, (_, index) => ({
    km: index + 1,
    paceSec,
    hr: 150,
    elev: 10,
  }));
}

describe("unit labels", () => {
  it("returns metric labels", () => {
    expect(distanceUnit("metric")).toBe("km");
    expect(elevationUnit("metric")).toBe("m");
    expect(speedUnit("metric")).toBe("km/h");
    expect(paceUnit("metric")).toBe("/km");
  });

  it("returns imperial labels", () => {
    expect(distanceUnit("imperial")).toBe("mi");
    expect(elevationUnit("imperial")).toBe("ft");
    expect(speedUnit("imperial")).toBe("mph");
    expect(paceUnit("imperial")).toBe("/mi");
  });
});

describe("conversions", () => {
  it("passes metric values through untouched", () => {
    expect(toDistance(10, "metric")).toBe(10);
    expect(toElevation(500, "metric")).toBe(500);
    expect(toPaceSeconds(300, "metric")).toBe(300);
  });

  it("converts km to miles", () => {
    expect(toDistance(1.609344, "imperial")).toBeCloseTo(1, 6);
    expect(toDistance(42.195, "imperial")).toBeCloseTo(26.2187, 3);
  });

  it("converts metres to feet", () => {
    expect(toElevation(0.3048, "imperial")).toBeCloseTo(1, 6);
    expect(toElevation(1000, "imperial")).toBeCloseTo(3280.84, 2);
  });

  it("scales pace up for the longer imperial unit", () => {
    expect(toPaceSeconds(300, "imperial")).toBeCloseTo(482.8, 1);
  });
});

describe("formatters", () => {
  it("formats distance with its unit", () => {
    expect(fmtDistance(10, "metric")).toBe("10.00 km");
    expect(fmtDistance(10, "imperial")).toBe("6.21 mi");
    expect(fmtDistance(10, "imperial", 1)).toBe("6.2 mi");
  });

  it("formats elevation as a whole unit", () => {
    expect(fmtElevation(420, "metric")).toBe("420 m");
    expect(fmtElevation(420, "imperial")).toBe("1378 ft");
  });

  it("formats speed with its unit", () => {
    expect(fmtSpeed(32.18688, "metric")).toBe("32.2 km/h");
    expect(fmtSpeed(32.18688, "imperial")).toBe("20.0 mph");
  });

  it("formats pace as m:ss with the right suffix", () => {
    expect(fmtPace(300, "metric")).toBe("5:00/km");
    expect(fmtPace(90, "metric")).toBe("1:30/km");
    expect(fmtPace(300, "imperial")).toBe("8:03/mi");
    expect(fmtPaceValue(300, "imperial")).toBe("8:03");
  });

  it("pads seconds that round to a single digit", () => {
    expect(fmtPace(365, "metric")).toBe("6:05/km");
  });
});

describe("fromDistance / fromElevation", () => {
  it("round-trips through the display conversion", () => {
    expect(fromDistance(toDistance(42.195, "imperial"), "imperial")).toBeCloseTo(42.195, 9);
    expect(fromElevation(toElevation(1234, "imperial"), "imperial")).toBeCloseTo(1234, 9);
  });

  it("is the identity in metric", () => {
    expect(fromDistance(30, "metric")).toBe(30);
    expect(fromElevation(300, "metric")).toBe(300);
  });
});

describe("resplit", () => {
  it("leaves metric splits untouched", () => {
    const source = splits(5);
    expect(resplit(source, "metric")).toBe(source);
  });

  it("handles an empty list", () => {
    expect(resplit([], "imperial")).toEqual([]);
  });

  it("produces one lap per mile plus a trailing partial", () => {
    // 5 km ≈ 3.107 mi, so three full miles and a short fourth lap.
    const laps = resplit(splits(5), "imperial");
    expect(laps).toHaveLength(4);
    expect(laps.map((lap) => lap.km)).toEqual([1, 2, 3, 4]);
  });

  it("keeps a constant pace constant across the re-segmentation", () => {
    // Every source km ran at 5:00/km, so every mile lap must too.
    const laps = resplit(splits(5), "imperial");
    for (const lap of laps) {
      expect(lap.paceSec).toBeCloseTo(300, 9);
      expect(fmtPace(lap.paceSec, "imperial")).toBe("8:03/mi");
    }
  });

  it("blends pace across a km boundary a mile lap straddles", () => {
    // Lap 1 covers all of km 1 plus 0.609344 of km 2.
    const source: Split[] = [
      { km: 1, paceSec: 240, hr: 140, elev: 0 },
      { km: 2, paceSec: 360, hr: 160, elev: 0 },
    ];
    const [first] = resplit(source, "imperial");
    const expected = (240 * 1 + 360 * 0.609344) / 1.609344;
    expect(first.paceSec).toBeCloseTo(expected, 9);
    expect(first.hr).toBe(Math.round((140 * 1 + 160 * 0.609344) / 1.609344));
  });

  it("conserves total elevation gain", () => {
    const laps = resplit(splits(5), "imperial");
    const total = laps.reduce((sum, lap) => sum + lap.elev, 0);
    // 5 source km at 10 m each; rounding per lap keeps it within a metre.
    expect(total).toBeGreaterThanOrEqual(49);
    expect(total).toBeLessThanOrEqual(51);
  });
});

describe("isUnitSystem", () => {
  it("accepts known systems and rejects anything else", () => {
    expect(isUnitSystem("metric")).toBe(true);
    expect(isUnitSystem("imperial")).toBe(true);
    expect(isUnitSystem("furlongs")).toBe(false);
    expect(isUnitSystem(null)).toBe(false);
  });
});
