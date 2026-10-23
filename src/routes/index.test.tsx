import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppData, initializeAppData, mergeActivities, type Activity } from "@/lib/mock-data";
import {
  getWorkoutSyncState,
  initializeWorkoutSyncs,
  showsSyncIssues,
  type WorkoutSync,
} from "@/lib/workout-syncs";

vi.mock("@posthog/react", () => ({ usePostHog: () => ({ capture: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  useRouterState: () => ({ location: { pathname: "/" } }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const me = {
  id: "me",
  name: "Pat Runner",
  handle: "pat",
  avatar: "https://example.com/pat.jpg",
  city: "Toronto",
  country: "CA",
  followers: 0,
  following: 0,
  bio: "",
};

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "act-1",
    athleteId: "me",
    sport: "Run",
    title: "Easy shakeout",
    date: "2026-10-11T06:30:00.000Z",
    distanceKm: 5,
    movingSeconds: 1800,
    elevationM: 10,
    kudos: 0,
    comments: [],
    achievements: 0,
    routeSeed: 1,
    ...overrides,
  };
}

const failed: WorkoutSync = {
  id: "sync-1",
  ref: "SYNC-ABC234",
  provider: "garmin",
  deviceName: "Garmin Forerunner 265",
  sport: "Run",
  title: "Morning tempo",
  startedAt: "2026-10-12T06:30:00.000Z",
  status: "failed",
  errorCode: "upload_interrupted",
  attempts: 0,
};

async function renderFeed() {
  const { Route } = await import("./index");
  const Feed = (Route as unknown as { component: ComponentType }).component;
  return renderToStaticMarkup(<Feed />);
}

beforeEach(() => {
  initializeAppData({
    me,
    athletes: [me],
    activities: [activity()],
    segments: [],
    clubs: [],
    challenges: [],
  });
});

afterEach(() => {
  initializeWorkoutSyncs([]);
  clearAppData();
});

describe("feed", () => {
  it("puts unsynced workouts above the athlete's activities", async () => {
    initializeWorkoutSyncs([failed]);
    const html = await renderFeed();

    expect(html).toContain("Morning tempo");
    expect(html).toContain("Retry sync");
    expect(html.indexOf("Morning tempo")).toBeLessThan(html.indexOf("Easy shakeout"));
  });

  it("shows no sync cards when nothing failed", async () => {
    const html = await renderFeed();
    expect(html).toContain("Easy shakeout");
    expect(html).not.toContain("Retry sync");
  });

  it("marks a workout recovered this session", async () => {
    const recovered = activity({
      id: "act-2",
      title: "Morning tempo",
      date: "2026-10-12T06:30:00.000Z",
    });
    mergeActivities([recovered]);
    initializeWorkoutSyncs([]);
    (getWorkoutSyncState().recentlySynced as Map<string, WorkoutSync>).set("act-2", {
      ...failed,
      status: "synced",
      activityId: "act-2",
    });

    const html = await renderFeed();
    expect(html).toContain("Synced from Garmin Forerunner 265 · just now");
  });

  it("keeps sync cards out of the Clubs filter", () => {
    expect(showsSyncIssues("Following")).toBe(true);
    expect(showsSyncIssues("You")).toBe(true);
    expect(showsSyncIssues("Clubs")).toBe(false);
  });
});
