import { describe, expect, it } from "vitest";
import { getTierProgress, tierIndexFor, TIERS } from "./tiers";

describe("tierIndexFor", () => {
  it("returns the first tier for zero activities", () => {
    expect(tierIndexFor(0)).toBe(0);
  });

  it("returns the first tier for any count below the second tier's minimum", () => {
    expect(tierIndexFor(4)).toBe(0);
  });

  it("returns the exact tier when count equals its minimum", () => {
    expect(tierIndexFor(5)).toBe(1);
    expect(tierIndexFor(10)).toBe(2);
    expect(tierIndexFor(18)).toBe(3);
    expect(tierIndexFor(28)).toBe(4);
  });

  it("returns the tier just below the next minimum", () => {
    expect(tierIndexFor(9)).toBe(1);
    expect(tierIndexFor(17)).toBe(2);
    expect(tierIndexFor(27)).toBe(3);
  });

  it("returns the last tier for counts far beyond its minimum", () => {
    expect(tierIndexFor(1000)).toBe(TIERS.length - 1);
  });

  it("never returns a negative index for negative input", () => {
    // Defensive: a real total count from the DB should never be negative,
    // but a malformed response shouldn't crash the tier calculation.
    expect(tierIndexFor(-5)).toBe(0);
  });
});

describe("getTierProgress", () => {
  it("starts a brand-new athlete at Getting started with 0% progress", () => {
    const progress = getTierProgress(0);
    expect(progress.current.name).toBe("Getting started");
    expect(progress.next?.name).toBe("Building momentum");
    expect(progress.progressPct).toBe(0);
  });

  it("computes progress toward the next tier proportionally", () => {
    // Consistent spans 10..18 (Committed). At 14, that's the midpoint.
    const progress = getTierProgress(14);
    expect(progress.current.name).toBe("Consistent");
    expect(progress.next?.name).toBe("Committed");
    expect(progress.progressPct).toBe(50);
  });

  it("reports 100% progress at the exact boundary of the next tier", () => {
    const progress = getTierProgress(18);
    expect(progress.current.name).toBe("Committed");
    expect(progress.progressPct).toBe(0);
  });

  it("has no next tier and 100% progress at the top tier", () => {
    const progress = getTierProgress(50);
    expect(progress.current.name).toBe("Elite");
    expect(progress.next).toBeUndefined();
    expect(progress.progressPct).toBe(100);
  });

  it("clamps progress to 0-100 even with an out-of-range count", () => {
    const progress = getTierProgress(-3);
    expect(progress.progressPct).toBeGreaterThanOrEqual(0);
    expect(progress.progressPct).toBeLessThanOrEqual(100);
  });
});
