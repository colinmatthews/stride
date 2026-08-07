import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHALLENGES,
  clearAppData,
  fmtDuration,
  fmtPace,
  fmtTimeAgo,
  getAthlete,
  initializeAppData,
  mergeChallenges,
  setLastChallengeUpdates,
  takeChallengeUpdates,
  type Athlete,
  type AppData,
  type Challenge,
  type ChallengeProgressUpdate,
} from "./mock-data";

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: "a1",
    name: "Pat",
    handle: "pat",
    avatar: "",
    city: "X",
    country: "Y",
    followers: 0,
    following: 0,
    bio: "",
    ...overrides,
  };
}

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "c1",
    name: "April Distance Run",
    sport: "Run",
    goalKm: 100,
    myProgressKm: 0,
    participants: 10,
    endsAt: "2026-04-30",
    badge: "RUN",
    joined: false,
    ...overrides,
  };
}

function challengeUpdate(overrides: Partial<ChallengeProgressUpdate> = {}): ChallengeProgressUpdate {
  return {
    id: "c1",
    name: "April Distance Run",
    sport: "Run",
    badge: "RUN",
    goalKm: 100,
    metricType: "distance_km",
    contribution: 12,
    progressAfter: 55,
    completed: false,
    ...overrides,
  };
}

function minimalAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    me: athlete({ id: "me", name: "Me" }),
    athletes: [athlete({ id: "a1", name: "Pat" })],
    activities: [],
    segments: [],
    clubs: [],
    challenges: [],
    ...overrides,
  };
}

describe("fmtDuration", () => {
  it("formats sub-hour duration as m:ss", () => {
    expect(fmtDuration(90)).toBe("1:30");
    expect(fmtDuration(3599)).toBe("59:59");
  });

  it("formats hour+ duration as h:mm:ss", () => {
    expect(fmtDuration(3600)).toBe("1:00:00");
    expect(fmtDuration(3661)).toBe("1:01:01");
  });
});

describe("fmtPace", () => {
  it("formats seconds per km as m:ss/km", () => {
    expect(fmtPace(300)).toBe("5:00/km");
    expect(fmtPace(90)).toBe("1:30/km");
  });
});

describe("fmtTimeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns just now within a minute", () => {
    expect(fmtTimeAgo("2025-06-01T11:59:30.000Z")).toBe("just now");
  });

  it("returns minutes ago under an hour", () => {
    expect(fmtTimeAgo("2025-06-01T11:30:00.000Z")).toBe("30m ago");
  });

  it("returns hours ago under a day", () => {
    expect(fmtTimeAgo("2025-06-01T06:00:00.000Z")).toBe("6h ago");
  });

  it("returns days ago within a week", () => {
    expect(fmtTimeAgo("2025-05-29T12:00:00.000Z")).toBe("3d ago");
  });
});

describe("getAthlete", () => {
  beforeEach(() => {
    initializeAppData(minimalAppData());
  });

  afterEach(() => {
    clearAppData();
  });

  it("returns the matching athlete", () => {
    expect(getAthlete("a1").name).toBe("Pat");
  });

  it("falls back to ME when id is unknown", () => {
    expect(getAthlete("nope").id).toBe("me");
  });
});

describe("mergeChallenges", () => {
  beforeEach(() => {
    initializeAppData(minimalAppData({ challenges: [challenge({ id: "c1", myProgressKm: 10 })] }));
  });

  afterEach(() => {
    clearAppData();
  });

  it("updates an existing challenge's progress in place", () => {
    mergeChallenges([challenge({ id: "c1", myProgressKm: 55, joined: true })]);

    expect(CHALLENGES).toHaveLength(1);
    expect(CHALLENGES[0].myProgressKm).toBe(55);
    expect(CHALLENGES[0].joined).toBe(true);
  });

  it("adds a challenge that wasn't already in the list", () => {
    mergeChallenges([challenge({ id: "c2", name: "Gran Fondo 100K" })]);

    expect(CHALLENGES.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("takeChallengeUpdates", () => {
  afterEach(() => {
    clearAppData();
  });

  it("returns updates stashed for the matching activity id, then clears them", () => {
    setLastChallengeUpdates("act-1", [challengeUpdate()]);

    expect(takeChallengeUpdates("act-1")).toHaveLength(1);
    expect(takeChallengeUpdates("act-1")).toEqual([]);
  });

  it("returns an empty array for a non-matching activity id", () => {
    setLastChallengeUpdates("act-1", [challengeUpdate()]);

    expect(takeChallengeUpdates("act-2")).toEqual([]);
  });

  it("stores nothing when there are no updates", () => {
    setLastChallengeUpdates("act-1", []);

    expect(takeChallengeUpdates("act-1")).toEqual([]);
  });

  it("includes both completed and in-progress updates", () => {
    setLastChallengeUpdates("act-1", [
      challengeUpdate({ id: "c1", completed: true, progressAfter: 100 }),
      challengeUpdate({ id: "c2", completed: false, progressAfter: 40 }),
    ]);

    const updates = takeChallengeUpdates("act-1");
    expect(updates.find((u) => u.id === "c1")?.completed).toBe(true);
    expect(updates.find((u) => u.id === "c2")?.completed).toBe(false);
  });
});
