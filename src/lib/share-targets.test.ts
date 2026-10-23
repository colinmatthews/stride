import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_URL,
  needsImageDownload,
  shareTargetUrl,
  whatsappShareUrl,
  xShareUrl,
} from "./share-targets";

const PAYLOAD = {
  text: "Alex ran four times this week. 25.9 km & counting.",
  url: "https://stride.app",
};

describe("whatsappShareUrl", () => {
  it("encodes the text and url into a single wa.me message", () => {
    expect(whatsappShareUrl(PAYLOAD)).toBe(
      "https://wa.me/?text=Alex%20ran%20four%20times%20this%20week.%2025.9%20km%20%26%20counting.%20https%3A%2F%2Fstride.app",
    );
  });
});

describe("xShareUrl", () => {
  it("passes text and url as separate intent params", () => {
    const url = new URL(xShareUrl(PAYLOAD));

    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toBe(PAYLOAD.text);
    expect(url.searchParams.get("url")).toBe(PAYLOAD.url);
  });
});

describe("shareTargetUrl", () => {
  it("returns a web target for the networks that accept one", () => {
    expect(shareTargetUrl("whatsapp", PAYLOAD)).toContain("wa.me");
    expect(shareTargetUrl("x", PAYLOAD)).toContain("x.com/intent/post");
    expect(shareTargetUrl("instagram", PAYLOAD)).toBe(INSTAGRAM_URL);
  });

  it("returns null for destinations handled in-page", () => {
    expect(shareTargetUrl("copy_link", PAYLOAD)).toBe(null);
    expect(shareTargetUrl("save_image", PAYLOAD)).toBe(null);
    expect(shareTargetUrl("system_share_sheet", PAYLOAD)).toBe(null);
  });
});

describe("needsImageDownload", () => {
  it("is true where the card must exist on disk before the target opens", () => {
    // Instagram accepts no web share intent, so the file is the only route in.
    expect(needsImageDownload("instagram")).toBe(true);
    expect(needsImageDownload("save_image")).toBe(true);
  });

  it("is false for link-based targets", () => {
    expect(needsImageDownload("whatsapp")).toBe(false);
    expect(needsImageDownload("x")).toBe(false);
    expect(needsImageDownload("copy_link")).toBe(false);
  });
});
