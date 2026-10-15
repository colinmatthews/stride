import { describe, expect, it } from "vitest";
import { parseRetentionAction } from "./retention-validation.js";

describe("parseRetentionAction", () => {
  it("accepts a logged check-in with a channel and message", () => {
    expect(
      parseRetentionAction({ action: "contacted", channel: "Email", message: "  Hi Maya  " }),
    ).toEqual({ ok: true, value: { action: "contacted", channel: "Email", message: "Hi Maya" } });
  });

  it("accepts snooze, reopen, and a dismissal with a known reason", () => {
    expect(parseRetentionAction({ action: "snoozed" }).ok).toBe(true);
    expect(parseRetentionAction({ action: "reopened" }).ok).toBe(true);
    expect(parseRetentionAction({ action: "dismissed", note: "Planned off-season" }).ok).toBe(true);
  });

  it("rejects unknown actions", () => {
    expect(parseRetentionAction({ action: "deleted" })).toEqual({
      ok: false,
      error: "action must be one of: contacted, snoozed, dismissed, reopened",
    });
    expect(parseRetentionAction(undefined).ok).toBe(false);
  });

  it("requires a non-empty message and a real channel for check-ins", () => {
    expect(parseRetentionAction({ action: "contacted", channel: "Email", message: "   " })).toEqual(
      { ok: false, error: "message: Message is required" },
    );
    expect(parseRetentionAction({ action: "contacted", channel: "SMS", message: "Hi" }).ok).toBe(
      false,
    );
  });

  it("only accepts the listed dismissal reasons", () => {
    expect(parseRetentionAction({ action: "dismissed", note: "whatever" }).ok).toBe(false);
    expect(parseRetentionAction({ action: "dismissed" }).ok).toBe(false);
  });
});
