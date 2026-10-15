import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITIES, clearAppData, type Activity } from "./mock-data";
import {
  getWorkoutSyncState,
  initializeWorkoutSyncs,
  retryWorkoutSync,
  type WorkoutSync,
} from "./workout-syncs";

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
    errorCode: "import_failed",
    attempts: 0,
    ...overrides,
  };
}

const activity: Activity = {
  id: "act-1",
  athleteId: "me",
  sport: "Run",
  title: "Morning tempo",
  date: "2026-10-12T06:30:00.000Z",
  distanceKm: 10,
  movingSeconds: 3000,
  elevationM: 50,
  kudos: 0,
  comments: [],
  achievements: 0,
  routeSeed: 1,
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  initializeWorkoutSyncs([sync()]);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  initializeWorkoutSyncs([]);
  clearAppData();
});

describe("retryWorkoutSync", () => {
  it("moves a recovered workout into the feed", async () => {
    const synced = sync({ status: "synced", attempts: 1, activityId: "act-1", errorCode: null });
    fetchMock.mockResolvedValueOnce(respond(200, { sync: synced, activity }));

    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "synced", sync: synced });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/syncs/sync-1/retry",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    const state = getWorkoutSyncState();
    expect(state.syncs).toEqual([]);
    expect(state.recentlySynced.get("act-1")).toEqual(synced);
    expect(ACTIVITIES.map((entry) => entry.id)).toContain("act-1");
  });

  it("keeps a still-failing workout with the updated attempt count", async () => {
    const failed = sync({ attempts: 1 });
    fetchMock.mockResolvedValueOnce(respond(200, { sync: failed }));

    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "failed", sync: failed });
    expect(getWorkoutSyncState().syncs).toEqual([failed]);
  });

  it("marks the sync pending while in flight and ignores double clicks", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((done) => (resolve = done)));

    const first = retryWorkoutSync("sync-1");
    expect(getWorkoutSyncState().pendingIds.has("sync-1")).toBe(true);
    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "skipped" });

    resolve(respond(200, { sync: sync({ attempts: 1 }) }));
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getWorkoutSyncState().pendingIds.has("sync-1")).toBe(false);
  });

  it("adopts the server state when the retry limit was already reached", async () => {
    const stuck = sync({ status: "stuck", attempts: 2 });
    fetchMock.mockResolvedValueOnce(respond(409, { error: "Retry limit reached", sync: stuck }));

    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "failed", sync: stuck });
    expect(getWorkoutSyncState().syncs).toEqual([stuck]);
  });

  it("drops a sync the server no longer knows about", async () => {
    fetchMock.mockResolvedValueOnce(respond(404, { error: "Sync not found" }));

    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "gone" });
    expect(getWorkoutSyncState().syncs).toEqual([]);
  });

  it("leaves the sync untouched when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "error" });
    expect(getWorkoutSyncState().syncs).toEqual([sync()]);
    expect(getWorkoutSyncState().pendingIds.size).toBe(0);
  });

  it("does not retry a stuck sync", async () => {
    initializeWorkoutSyncs([sync({ status: "stuck", attempts: 2 })]);

    await expect(retryWorkoutSync("sync-1")).resolves.toEqual({ kind: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
