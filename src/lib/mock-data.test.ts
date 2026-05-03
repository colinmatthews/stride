import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAppData,
  fmtDuration,
  fmtPace,
  fmtTimeAgo,
  getAthlete,
  initializeAppData,
  type Athlete,
  type AppData,
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
