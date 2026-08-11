import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  buildPreferencesDto,
  decodeNotificationCursor,
  encodeNotificationCursor,
  isNotificationKind,
  mergePreferences,
  resolveDelivery,
  resolveNotificationTarget,
  selectNextCursor,
} from "./catalog.js";

describe("isNotificationKind", () => {
  it("accepts every shipped kind", () => {
    expect(isNotificationKind("kudos")).toBe(true);
    expect(isNotificationKind("system")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isNotificationKind("sms")).toBe(false);
    expect(isNotificationKind(undefined)).toBe(false);
  });
});

describe("mergePreferences", () => {
  it("falls back to defaults for kinds with no stored row", () => {
    const merged = mergePreferences([]);

    expect(merged).toEqual(DEFAULT_PREFERENCES);
  });

  it("lets a stored row override its default", () => {
    const merged = mergePreferences([{ kind: "kudos", push: false, email: true }]);

    expect(merged.kudos).toEqual({ push: false, email: true });
    // Untouched kinds keep their defaults.
    expect(merged.comment).toEqual(DEFAULT_PREFERENCES.comment);
  });

  it("ignores stored rows for kinds that no longer exist", () => {
    const merged = mergePreferences([{ kind: "retired-kind", push: true, email: true }]);

    expect(merged).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("resolveDelivery", () => {
  const preferences = mergePreferences([{ kind: "kudos", push: true, email: true }]);

  it("ships on channels enabled at both levels", () => {
    expect(
      resolveDelivery({
        kind: "kudos",
        channelSettings: { push: true, email: true },
        preferences,
      }),
    ).toEqual(["push", "email"]);
  });

  it("suppresses a channel whose master is off regardless of the per-type setting", () => {
    expect(
      resolveDelivery({
        kind: "kudos",
        channelSettings: { push: false, email: true },
        preferences,
      }),
    ).toEqual(["email"]);
  });

  it("suppresses a channel the type has opted out of", () => {
    expect(
      resolveDelivery({
        kind: "segment",
        channelSettings: { push: true, email: true },
        preferences,
      }),
    ).toEqual([]);
  });

  it("never reports email for an account with no address on file", () => {
    expect(
      resolveDelivery({
        kind: "kudos",
        channelSettings: { push: true, email: true },
        preferences,
        hasEmail: false,
      }),
    ).toEqual(["push"]);
  });
});

describe("buildPreferencesDto", () => {
  it("names the email destination when the account has an address", () => {
    const dto = buildPreferencesDto({
      email: "pat@example.com",
      channelSettings: { push: true, email: false },
      preferences: mergePreferences([]),
    });

    expect(dto.channels.find((channel) => channel.key === "email")).toMatchObject({
      description: "Sent to pat@example.com.",
      enabled: false,
    });
    expect(dto.categories).toHaveLength(7);
  });

  it("explains the gap when the account has no address", () => {
    const dto = buildPreferencesDto({
      email: null,
      channelSettings: { push: true, email: true },
      preferences: mergePreferences([]),
    });
    const email = dto.channels.find((channel) => channel.key === "email");

    expect(email?.description).toBe("Add an email address to enable.");
    // The switch must agree with the copy rather than showing "on" for a
    // channel that cannot deliver.
    expect(email?.enabled).toBe(false);
  });
});

describe("resolveNotificationTarget", () => {
  const empty = {
    activityId: null,
    clubId: null,
    challengeId: null,
    segmentId: null,
    targetUserId: null,
  };

  it("sends kudos and comments to the activity", () => {
    expect(resolveNotificationTarget({ ...empty, kind: "kudos", activityId: "act-1" })).toEqual({
      type: "activity",
      id: "act-1",
    });
    expect(resolveNotificationTarget({ ...empty, kind: "comment", activityId: "act-1" })).toEqual({
      type: "activity",
      id: "act-1",
    });
  });

  it("sends a follow to the follower's profile", () => {
    expect(resolveNotificationTarget({ ...empty, kind: "follow", targetUserId: "u-9" })).toEqual({
      type: "athlete",
      id: "u-9",
    });
  });

  it("sends a club notification to the club", () => {
    expect(resolveNotificationTarget({ ...empty, kind: "club", clubId: "club-1" })).toEqual({
      type: "club",
      id: "club-1",
    });
  });

  it("prefers the segment over the activity for a KOM row", () => {
    // KOM rows carry both. The title names the segment, so generic FK precedence
    // would send this to the wrong screen.
    expect(
      resolveNotificationTarget({
        ...empty,
        kind: "segment",
        segmentId: "seg-1",
        activityId: "act-1",
      }),
    ).toEqual({ type: "segment", id: "seg-1" });
  });

  it("falls back to the activity when a segment row has no segment", () => {
    expect(resolveNotificationTarget({ ...empty, kind: "segment", activityId: "act-1" })).toEqual({
      type: "activity",
      id: "act-1",
    });
  });

  it("sends challenges to the list and recaps to the training log, with no id", () => {
    expect(resolveNotificationTarget({ ...empty, kind: "challenge", challengeId: "ch-1" })).toEqual(
      { type: "challenge" },
    );
    expect(resolveNotificationTarget({ ...empty, kind: "system" })).toEqual({ type: "training" });
  });

  it("returns undefined when the expected reference is missing", () => {
    // Degrades to a plain, non-clickable row rather than a link to /activity/undefined.
    expect(resolveNotificationTarget({ ...empty, kind: "kudos" })).toBeUndefined();
    expect(resolveNotificationTarget({ ...empty, kind: "follow" })).toBeUndefined();
    expect(resolveNotificationTarget({ ...empty, kind: "club" })).toBeUndefined();
  });
});

describe("notification cursor", () => {
  it("round trips a (createdAt, id) pair", () => {
    const createdAt = new Date("2026-08-01T12:00:00.000Z");
    const decoded = decodeNotificationCursor(encodeNotificationCursor({ createdAt, id: "ntf-1" }));

    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(decoded?.id).toBe("ntf-1");
  });

  it("keeps ids containing the separator intact", () => {
    // Ids are composed from entity ids, so defensive: split on the LAST pipe.
    const createdAt = new Date("2026-08-01T12:00:00.000Z");
    const decoded = decodeNotificationCursor(`${createdAt.toISOString()}|ntf-kudos-act-1-u-2`);

    expect(decoded?.id).toBe("ntf-kudos-act-1-u-2");
  });

  it("points at the last row of the page, not the overfetched row", () => {
    // Regression guard: the page query filters on a strict `<`, so a cursor
    // pointing at the overfetched row skips that row and loses one notification
    // per page boundary. Rows here all share a createdAt, which is what the
    // demo backfill produces and what makes the id tiebreaker load-bearing.
    const createdAt = new Date("2026-07-15T12:00:00.000Z");
    const rows = ["ntf-5", "ntf-4", "ntf-3"].map((id) => ({ createdAt, id }));

    // limit 2, so ntf-3 is the overfetched row and ntf-4 ends the page.
    expect(selectNextCursor(rows, 2)).toBe(encodeNotificationCursor({ createdAt, id: "ntf-4" }));
  });

  it("returns no cursor when the result set did not overfetch", () => {
    const createdAt = new Date("2026-07-15T12:00:00.000Z");

    expect(selectNextCursor([{ createdAt, id: "ntf-1" }], 2)).toBeUndefined();
    expect(selectNextCursor([], 2)).toBeUndefined();
  });

  it("rejects malformed cursors instead of paging from epoch", () => {
    expect(decodeNotificationCursor("")).toBeNull();
    expect(decodeNotificationCursor("not-a-date|ntf-1")).toBeNull();
    expect(decodeNotificationCursor("2026-08-01T12:00:00.000Z")).toBeNull();
    expect(decodeNotificationCursor("2026-08-01T12:00:00.000Z|")).toBeNull();
    expect(decodeNotificationCursor(undefined)).toBeNull();
  });
});
