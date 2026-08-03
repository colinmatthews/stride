import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATIONS,
  NOTIFICATIONS_UNREAD,
  clearAppData,
  fmtDuration,
  fmtPace,
  fmtTimeAgo,
  getAthlete,
  initializeAppData,
  mergeNotifications,
  type Athlete,
  type AppData,
  type AppNotification,
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

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "ntf-1",
    kind: "kudos",
    actorId: "a1",
    title: "Pat gave you kudos",
    body: "On your activity “Morning run”.",
    date: "2025-06-01T10:00:00.000Z",
    read: false,
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
    notifications: [],
    notificationsUnread: 0,
    notificationPreferences: { channels: [], categories: [] },
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

describe("notification store", () => {
  afterEach(() => {
    clearAppData();
  });

  it("hydrates notifications and the unread count from bootstrap", () => {
    initializeAppData(
      minimalAppData({
        notifications: [notification()],
        notificationsUnread: 1,
      }),
    );

    expect(NOTIFICATIONS).toHaveLength(1);
    expect(NOTIFICATIONS_UNREAD).toBe(1);
  });

  it("clears notifications on logout so they cannot leak across sessions", () => {
    initializeAppData(
      minimalAppData({
        notifications: [notification()],
        notificationsUnread: 1,
        notificationsNextCursor: "2025-06-01T10:00:00.000Z|ntf-1",
      }),
    );

    clearAppData();

    expect(NOTIFICATIONS).toEqual([]);
    expect(NOTIFICATIONS_UNREAD).toBe(0);
  });

  it("merges pages by id and keeps newest first", () => {
    initializeAppData(minimalAppData({ notifications: [notification()] }));

    mergeNotifications([
      notification({ id: "ntf-1", read: true }),
      notification({ id: "ntf-2", date: "2025-06-02T10:00:00.000Z" }),
    ]);

    expect(NOTIFICATIONS.map((entry) => entry.id)).toEqual(["ntf-2", "ntf-1"]);
    expect(NOTIFICATIONS.find((entry) => entry.id === "ntf-1")?.read).toBe(true);
  });
});
