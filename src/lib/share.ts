import type { ShareDestination } from "./analytics";

/**
 * Share plumbing, kept free of DOM globals so it can be unit-tested in the
 * repo's node-environment vitest setup.
 *
 * The browser surface is injected as `ShareEnvironment` rather than reached for
 * via `navigator` / `document`, which is what lets the branch logic — cancelled
 * vs failed vs unsupported — be covered without adding jsdom.
 */

export type ShareEnvironment = {
  share?: (data: ShareLike) => Promise<void>;
  canShare?: (data: ShareLike) => boolean;
  writeText?: (text: string) => Promise<void>;
};

export type ShareLike = {
  title?: string;
  text?: string;
  url?: string;
  files?: unknown[];
};

export type ShareOutcome =
  /**
   * `withFiles` reports whether the image actually travelled. The platform can
   * accept the share but reject the attachment, so the caller must not infer
   * this from what it passed in.
   */
  | { status: "shared"; destination: ShareDestination; withFiles: boolean }
  /** The user opened the OS sheet and backed out. Not a share — must not be counted as one. */
  | { status: "cancelled" }
  /** No share transport available at all, and no clipboard to fall back to. */
  | { status: "unsupported" }
  | { status: "failed"; error: unknown };

/**
 * The Web Share API rejects with a `DOMException` named `AbortError` when the
 * user dismisses the sheet. The existing share button swallows this with
 * `.catch(() => {})`, so today a cancel is indistinguishable from a success.
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return (error as { name?: unknown }).name === "AbortError";
}

/** Read the ambient browser share surface. Returns an empty env under node. */
export function browserShareEnvironment(): ShareEnvironment {
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  return {
    share: nav?.share ? (data: ShareLike) => nav.share(data as ShareData) : undefined,
    canShare: nav?.canShare ? (data: ShareLike) => nav.canShare(data as ShareData) : undefined,
    writeText: nav?.clipboard?.writeText
      ? (text: string) => nav.clipboard.writeText(text)
      : undefined,
  };
}

/**
 * Hand `data` to the OS share sheet, falling back to copying `data.url` when
 * the platform has no Web Share support (desktop Chrome and Firefox).
 *
 * Resolves with the destination that actually happened, so the caller can emit
 * `activity_shared` only on a real share. `files` is dropped from the payload
 * when the platform reports it cannot share files — Web Share Level 2 is
 * unevenly supported, and a sheet that opens without the image beats one that
 * throws.
 */
export async function shareOrCopy(
  data: ShareLike,
  environment: ShareEnvironment = browserShareEnvironment(),
): Promise<ShareOutcome> {
  const requestedFiles = Boolean(data.files && data.files.length > 0);
  const filesAccepted = requestedFiles && environment.canShare?.(data) !== false;
  const payload = filesAccepted ? data : { title: data.title, text: data.text, url: data.url };

  if (environment.share) {
    try {
      await environment.share(payload);
      return { status: "shared", destination: "system_share_sheet", withFiles: filesAccepted };
    } catch (error) {
      if (isAbortError(error)) {
        return { status: "cancelled" };
      }

      // Fall through to the clipboard rather than dead-ending on a transport error.
      if (!environment.writeText) {
        return { status: "failed", error };
      }
    }
  }

  if (environment.writeText && data.url) {
    try {
      await environment.writeText(data.url);
      return { status: "shared", destination: "copy_link", withFiles: false };
    } catch (error) {
      return { status: "failed", error };
    }
  }

  return { status: "unsupported" };
}
