import { describe, expect, it } from "vitest";
import { computeConfidenceIndexRange } from "./route-map-confidence";

describe("computeConfidenceIndexRange", () => {
  it("maps a mid-route fraction to indices within bounds", () => {
    const { startIdx, endIdx } = computeConfidenceIndexRange(0.2, 0.4, 25);

    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeLessThan(25);
    expect(endIdx).toBeGreaterThan(startIdx);
  });

  it("clamps startT at 0 to the first point", () => {
    const { startIdx } = computeConfidenceIndexRange(0, 0.1, 25);
    expect(startIdx).toBe(0);
  });

  it("clamps endT at 1 to the last point", () => {
    const { endIdx } = computeConfidenceIndexRange(0.9, 1, 25);
    expect(endIdx).toBe(24);
  });

  it("always keeps endIdx at least one past startIdx, even for a near-zero-length segment", () => {
    const { startIdx, endIdx } = computeConfidenceIndexRange(0.5, 0.5001, 25);
    expect(endIdx).toBeGreaterThan(startIdx);
  });

  it("never produces an out-of-range index for a short point list", () => {
    const { startIdx, endIdx } = computeConfidenceIndexRange(0.1, 0.9, 2);
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeLessThan(2);
  });
});
