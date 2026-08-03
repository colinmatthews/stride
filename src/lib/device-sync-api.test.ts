import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchDeviceSync, retryDeviceSync, startDeviceSync } from "./api";
import { ACTIVITIES } from "./mock-data";

// Only the transport is stubbed — the payloads below mirror what the real
// /api/device-sync routes return.
function respondWith(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

const SYNCED_PAYLOAD = {
  sync: {
    status: "synced",
    attemptCount: 2,
    failureReason: null,
    activityId: "act-sync-1",
    deviceName: "Garmin Forerunner 965",
    startedAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T12:00:04.000Z",
    canRetry: false,
    stuck: false,
  },
  activity: {
    id: "act-sync-1",
    athleteId: "me",
    sport: "Run",
    title: "Morning shakeout",
    date: "2026-08-03T12:00:00.000Z",
    distanceKm: 5.14,
    movingSeconds: 1584,
    elevationM: 62,
    kudos: 0,
    comments: [],
    achievements: 0,
    routeSeed: 42,
  },
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  const index = ACTIVITIES.findIndex((entry) => entry.id === "act-sync-1");
  if (index >= 0) ACTIVITIES.splice(index, 1);
  vi.restoreAllMocks();
});

describe("fetchDeviceSync", () => {
  it("returns a null sync for an athlete who has not connected a device", async () => {
    globalThis.fetch = respondWith({ sync: null, activity: null });

    await expect(fetchDeviceSync()).resolves.toEqual({ sync: null, activity: null });
  });

  it("sends credentials so the session cookie authenticates the request", async () => {
    const spy = respondWith({ sync: null, activity: null });
    globalThis.fetch = spy;

    await fetchDeviceSync();

    expect(spy).toHaveBeenCalledWith(
      "/api/device-sync",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("surfaces a 401 as an ApiError rather than resolving empty", async () => {
    globalThis.fetch = respondWith({ error: "Authentication required" }, 401);

    await expect(fetchDeviceSync()).rejects.toBeInstanceOf(ApiError);
    await expect(fetchDeviceSync()).rejects.toMatchObject({
      status: 401,
      message: "Authentication required",
    });
  });
});

describe("startDeviceSync", () => {
  it("posts the device name", async () => {
    const spy = respondWith({ sync: null, activity: null }, 201);
    globalThis.fetch = spy;

    await startDeviceSync("Wahoo ELEMNT");

    expect(spy).toHaveBeenCalledWith(
      "/api/device-sync",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ deviceName: "Wahoo ELEMNT" }),
      }),
    );
  });

  it("merges a synced activity into the local store so the feed shows it", async () => {
    globalThis.fetch = respondWith(SYNCED_PAYLOAD, 201);

    const payload = await startDeviceSync("Garmin Forerunner 965");

    expect(payload.sync?.status).toBe("synced");
    expect(ACTIVITIES.some((entry) => entry.id === "act-sync-1")).toBe(true);
  });

  it("propagates the failure reason from a failed sync payload", async () => {
    globalThis.fetch = respondWith(
      {
        sync: {
          ...SYNCED_PAYLOAD.sync,
          status: "failed",
          activityId: null,
          failureReason: "Connect IQ authorization timed out",
          canRetry: true,
        },
        activity: null,
      },
      201,
    );

    const payload = await startDeviceSync("Garmin Forerunner 965");

    expect(payload.sync).toMatchObject({
      status: "failed",
      failureReason: "Connect IQ authorization timed out",
      canRetry: true,
    });
    expect(payload.activity).toBeNull();
  });
});

describe("retryDeviceSync", () => {
  it("posts to the retry route with no body", async () => {
    const spy = respondWith({ sync: null, activity: null });
    globalThis.fetch = spy;

    await retryDeviceSync();

    expect(spy).toHaveBeenCalledWith(
      "/api/device-sync/retry",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces the 409 when the athlete has already synced", async () => {
    globalThis.fetch = respondWith({ error: "This device has already synced" }, 409);

    await expect(retryDeviceSync()).rejects.toMatchObject({
      status: 409,
      message: "This device has already synced",
    });
  });

  it("surfaces the 429 once attempts are exhausted", async () => {
    globalThis.fetch = respondWith({ error: "Too many sync attempts. Contact support." }, 429);

    await expect(retryDeviceSync()).rejects.toMatchObject({ status: 429 });
  });
});
