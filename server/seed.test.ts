import { describe, expect, it } from "vitest";
import { computeGpsConfidence, generateSeedActivities } from "./seed";

// Deterministic stand-in for the seed's rnd() generator — returns each
// queued value in order so tests can pin exactly which branch fires.
function queueRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

describe("computeGpsConfidence", () => {
  it("never flags a pool swim, even on a roll that would flag any other sport", () => {
    const result = computeGpsConfidence({
      sport: "Swim",
      city: "Tokyo",
      distanceKm: 2,
      random: queueRandom([0.99]),
    });

    expect(result.routeConfidence).toBeUndefined();
    expect(result.distanceRangeKm).toBeUndefined();
  });

  it("does not flag a non-urban run when the roll is below its (higher) threshold", () => {
    const result = computeGpsConfidence({
      sport: "Run",
      city: "Boulder",
      distanceKm: 10,
      random: queueRandom([0.9]),
    });

    expect(result.routeConfidence).toBeUndefined();
    expect(result.distanceRangeKm).toBeUndefined();
  });

  it("flags a non-urban run once the roll clears the higher threshold", () => {
    const result = computeGpsConfidence({
      sport: "Run",
      city: "Boulder",
      distanceKm: 10,
      random: queueRandom([0.95, 0.3, 0.5, 0.4]),
    });

    expect(result.routeConfidence).toHaveLength(1);
    expect(result.distanceRangeKm).toBeDefined();
  });

  it("flags an urban-canyon run at a roll that would pass a non-urban run", () => {
    const urban = computeGpsConfidence({
      sport: "Run",
      city: "Tokyo",
      distanceKm: 10,
      random: queueRandom([0.7, 0.3, 0.5, 0.4]),
    });
    const nonUrban = computeGpsConfidence({
      sport: "Run",
      city: "Boulder",
      distanceKm: 10,
      random: queueRandom([0.7, 0.3, 0.5, 0.4]),
    });

    expect(urban.routeConfidence).toHaveLength(1);
    expect(nonUrban.routeConfidence).toBeUndefined();
  });

  it("produces a segment within [0,1] with startT before endT", () => {
    const result = computeGpsConfidence({
      sport: "Ride",
      city: "Berlin",
      distanceKm: 30,
      random: queueRandom([0.99, 1, 1, 0]),
    });

    expect(result.routeConfidence).toBeDefined();
    const [segment] = result.routeConfidence!;
    expect(segment.startT).toBeGreaterThanOrEqual(0);
    expect(segment.endT).toBeLessThanOrEqual(1);
    expect(segment.startT).toBeLessThan(segment.endT);
  });

  it("brackets distanceRangeKm around distanceKm without going negative", () => {
    const result = computeGpsConfidence({
      sport: "Run",
      city: "Tokyo",
      distanceKm: 0.15,
      random: queueRandom([0.99, 0.3, 0.5, 1]),
    });

    expect(result.distanceRangeKm).toBeDefined();
    const [low, high] = result.distanceRangeKm!;
    expect(low).toBeGreaterThanOrEqual(0.1);
    expect(high).toBeGreaterThan(low);
  });
});

describe("generateSeedActivities", () => {
  // Integration-level check: computeGpsConfidence's own unit tests can pass
  // while the generated activity object simply never wires the result in
  // (exactly the bug this caught — the field was computed but not attached
  // to the pushed activity). Asserting on the actual generator output is
  // what would have failed.
  it("attaches routeConfidence/distanceRangeKm to at least one generated activity", () => {
    const activities = generateSeedActivities();
    const flagged = activities.filter((activity) => activity.routeConfidence);

    expect(flagged.length).toBeGreaterThan(0);

    for (const activity of flagged) {
      expect(activity.distanceRangeKm).toBeDefined();
      const [segment] = activity.routeConfidence!;
      expect(segment.startT).toBeGreaterThanOrEqual(0);
      expect(segment.endT).toBeLessThanOrEqual(1);
      const [low, high] = activity.distanceRangeKm!;
      expect(low).toBeLessThan(activity.distanceKm);
      expect(high).toBeGreaterThan(activity.distanceKm);
    }
  });

  it("never flags Swim activities", () => {
    const activities = generateSeedActivities();
    const flaggedSwims = activities.filter(
      (activity) => activity.sport === "Swim" && activity.routeConfidence,
    );

    expect(flaggedSwims).toHaveLength(0);
  });
});
