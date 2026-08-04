import { describe, expect, it } from "vitest";
import {
  isNotificationFrequency,
  isNotificationType,
  parseNotificationUpdates,
} from "./notification-preferences.js";

describe("isNotificationType", () => {
  it("accepts known types", () => {
    expect(isNotificationType("kudos")).toBe(true);
    expect(isNotificationType("follow")).toBe(true);
    expect(isNotificationType("challenge")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isNotificationType("push")).toBe(false);
    expect(isNotificationType(undefined)).toBe(false);
  });
});

describe("isNotificationFrequency", () => {
  it("accepts known frequencies", () => {
    for (const value of ["instant", "daily", "weekly", "off"]) {
      expect(isNotificationFrequency(value)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isNotificationFrequency("hourly")).toBe(false);
    expect(isNotificationFrequency(null)).toBe(false);
  });
});

describe("parseNotificationUpdates", () => {
  it("accepts a valid partial update", () => {
    expect(parseNotificationUpdates({ kudos: "off" })).toEqual({
      ok: true,
      updates: { kudos: "off" },
    });
  });

  it("accepts multiple valid keys", () => {
    expect(parseNotificationUpdates({ kudos: "off", follow: "weekly" })).toEqual({
      ok: true,
      updates: { kudos: "off", follow: "weekly" },
    });
  });

  it("accepts an empty object", () => {
    expect(parseNotificationUpdates({})).toEqual({ ok: true, updates: {} });
  });

  it("rejects an unknown notification type", () => {
    const result = parseNotificationUpdates({ push: "instant" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid frequency", () => {
    const result = parseNotificationUpdates({ kudos: "hourly" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(parseNotificationUpdates(null).ok).toBe(false);
    expect(parseNotificationUpdates("nope").ok).toBe(false);
    expect(parseNotificationUpdates([1, 2, 3]).ok).toBe(false);
  });
});
