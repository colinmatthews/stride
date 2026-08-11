/**
 * Pure notification metadata and preference logic.
 *
 * This module must NOT import ./db.js (or anything that transitively does): it
 * is the half of the notification code that runs under `npm test`, where no
 * DB_URL exists and server/db.ts throws at import time. Everything that touches
 * the database lives in ./queries.ts.
 *
 * Presentation copy (labels, descriptions) lives here rather than in the
 * database and is emitted by the API. It is copy, not user data — storing it
 * per user would turn a wording change into a data migration. Serving it is
 * also the only way to define it once, since tsconfig.server.json sets
 * rootDir: "server" and the server therefore cannot import from src/.
 */

export const NOTIFICATION_KINDS = [
  "kudos",
  "comment",
  "follow",
  "challenge",
  "segment",
  "club",
  "system",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const CHANNEL_KEYS = ["push", "email"] as const;

export type NotificationChannelKey = (typeof CHANNEL_KEYS)[number];

export type ChannelFlags = Record<NotificationChannelKey, boolean>;

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function isNotificationChannelKey(value: unknown): value is NotificationChannelKey {
  return typeof value === "string" && (CHANNEL_KEYS as readonly string[]).includes(value);
}

const CHANNEL_CATALOG: Record<NotificationChannelKey, { label: string }> = {
  push: { label: "Push" },
  email: { label: "Email" },
};

const CATEGORY_CATALOG: Record<NotificationKind, { label: string; description: string }> = {
  kudos: {
    label: "Kudos",
    description: "When someone gives kudos to your activities.",
  },
  comment: {
    label: "Comments",
    description: "Replies and comments on your activities.",
  },
  follow: {
    label: "New followers",
    description: "When an athlete starts following you.",
  },
  challenge: {
    label: "Challenges",
    description: "Progress updates and results for challenges you’ve joined.",
  },
  segment: {
    label: "Segments & KOMs",
    description: "When your leaderboard rank changes on a segment.",
  },
  club: {
    label: "Clubs",
    description: "Group activities and posts from clubs you belong to.",
  },
  system: {
    label: "Weekly recap & product news",
    description: "Your training summary and occasional Stride updates.",
  },
};

/**
 * Defaults mirror the prototype's matrix so a fresh account matches the design
 * that was signed off. Rows are sparse, so shipping quieter defaults later
 * (spec R5.1 — kudos and follows to inbox-only) is an edit here and nothing else.
 */
export const DEFAULT_PREFERENCES: Record<NotificationKind, ChannelFlags> = {
  kudos: { push: true, email: false },
  comment: { push: true, email: true },
  follow: { push: true, email: true },
  challenge: { push: true, email: true },
  segment: { push: false, email: false },
  club: { push: true, email: false },
  system: { push: false, email: true },
};

export const DEFAULT_CHANNEL_SETTINGS: ChannelFlags = { push: true, email: true };

export type StoredPreferenceRow = {
  kind: string;
  push: boolean;
  email: boolean;
};

/**
 * Overlay sparse stored rows onto the code defaults. A kind with no stored row
 * keeps its default; an unrecognized stored kind (left behind by a removed
 * category) is ignored rather than surfaced.
 */
export function mergePreferences(
  storedRows: StoredPreferenceRow[],
): Record<NotificationKind, ChannelFlags> {
  const merged = {} as Record<NotificationKind, ChannelFlags>;

  for (const kind of NOTIFICATION_KINDS) {
    merged[kind] = { ...DEFAULT_PREFERENCES[kind] };
  }

  for (const row of storedRows) {
    if (!isNotificationKind(row.kind)) {
      continue;
    }

    merged[row.kind] = { push: row.push, email: row.email };
  }

  return merged;
}

export type PreferencesDto = {
  channels: {
    key: NotificationChannelKey;
    label: string;
    description: string;
    enabled: boolean;
  }[];
  categories: {
    kind: NotificationKind;
    label: string;
    description: string;
    channels: ChannelFlags;
  }[];
};

export function buildPreferencesDto(input: {
  email: string | null;
  channelSettings: ChannelFlags;
  preferences: Record<NotificationKind, ChannelFlags>;
}): PreferencesDto {
  return {
    channels: CHANNEL_KEYS.map((key) => ({
      key,
      label: CHANNEL_CATALOG[key].label,
      description: describeChannel(key, input.email),
      // Report email as off when there is no address, so the switch agrees with
      // the "Add an email address to enable." copy beside it.
      enabled: key === "email" && !input.email ? false : input.channelSettings[key],
    })),
    categories: NOTIFICATION_KINDS.map((kind) => ({
      kind,
      label: CATEGORY_CATALOG[kind].label,
      description: CATEGORY_CATALOG[kind].description,
      channels: { ...input.preferences[kind] },
    })),
  };
}

function describeChannel(key: NotificationChannelKey, email: string | null) {
  if (key === "push") {
    return "Real-time alerts on your phone and desktop.";
  }

  return email ? `Sent to ${email}.` : "Add an email address to enable.";
}

/**
 * Which channels a notification of this kind should ship on.
 *
 * Master AND category, resolved server-side. The settings UI also disables
 * dependent switches when a master is off, but that is an affordance, not the
 * enforcement — a stale or hand-rolled client must not be able to obtain
 * delivery on a muted channel (spec AC3.2).
 *
 * This never gates the inbox row itself. The in-app record is complete
 * regardless of delivery (spec R6.1/R6.2).
 */
export function resolveDelivery(input: {
  kind: NotificationKind;
  channelSettings: ChannelFlags;
  preferences: Record<NotificationKind, ChannelFlags>;
  /** False when the account has no email address on file. */
  hasEmail?: boolean;
}): NotificationChannelKey[] {
  return CHANNEL_KEYS.filter((key) => {
    if (!input.channelSettings[key] || !input.preferences[input.kind][key]) {
      return false;
    }

    // An account with no address cannot receive email no matter what the
    // preference says, and reporting otherwise contradicts the channel copy.
    if (key === "email" && input.hasEmail === false) {
      return false;
    }

    return true;
  });
}

export type NotificationTargetType =
  | "activity"
  | "athlete"
  | "club"
  | "challenge"
  | "segment"
  | "training";

export type NotificationTarget = { type: NotificationTargetType; id?: string };

export type NotificationTargetRow = {
  kind: NotificationKind;
  activityId: string | null;
  clubId: string | null;
  challengeId: string | null;
  segmentId: string | null;
  targetUserId: string | null;
};

/**
 * Where an inbox row should navigate to (spec R6.3).
 *
 * Keyed on `kind` rather than on generic foreign-key precedence, because a KOM
 * row carries BOTH `segment_id` and `activity_id` and its title names the
 * segment — precedence alone would send it to the wrong screen.
 *
 * Returns a structural target, never a URL: route shapes stay owned by the
 * client router, matching every other DTO the server emits.
 *
 * Returns undefined when the expected reference is missing, so a legacy or
 * partially-populated row renders as a plain, non-clickable row instead of a
 * dead link. `challenge` and `system` carry no id — the challenges list and the
 * training log take no parameter.
 */
export function resolveNotificationTarget(row: NotificationTargetRow) {
  const target = (type: NotificationTargetType, id?: string | null): NotificationTarget => ({
    type,
    ...(id ? { id } : {}),
  });

  switch (row.kind) {
    case "kudos":
    case "comment":
      return row.activityId ? target("activity", row.activityId) : undefined;
    case "follow":
      return row.targetUserId ? target("athlete", row.targetUserId) : undefined;
    case "club":
      return row.clubId ? target("club", row.clubId) : undefined;
    case "segment":
      if (row.segmentId) {
        return target("segment", row.segmentId);
      }
      return row.activityId ? target("activity", row.activityId) : undefined;
    case "challenge":
      // No per-challenge route exists; the list is the closest real destination.
      return target("challenge");
    case "system":
      // The weekly recap references no entity, but the training log is where the
      // numbers it summarizes actually live.
      return target("training");
    default:
      return undefined;
  }
}

/**
 * Keyset cursor over (created_at, id).
 *
 * Deliberately different from the activities cursor, which is a bare timestamp.
 * Backfilled notifications share created_at values by the thousand — an
 * INSERT … SELECT copies them verbatim — so a timestamp-only cursor silently
 * skips every row on the boundary timestamp. The id tiebreaker makes each
 * cursor position unique.
 */
export function encodeNotificationCursor(input: { createdAt: Date; id: string }) {
  return `${input.createdAt.toISOString()}|${input.id}`;
}

/**
 * Pick the cursor for the next page from an overfetched result set
 * (`limit + 1` rows).
 *
 * The cursor must be the last row OF THE PAGE, never the overfetched row: the
 * page query filters on a strict `<`, so pointing at the overfetched row skips
 * exactly that row and silently loses one notification per page boundary.
 */
export function selectNextCursor<Row extends { createdAt: Date; id: string }>(
  rows: Row[],
  limit: number,
) {
  if (rows.length <= limit) {
    return undefined;
  }

  const lastRowOnPage = rows[limit - 1];

  return lastRowOnPage ? encodeNotificationCursor(lastRowOnPage) : undefined;
}

export function decodeNotificationCursor(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const separator = value.lastIndexOf("|");

  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }

  const createdAt = new Date(value.slice(0, separator));

  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return { createdAt, id: value.slice(separator + 1) };
}
