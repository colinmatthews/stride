import { describe, expect, it } from "vitest";
import {
  isEditedClaim,
  mailtoHref,
  smsHref,
  splitDuration,
  sportNoun,
  toTotalSeconds,
} from "./invites";

describe("sportNoun", () => {
  it("maps each sport to the noun used in invite copy", () => {
    expect(sportNoun("Ride")).toBe("ride");
    expect(sportNoun("Run")).toBe("run");
    expect(sportNoun("Swim")).toBe("swim");
    expect(sportNoun("Hike")).toBe("hike");
    expect(sportNoun("Walk")).toBe("walk");
  });
});

describe("splitDuration", () => {
  it("splits seconds into hours, minutes and seconds", () => {
    expect(splitDuration(8441)).toEqual({ hours: 2, minutes: 20, seconds: 41 });
  });

  it("leaves hours at zero for short efforts", () => {
    expect(splitDuration(125)).toEqual({ hours: 0, minutes: 2, seconds: 5 });
  });
});

describe("toTotalSeconds", () => {
  it("recombines the three duration inputs", () => {
    expect(toTotalSeconds("2", "20", "41")).toBe(8441);
  });

  it("treats blank inputs as zero so a half-filled form doesn't produce NaN", () => {
    expect(toTotalSeconds("", "45", "")).toBe(2700);
  });

  it("round-trips with splitDuration", () => {
    const { hours, minutes, seconds } = splitDuration(3661);

    expect(toTotalSeconds(String(hours), String(minutes), String(seconds))).toBe(3661);
  });
});

describe("isEditedClaim", () => {
  const source = { distanceKm: 63.63, movingSeconds: 8441, elevationM: 813 };

  it("is false for an untouched prefill", () => {
    expect(isEditedClaim(source, { ...source })).toBe(false);
  });

  it("is true as soon as one number differs", () => {
    expect(isEditedClaim(source, { ...source, distanceKm: 58.4 })).toBe(true);
  });
});

describe("share links", () => {
  it("puts the message in the SMS body", () => {
    expect(smsHref("Log it with me")).toBe("sms:?&body=Log%20it%20with%20me");
  });

  it("escapes newlines and the link in a mailto body", () => {
    const href = mailtoHref("Log the ride", "line one\nhttps://stride.app/j/ABC123");

    expect(href).toContain("subject=Log%20the%20ride");
    expect(href).toContain("%0A");
    expect(href).toContain("https%3A%2F%2Fstride.app%2Fj%2FABC123");
  });
});
