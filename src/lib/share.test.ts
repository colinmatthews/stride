import { describe, expect, it, vi } from "vitest";
import {
  isAbortError,
  recapImageFilename,
  shareOrCopy,
  type ShareEnvironment,
  type ShareLike,
} from "./share";

function abortError() {
  const error = new Error("Share canceled");
  error.name = "AbortError";
  return error;
}

const PAYLOAD: ShareLike = {
  title: "4 runs this week",
  text: "32.4 km across 4 runs",
  url: "https://stride.app/recap",
};

describe("isAbortError", () => {
  it("recognises the DOMException the share sheet throws on dismiss", () => {
    expect(isAbortError(abortError())).toBe(true);
  });

  it("does not treat other failures as a dismissal", () => {
    expect(isAbortError(new Error("NotAllowedError"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});

describe("shareOrCopy", () => {
  it("reports the system share sheet when the share resolves", async () => {
    const environment: ShareEnvironment = { share: vi.fn().mockResolvedValue(undefined) };

    expect(await shareOrCopy(PAYLOAD, environment)).toEqual({
      status: "shared",
      destination: "system_share_sheet",
      withFiles: false,
    });
  });

  it("reports a cancel as cancelled, never as a share", async () => {
    const environment: ShareEnvironment = {
      share: vi.fn().mockRejectedValue(abortError()),
      writeText: vi.fn().mockResolvedValue(undefined),
    };

    expect(await shareOrCopy(PAYLOAD, environment)).toEqual({ status: "cancelled" });
    // A dismissed sheet must not silently become a clipboard "share".
    expect(environment.writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when the platform has no Web Share", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareOrCopy(PAYLOAD, { writeText })).toEqual({
      status: "shared",
      destination: "clipboard",
      withFiles: false,
    });
    expect(writeText).toHaveBeenCalledWith(PAYLOAD.url);
  });

  it("falls back to the clipboard when the share transport errors", async () => {
    const environment: ShareEnvironment = {
      share: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
      writeText: vi.fn().mockResolvedValue(undefined),
    };

    expect(await shareOrCopy(PAYLOAD, environment)).toEqual({
      status: "shared",
      destination: "clipboard",
      withFiles: false,
    });
  });

  it("drops the image when the platform cannot share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const withFile: ShareLike = { ...PAYLOAD, files: [{}] };

    const outcome = await shareOrCopy(withFile, { share, canShare: () => false });

    expect(share).toHaveBeenCalledWith({
      title: PAYLOAD.title,
      text: PAYLOAD.text,
      url: PAYLOAD.url,
    });
    // The image did not travel, so the event must not claim it did.
    expect(outcome).toEqual({
      status: "shared",
      destination: "system_share_sheet",
      withFiles: false,
    });
  });

  it("keeps the image when the platform can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const withFile: ShareLike = { ...PAYLOAD, files: [{}] };

    const outcome = await shareOrCopy(withFile, { share, canShare: () => true });

    expect(share).toHaveBeenCalledWith(withFile);
    expect(outcome).toEqual({
      status: "shared",
      destination: "system_share_sheet",
      withFiles: true,
    });
  });

  it("is unsupported when there is neither a share sheet nor a clipboard", async () => {
    expect(await shareOrCopy(PAYLOAD, {})).toEqual({ status: "unsupported" });
  });

  it("surfaces a clipboard failure rather than claiming success", async () => {
    const error = new Error("denied");
    const outcome = await shareOrCopy(PAYLOAD, { writeText: vi.fn().mockRejectedValue(error) });

    expect(outcome).toEqual({ status: "failed", error });
  });
});

describe("recapImageFilename", () => {
  it("names the file after the week it summarises", () => {
    expect(recapImageFilename("2026-01-12T00:00:00.000Z")).toBe("stride-week-2026-01-12.png");
  });
});
