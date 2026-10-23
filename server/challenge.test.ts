import { describe, expect, it } from "vitest";
import { pickFeaturedChallenge } from "./challenge.js";

describe("pickFeaturedChallenge", () => {
  const asOf = new Date("2026-08-09T12:00:00.000Z");

  it("returns null when every challenge has already ended", () => {
    // Matches the current seed data: all seeded challenges end before 2026-08-09.
    const challenges = [
      { id: "ch1", endsAt: "2026-04-30", sport: "Run" },
      { id: "ch2", endsAt: "2026-05-31", sport: "Run" },
    ];
    expect(pickFeaturedChallenge(challenges, asOf)).toBeNull();
  });

  it("picks the soonest-closing challenge that hasn't ended", () => {
    const challenges = [
      { id: "later", endsAt: "2026-09-30", sport: "Run" },
      { id: "soonest", endsAt: "2026-08-15", sport: "Ride" },
      { id: "past", endsAt: "2026-08-01", sport: "Run" },
    ];
    expect(pickFeaturedChallenge(challenges, asOf)?.id).toBe("soonest");
  });

  it("treats a challenge ending today as still upcoming", () => {
    const challenges = [{ id: "today", endsAt: "2026-08-09", sport: "Run" }];
    expect(pickFeaturedChallenge(challenges, asOf)?.id).toBe("today");
  });

  it("returns null for an empty list", () => {
    expect(pickFeaturedChallenge([], asOf)).toBeNull();
  });
});
