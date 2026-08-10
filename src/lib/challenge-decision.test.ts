import { describe, expect, it } from "vitest";
import { buildChallengeDecision, challengeDifficulty, isChallengeOpen } from "./challenge-decision";
import type { Challenge } from "./mock-data";

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "ch1",
    name: "August Distance Run",
    sport: "Run",
    metricType: "distance_km",
    goalKm: 100,
    myProgressKm: 60,
    participants: 10,
    endsAt: "2026-08-31",
    badge: "RUN",
    joined: false,
    ...overrides,
  };
}

describe("challenge decision", () => {
  const now = new Date("2026-08-09T12:00:00");

  it("uses real progress and deadline data to explain fit", () => {
    const decision = buildChallengeDecision(challenge(), now);

    expect(decision.fit).toBe("Strong fit");
    expect(decision.fitReason).toContain("60 km");
    expect(decision.fitReason).toContain("40 km left");
    expect(decision.eligible).toBe(true);
    expect(decision.countingRules[0]).toContain("Run activities");
  });

  it("makes expired challenges ineligible", () => {
    const expired = challenge({ endsAt: "2026-08-01" });
    const decision = buildChallengeDecision(expired, now);

    expect(isChallengeOpen(expired.endsAt, now)).toBe(false);
    expect(decision.eligible).toBe(false);
    expect(decision.eligibility).toContain("no longer accepting entries");
  });

  it("uses the stored metric type when classifying elevation challenges", () => {
    const climb = challenge({ sport: "Ride", metricType: "elevation_m", goalKm: 5_000 });

    expect(challengeDifficulty(climb)).toBe("Advanced");
    expect(buildChallengeDecision(climb, now).countingRules[0]).toContain("Elevation");
  });
});
