import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAppData,
  fmtDuration,
  fmtPace,
  fmtTimeAgo,
  getActivityPhoto,
  getAthlete,
  getSyncFailure,
  initializeAppData,
  removeSyncFailure,
  type Athlete,
  type AppData,
  type SyncFailure,
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

// STR-27: a device attempted to sync and failed to deliver an activity.
function syncFailure(overrides: Partial<SyncFailure> = {}): SyncFailure {
  return {
    id: "fail-1",
    athleteId: "me",
    deviceName: "Forerunner 955",
    deviceType: "watch",
    attemptedAt: "2025-06-01T09:00:00.000Z",
    sportGuess: "Run",
    gpsPointsCaptured: 0,
    reason: "Connection dropped mid-sync",
    ...overrides,
  };
}

function minimalAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    me: athlete({ id: "me", name: "Me" }),
    athletes: [athlete({ id: "a1", name: "Pat" })],
    activities: [],
    syncFailures: [],
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

// STR-27: sync-failure recovery — a device sync that failed to deliver an
// activity is surfaced in the feed until the athlete resolves it manually.
describe("getSyncFailure", () => {
  beforeEach(() => {
    initializeAppData(
      minimalAppData({
        syncFailures: [syncFailure({ id: "fail-1" }), syncFailure({ id: "fail-2" })],
      }),
    );
  });

  afterEach(() => {
    clearAppData();
  });

  it("returns the matching sync failure", () => {
    expect(getSyncFailure("fail-2")?.deviceName).toBe("Forerunner 955");
  });

  it("returns undefined when the id is unknown", () => {
    expect(getSyncFailure("nope")).toBeUndefined();
  });
});

describe("removeSyncFailure", () => {
  beforeEach(() => {
    initializeAppData(
      minimalAppData({
        syncFailures: [syncFailure({ id: "fail-1" }), syncFailure({ id: "fail-2" })],
      }),
    );
  });

  afterEach(() => {
    clearAppData();
  });

  it("drops only the resolved failure", () => {
    removeSyncFailure("fail-1");

    expect(getSyncFailure("fail-1")).toBeUndefined();
    expect(getSyncFailure("fail-2")).toBeDefined();
  });

  it("is a no-op when the id doesn't match anything", () => {
    removeSyncFailure("nope");

    expect(getSyncFailure("fail-1")).toBeDefined();
    expect(getSyncFailure("fail-2")).toBeDefined();
  });
});

describe("getActivityPhoto", () => {
  it("picks a deterministic photo when routeSeed is set", () => {
    const a = getActivityPhoto({ sport: "Run", routeSeed: 3 });
    const b = getActivityPhoto({ sport: "Run", routeSeed: 3 });

    expect(a).toBe(b);
  });

  // A recovered sync failure filled in with no GPS data has no routeSeed —
  // this must not throw despite the field being optional.
  it("falls back to a stable photo when routeSeed is undefined", () => {
    expect(() => getActivityPhoto({ sport: "Run", routeSeed: undefined })).not.toThrow();
    expect(getActivityPhoto({ sport: "Run", routeSeed: undefined })).toBe(
      getActivityPhoto({ sport: "Run", routeSeed: undefined }),
    );
  });
});
