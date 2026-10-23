import { describe, expect, it } from "vitest";
import { daysUntil } from "./challenge";

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
