import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NUDGE_WINDOW_HOURS,
  createActivationNudge,
  formatHoursRemaining,
  isNudgeActive,
  type ActivationNudge,
} from "./nudges";
import type { Challenge } from "./mock-data";

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "ch1",
    name: "April Distance Run",
    sport: "Run",
    goalKm: 100,
    myProgressKm: 0,
    participants: 100,
    endsAt: "2026-04-30",
    badge: "RUN",
    tier: "approachable",
    firstStep: {
      activityLabel: "Log a 5K today toward your April Distance Run goal.",
      suggestedDistanceKm: 5,
    },
    ...overrides,
  };
}

describe("createActivationNudge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("carries the challenge's first-step details and joins-at timestamp", () => {
    const nudge = createActivationNudge(challenge());

    expect(nudge).toEqual<ActivationNudge>({
      challengeId: "ch1",
      challengeName: "April Distance Run",
      sport: "Run",
      activityLabel: "Log a 5K today toward your April Distance Run goal.",
      suggestedDistanceKm: 5,
      suggestedElevationM: undefined,
      joinedAt: Date.now(),
    });
  });

  it("carries an elevation suggestion when the first step includes one", () => {
    const nudge = createActivationNudge(
      challenge({
        firstStep: {
          activityLabel: "Log a short climbing ride today toward your Climb 5,000m goal.",
          suggestedDistanceKm: 12,
          suggestedElevationM: 300,
        },
      }),
    );

    expect(nudge.suggestedElevationM).toBe(300);
  });
});

describe("isNudgeActive", () => {
  function nudge(joinedAt: number): ActivationNudge {
    return {
      challengeId: "ch1",
      challengeName: "April Distance Run",
      sport: "Run",
      activityLabel: "Log a 5K today toward your April Distance Run goal.",
      suggestedDistanceKm: 5,
      joinedAt,
    };
  }

  it("is active immediately after joining", () => {
    expect(isNudgeActive(nudge(Date.now()))).toBe(true);
  });

  it("is active just under the window boundary", () => {
    const joinedAt = Date.now() - (NUDGE_WINDOW_HOURS * 60 * 60 * 1000 - 1000);
    expect(isNudgeActive(nudge(joinedAt))).toBe(true);
  });

  it("is inactive once the window has fully elapsed", () => {
    const joinedAt = Date.now() - NUDGE_WINDOW_HOURS * 60 * 60 * 1000 - 1;
    expect(isNudgeActive(nudge(joinedAt))).toBe(false);
  });
});

describe("formatHoursRemaining", () => {
  it("reports a closing window at or below zero hours", () => {
    expect(formatHoursRemaining(0)).toBe("Window closing");
    expect(formatHoursRemaining(-1)).toBe("Window closing");
  });

  it("reports whole minutes under an hour", () => {
    expect(formatHoursRemaining(0.5)).toBe("30m left");
  });

  it("rounds sub-minute remainders up to at least one minute", () => {
    expect(formatHoursRemaining(0.001)).toBe("1m left");
  });

  it("reports whole hours, rounded down, at or above an hour", () => {
    expect(formatHoursRemaining(1.9)).toBe("1h left");
    expect(formatHoursRemaining(47)).toBe("47h left");
  });
});
