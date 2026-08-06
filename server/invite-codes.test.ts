import { describe, expect, it } from "vitest";
import {
  buildInviteMessage,
  encodeInviteCode,
  formatDuration,
  generateInviteCode,
  inviteExpiryFrom,
  inviteState,
  inviteUrl,
  isEditedClaim,
} from "./invite-codes.js";

describe("encodeInviteCode", () => {
  it("maps every byte onto the code alphabet", () => {
    expect(encodeInviteCode(Uint8Array.from([0, 1, 9, 10]))).toBe("019A");
  });

  it("never emits the ambiguous characters I, L, O or U", () => {
    // Every byte value, so this covers the whole reachable output space.
    const everyByte = Uint8Array.from({ length: 256 }, (_, index) => index);

    expect(encodeInviteCode(everyByte)).not.toMatch(/[ILOU]/);
  });

  it("wraps bytes larger than the alphabet back into range", () => {
    // 32 is the alphabet length, so byte 32 must encode the same as byte 0.
    expect(encodeInviteCode(Uint8Array.from([32]))).toBe(encodeInviteCode(Uint8Array.from([0])));
  });
});

describe("generateInviteCode", () => {
  it("returns a 10 character code", () => {
    expect(generateInviteCode()).toHaveLength(10);
  });

  it("does not repeat across calls", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));

    expect(codes.size).toBe(200);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");

  it("is open before the expiry date", () => {
    const state = inviteState(
      { expiresAt: new Date("2026-08-07T12:00:00.000Z"), revokedAt: null },
      now,
    );

    expect(state).toBe("open");
  });

  it("is expired once the expiry date passes", () => {
    const state = inviteState(
      { expiresAt: new Date("2026-08-05T12:00:00.000Z"), revokedAt: null },
      now,
    );

    expect(state).toBe("expired");
  });

  it("treats the exact expiry instant as expired", () => {
    expect(inviteState({ expiresAt: now, revokedAt: null }, now)).toBe("expired");
  });

  it("reports revoked ahead of expired", () => {
    const state = inviteState(
      { expiresAt: new Date("2026-08-05T12:00:00.000Z"), revokedAt: new Date() },
      now,
    );

    expect(state).toBe("revoked");
  });
});

describe("inviteExpiryFrom", () => {
  it("expires 30 days out", () => {
    const expiry = inviteExpiryFrom(new Date("2026-08-06T12:00:00.000Z"));

    expect(expiry.toISOString()).toBe("2026-09-05T12:00:00.000Z");
  });
});

describe("isEditedClaim", () => {
  const source = { distanceKm: 63.63, movingSeconds: 8441, elevationM: 813 };

  it("is false when the claimer changed nothing", () => {
    expect(isEditedClaim(source, { ...source })).toBe(false);
  });

  it("is true when distance changes", () => {
    expect(isEditedClaim(source, { ...source, distanceKm: 58.4 })).toBe(true);
  });

  it("is true when duration changes", () => {
    expect(isEditedClaim(source, { ...source, movingSeconds: 8000 })).toBe(true);
  });

  it("is true when elevation changes", () => {
    expect(isEditedClaim(source, { ...source, elevationM: 0 })).toBe(true);
  });
});

describe("formatDuration", () => {
  it("omits the hour component under an hour", () => {
    expect(formatDuration(1325)).toBe("22:05");
  });

  it("includes hours and pads minutes and seconds", () => {
    expect(formatDuration(8441)).toBe("2:20:41");
  });
});

describe("inviteUrl", () => {
  it("builds a /j/:code link", () => {
    expect(inviteUrl("https://stride.app", "ABC123")).toBe("https://stride.app/j/ABC123");
  });

  it("does not double up the slash when the origin has a trailing one", () => {
    expect(inviteUrl("https://stride.app/", "ABC123")).toBe("https://stride.app/j/ABC123");
  });
});

describe("buildInviteMessage", () => {
  it("names the sport and carries the link", () => {
    const message = buildInviteMessage({
      inviterName: "Alex Carter",
      sport: "Ride",
      distanceKm: 63.63,
      durationLabel: "2:20:41",
      elevationM: 813,
      url: "https://stride.app/j/ABC123",
    });

    expect(message).toContain("Alex Carter is inviting you to log the ride you did together");
    expect(message).toContain("63.63 km · 2:20:41 · 813 m");
    expect(message).toContain("https://stride.app/j/ABC123");
  });
});
