import { describe, expect, it } from "vitest";
import { describeSyncProblem, syncStatusMessage, syncTone } from "./sync-copy";
import type { WorkoutSync } from "./workout-syncs";

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

describe("syncStatusMessage", () => {
  it("explains the first failure with its cause and reassurance", () => {
    expect(syncStatusMessage(sync())).toEqual({
      headline: "This workout didn't reach Stride from your Garmin Forerunner 265.",
      body: "Your watch lost its connection while sending this workout. Nothing is lost: your watch still has it.",
    });
  });

  it("points at the checklist after a failed retry", () => {
    const message = syncStatusMessage(sync({ attempts: 1 }));
    expect(message.headline).toBe("That didn't work yet.");
    expect(message.body).toContain("What to check");
  });

  it("doesn't reference a checklist that isn't shown", () => {
    const message = syncStatusMessage(sync({ attempts: 1, errorCode: "import_failed" }));
    expect(message.body).not.toContain("What to check");
  });

  it("offers manual entry once the sync is stuck", () => {
    const message = syncStatusMessage(sync({ status: "stuck", provider: "apple_health" }));
    expect(message.headline).toBe("This workout still isn't syncing.");
    expect(message.body).toBe(
      "Nothing is lost: your iPhone still has it. Add it manually so it counts this week.",
    );
  });
});

describe("describeSyncProblem", () => {
  it("uses the validated Apple Health permission copy", () => {
    const problem = describeSyncProblem(
      sync({ provider: "apple_health", errorCode: "source_permission_denied" }),
    );
    expect(problem.cause).toBe(
      "Stride couldn't read this workout from the Health app on your iPhone.",
    );
    expect(problem.steps[1]).toContain("Apps → Stride");
  });

  it("has no device checklist for server-side import failures", () => {
    expect(describeSyncProblem(sync({ errorCode: "import_failed" })).steps).toEqual([]);
  });

  it("falls back to generic copy for other devices", () => {
    expect(describeSyncProblem(sync({ provider: "other" })).cause).toBe(
      "Your device couldn't send this workout to Stride.",
    );
  });
});

describe("syncTone", () => {
  it("shows a syncing tone while a retry is in flight", () => {
    expect(syncTone(sync(), true)).toBe("syncing");
    expect(syncTone(sync({ status: "stuck" }), false)).toBe("stuck");
    expect(syncTone(sync(), false)).toBe("failed");
  });
});
