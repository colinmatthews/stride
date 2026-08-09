import { describe, expect, it } from "vitest";
import { daysUntil, dismissStorageKey, shouldShowChallengeNudge } from "./challenge";

describe("daysUntil", () => {
  it("rounds up partial days remaining", () => {
    expect(daysUntil("2026-04-30", new Date("2026-04-28T09:00:00.000Z"))).toBe(3);
  });

  it("returns 0 on the closing day itself", () => {
    expect(daysUntil("2026-04-30", new Date("2026-04-30T20:00:00.000Z"))).toBe(1);
    expect(daysUntil("2026-04-30", new Date("2026-04-30T23:59:59.999Z"))).toBe(0);
  });

  it("never goes negative once the challenge has closed", () => {
    expect(daysUntil("2026-04-30", new Date("2026-05-15T00:00:00.000Z"))).toBe(0);
  });
});

describe("dismissStorageKey", () => {
  it("namespaces by user and challenge so accounts don't bleed into each other", () => {
    expect(dismissStorageKey("me", "ch1")).toBe("challenge-nudge-dismissed:me:ch1");
    expect(dismissStorageKey("me", "ch2")).not.toBe(dismissStorageKey("other", "ch2"));
  });
});

describe("shouldShowChallengeNudge", () => {
  it("shows when never dismissed", () => {
    expect(shouldShowChallengeNudge(null, new Date("2026-04-28T09:00:00.000Z"))).toBe(true);
  });

  it("stays hidden for the rest of the same calendar day", () => {
    const dismissedAt = "2026-04-28T09:00:00.000Z";
    const laterSameDay = new Date("2026-04-28T22:00:00.000Z");
    expect(shouldShowChallengeNudge(dismissedAt, laterSameDay)).toBe(false);
  });

  it("resurfaces on the next calendar day", () => {
    const dismissedAt = "2026-04-28T09:00:00.000Z";
    const nextDay = new Date("2026-04-29T00:00:01.000Z");
    expect(shouldShowChallengeNudge(dismissedAt, nextDay)).toBe(true);
  });

  it("shows again if the stored value is unparsable", () => {
    expect(shouldShowChallengeNudge("not-a-date", new Date("2026-04-28T09:00:00.000Z"))).toBe(true);
  });
});
