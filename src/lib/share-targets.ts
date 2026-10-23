import type { ShareDestination } from "./analytics";

/**
 * Deep links for the prototype's "OR SEND STRAIGHT TO" row.
 *
 * Pure URL builders, so the exact query encoding is unit-testable without a
 * browser. Each named destination is only emitted from its own button, which
 * is what makes the `destination` property on `activity_shared` trustworthy —
 * unlike the OS share sheet, which never reveals where content went.
 */

export type ShareTargetPayload = {
  text: string;
  url: string;
};

export function whatsappShareUrl({ text, url }: ShareTargetPayload): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export function xShareUrl({ text, url }: ShareTargetPayload): string {
  const params = new URLSearchParams({ text, url });
  return `https://x.com/intent/post?${params.toString()}`;
}

/**
 * Instagram accepts no web share intent — `instagram-stories://share` only
 * works from a native app, and there is no `instagram.com/intent/…`. So the
 * Instagram button downloads the card and opens Instagram for the user to
 * attach it. The analytics still record `destination: "instagram"`, which is
 * the runner's stated intent and the thing worth measuring.
 */
export const INSTAGRAM_URL = "https://www.instagram.com/";

export const INSTAGRAM_HINT = "Card saved — attach it in Instagram.";

/** The web URL for a destination, or null when it is handled locally. */
export function shareTargetUrl(
  destination: ShareDestination,
  payload: ShareTargetPayload,
): string | null {
  switch (destination) {
    case "whatsapp":
      return whatsappShareUrl(payload);
    case "x":
      return xShareUrl(payload);
    case "instagram":
      return INSTAGRAM_URL;
    // Handled in-page: clipboard write and blob download respectively.
    case "copy_link":
    case "save_image":
    case "system_share_sheet":
      return null;
  }
}

/** Destinations that need the PNG on disk before the target opens. */
export function needsImageDownload(destination: ShareDestination): boolean {
  return destination === "instagram" || destination === "save_image";
}
