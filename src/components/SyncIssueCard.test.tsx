import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppData, initializeAppData } from "@/lib/mock-data";
import { initializeWorkoutSyncs, type WorkoutSync } from "@/lib/workout-syncs";
import { SyncIssueCard } from "./SyncIssueCard";

vi.mock("@posthog/react", () => ({ usePostHog: () => ({ capture: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

function sync(overrides: Partial<WorkoutSync> = {}): WorkoutSync {
  return {
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
    ...overrides,
  };
}

function render(entry: WorkoutSync) {
  initializeWorkoutSyncs([entry]);
  return renderToStaticMarkup(<SyncIssueCard sync={entry} />);
}

beforeEach(() => {
  initializeAppData({
    me: {
      id: "me",
      name: "Pat Runner",
      handle: "pat",
      avatar: "https://example.com/pat.jpg",
      city: "Toronto",
      country: "CA",
      followers: 0,
      following: 0,
      bio: "",
    },
    athletes: [],
    activities: [],
    segments: [],
    clubs: [],
    challenges: [],
  });
});

afterEach(() => {
  initializeWorkoutSyncs([]);
  clearAppData();
});

describe("SyncIssueCard", () => {
  it("shows the error, a retry button and the team reference on first failure", () => {
    const html = render(sync());

    expect(html).toContain("Morning tempo");
    expect(html).toContain("Didn&#x27;t sync");
    expect(html).toContain(
      "This workout didn&#x27;t reach Stride from your Garmin Forerunner 265.",
    );
    expect(html).toContain("Retry sync");
    expect(html).toContain("What to check");
    expect(html).toContain("We&#x27;ve let the Stride team know.");
    expect(html).toContain("Ref SYNC-ABC234");
    expect(html).not.toContain("Add it manually");
  });

  it("relabels the button after a failed retry", () => {
    const html = render(sync({ attempts: 1 }));
    expect(html).toContain("Try again");
    expect(html).not.toContain("Retry sync");
  });

  it("hides the checklist when there are no device steps", () => {
    expect(render(sync({ errorCode: "import_failed" }))).not.toContain("What to check");
  });

  it("swaps retry for manual entry once stuck", () => {
    const html = render(sync({ status: "stuck", attempts: 2 }));

    expect(html).toContain("Still not syncing");
    expect(html).toContain('href="/record"');
    expect(html).toContain("Add it manually");
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("Contact support");
    expect(html).toContain("Ref SYNC-ABC234");
  });
});
