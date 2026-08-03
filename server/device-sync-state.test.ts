import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  STALE_PENDING_MS,
  canRetry,
  failureState,
  isStuck,
  isSyncStatus,
  isTerminal,
  retryState,
  startState,
  successState,
  type DeviceSyncState,
} from "./device-sync-state.js";

const NOW = new Date("2026-08-03T12:00:00.000Z");

function state(overrides: Partial<DeviceSyncState> = {}): DeviceSyncState {
  return {
    status: "pending",
    attemptCount: 1,
    failureReason: null,
    activityId: null,
    ...overrides,
  };
}

function agoMs(ms: number) {
  return new Date(NOW.getTime() - ms);
}

describe("isSyncStatus", () => {
  it("accepts the three real statuses", () => {
    expect(isSyncStatus("pending")).toBe(true);
    expect(isSyncStatus("synced")).toBe(true);
    expect(isSyncStatus("failed")).toBe(true);
  });

  it("rejects anything else, including near-misses from a bad db row", () => {
    expect(isSyncStatus("Pending")).toBe(false);
    expect(isSyncStatus("")).toBe(false);
    expect(isSyncStatus(null)).toBe(false);
    expect(isSyncStatus(undefined)).toBe(false);
  });
});

describe("transitions", () => {
  it("starts pending on attempt 1, not 0", () => {
    expect(startState()).toEqual({
      status: "pending",
      attemptCount: 1,
      failureReason: null,
      activityId: null,
    });
  });

  it("increments the attempt count and clears the previous reason on retry", () => {
    const next = retryState(state({ status: "failed", attemptCount: 2, failureReason: "timeout" }));

    expect(next.status).toBe("pending");
    expect(next.attemptCount).toBe(3);
    expect(next.failureReason).toBeNull();
  });

  it("records the imported activity on success", () => {
    const next = successState(state({ attemptCount: 2 }), "act-123");

    expect(next).toEqual({
      status: "synced",
      attemptCount: 2,
      failureReason: null,
      activityId: "act-123",
    });
  });

  it("keeps the failure reason so the athlete is never shown a blank error", () => {
    const next = failureState(state(), "Connect IQ authorization timed out");

    expect(next.status).toBe("failed");
    expect(next.failureReason).toBe("Connect IQ authorization timed out");
  });

  it("substitutes a reason when the importer throws an empty message", () => {
    expect(failureState(state(), "").failureReason).toBe(
      "The import failed for an unknown reason.",
    );
    expect(failureState(state(), "   ").failureReason).toBe(
      "The import failed for an unknown reason.",
    );
  });

  it("treats synced and failed as terminal, pending as not", () => {
    expect(isTerminal(state({ status: "synced" }))).toBe(true);
    expect(isTerminal(state({ status: "failed" }))).toBe(true);
    expect(isTerminal(state({ status: "pending" }))).toBe(false);
  });
});

describe("isStuck", () => {
  it("is false for a pending sync still inside the window", () => {
    expect(isStuck(state(), agoMs(STALE_PENDING_MS - 1000), NOW)).toBe(false);
  });

  it("is true once a pending sync passes the window", () => {
    expect(isStuck(state(), agoMs(STALE_PENDING_MS), NOW)).toBe(true);
    expect(isStuck(state(), agoMs(STALE_PENDING_MS + 60_000), NOW)).toBe(true);
  });

  it("never reports a terminal sync as stuck, however old", () => {
    const old = agoMs(STALE_PENDING_MS * 100);

    expect(isStuck(state({ status: "synced" }), old, NOW)).toBe(false);
    expect(isStuck(state({ status: "failed" }), old, NOW)).toBe(false);
  });
});

describe("canRetry", () => {
  it("allows retrying a failed sync", () => {
    expect(canRetry(state({ status: "failed" }), agoMs(1000), NOW)).toBe(true);
  });

  it("allows retrying a pending sync that has gone stale", () => {
    expect(canRetry(state(), agoMs(STALE_PENDING_MS + 1), NOW)).toBe(true);
  });

  it("refuses while a sync is genuinely in flight", () => {
    expect(canRetry(state(), agoMs(1000), NOW)).toBe(false);
  });

  it("refuses once synced, so a retry cannot duplicate the activity", () => {
    expect(canRetry(state({ status: "synced", activityId: "act-1" }), agoMs(1000), NOW)).toBe(
      false,
    );
  });

  it("refuses after the attempt ceiling, even for a failed sync", () => {
    expect(
      canRetry(state({ status: "failed", attemptCount: MAX_ATTEMPTS }), agoMs(1000), NOW),
    ).toBe(false);
    expect(
      canRetry(state({ status: "failed", attemptCount: MAX_ATTEMPTS + 3 }), agoMs(1000), NOW),
    ).toBe(false);
  });

  it("still allows the final attempt just below the ceiling", () => {
    expect(
      canRetry(state({ status: "failed", attemptCount: MAX_ATTEMPTS - 1 }), agoMs(1000), NOW),
    ).toBe(true);
  });
});

describe("retry loop", () => {
  it("walks failure → retry → failure up to the ceiling, then stops offering retry", () => {
    let current = startState();
    let attempts = 1;

    current = failureState(current, "provider down");

    while (canRetry(current, agoMs(1000), NOW)) {
      current = retryState(current);
      attempts += 1;
      current = failureState(current, "provider down");
    }

    expect(attempts).toBe(MAX_ATTEMPTS);
    expect(current.status).toBe("failed");
    expect(current.attemptCount).toBe(MAX_ATTEMPTS);
  });

  it("can recover on a later attempt", () => {
    const failed = failureState(startState(), "provider down");
    const retried = retryState(failed);
    const synced = successState(retried, "act-9");

    expect(synced.status).toBe("synced");
    expect(synced.attemptCount).toBe(2);
    expect(synced.failureReason).toBeNull();
    expect(canRetry(synced, agoMs(1000), NOW)).toBe(false);
  });
});
