/**
 * Database access for the notification center. Everything here touches the
 * pool; the pure metadata and preference logic lives in ./catalog.ts so it can
 * be unit-tested without a database.
 */
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  notificationChannelSettings,
  notificationPreferences,
  notifications,
  users,
} from "../db/schema.js";
import {
  buildPreferencesDto,
  decodeNotificationCursor,
  encodeNotificationCursor,
  isNotificationChannelKey,
  isNotificationKind,
  mergePreferences,
  resolveDelivery,
  selectNextCursor,
  DEFAULT_CHANNEL_SETTINGS,
  DEFAULT_PREFERENCES,
  type ChannelFlags,
  type NotificationKind,
  type PreferencesDto,
} from "./catalog.js";

const BOOTSTRAP_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_PAGE_LIMIT = 100;

/** `db` or a transaction handle — fan-out runs inside the caller's transaction. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NotificationInput = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actorId?: string | null;
  activityId?: string | null;
  clubId?: string | null;
  challengeId?: string | null;
  segmentId?: string | null;
  targetUserId?: string | null;
};

export type NotificationDto = {
  id: string;
  kind: NotificationKind;
  actorId?: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
};

/**
 * Insert one inbox row, then decide delivery.
 *
 * The inbox insert is unconditional: preferences gate push/email, never the
 * in-app record (spec R6.1/R6.2 — muting push must not hide the event).
 *
 * Ids are deterministic per event (see the callers), so re-running the demo
 * backfill or re-triggering the same event is a no-op rather than a duplicate.
 */
export async function createNotification(tx: Executor, input: NotificationInput) {
  if (input.userId === "me" || input.actorId === "me") {
    // "me" is the client-facing alias, never a real users.id. Fail loud rather
    // than let a missed resolveAliasedUserId become an opaque FK violation
    // inside a rollback that also discards the social event itself.
    throw new Error("createNotification received an unresolved 'me' id");
  }

  const inserted = await tx
    .insert(notifications)
    .values({
      id: input.id,
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      actorId: input.actorId ?? null,
      activityId: input.activityId ?? null,
      clubId: input.clubId ?? null,
      challengeId: input.challengeId ?? null,
      segmentId: input.segmentId ?? null,
      targetUserId: input.targetUserId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });

  if (inserted.length === 0) {
    return null;
  }

  for (const channel of await resolveDeliveryChannels(tx, input.userId, input.kind)) {
    // There is no mail or push transport in this app, so a passing channel is
    // recorded rather than sent. This is the seam a real transport plugs into.
    console.log(`[notify] ${channel} → ${input.userId} kind=${input.kind} id=${input.id}`);
  }

  return input.id;
}

/**
 * Remove the notification for an undone event (un-kudos, unfollow, leaving a
 * club or challenge). Scoped by id only — ids are deterministic, so the caller
 * already knows the exact row.
 */
export async function deleteNotification(tx: Executor, notificationId: string) {
  await tx.delete(notifications).where(eq(notifications.id, notificationId));
}

async function resolveDeliveryChannels(tx: Executor, userId: string, kind: NotificationKind) {
  const [channelRows, preferenceRows, userRows] = await Promise.all([
    tx
      .select({
        pushEnabled: notificationChannelSettings.pushEnabled,
        emailEnabled: notificationChannelSettings.emailEnabled,
      })
      .from(notificationChannelSettings)
      .where(eq(notificationChannelSettings.userId, userId))
      .limit(1),
    tx
      .select({
        kind: notificationPreferences.kind,
        push: notificationPreferences.push,
        email: notificationPreferences.email,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)),
    // Needed so we never report an email delivery for an account that has no
    // address to send to — the seeded athletes have a NULL email.
    tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  return resolveDelivery({
    kind,
    channelSettings: toChannelFlags(channelRows[0]),
    preferences: mergePreferences(preferenceRows),
    hasEmail: Boolean(userRows[0]?.email),
  });
}

function toChannelFlags(row?: { pushEnabled: boolean; emailEnabled: boolean }): ChannelFlags {
  if (!row) {
    return { ...DEFAULT_CHANNEL_SETTINGS };
  }

  return { push: row.pushEnabled, email: row.emailEnabled };
}

function mapNotification(
  row: typeof notifications.$inferSelect,
  currentUserId: string,
): NotificationDto {
  const kind = isNotificationKind(row.kind) ? row.kind : "system";

  return {
    id: row.id,
    kind,
    actorId: row.actorId ? (row.actorId === currentUserId ? "me" : row.actorId) : undefined,
    title: row.title,
    body: row.body,
    date: row.createdAt.toISOString(),
    read: row.readAt !== null,
  };
}

export function parseNotificationPageLimit(
  value: unknown,
  fallback = BOOTSTRAP_NOTIFICATION_LIMIT,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(MAX_NOTIFICATION_PAGE_LIMIT, Math.floor(parsed));
}

export async function listNotifications(
  userId: string,
  options: { cursor?: unknown; limit?: number } = {},
) {
  const limit = options.limit ?? BOOTSTRAP_NOTIFICATION_LIMIT;
  const cursor = decodeNotificationCursor(options.cursor);
  const filters = [eq(notifications.userId, userId)];

  if (cursor) {
    // Keyset over the composite (created_at, id) — see decodeNotificationCursor
    // for why a bare timestamp cursor loses rows here.
    filters.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.createdAt.toISOString()}, ${cursor.id})`,
    );
  }

  const [rows, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(...filters))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1),
    countUnread(userId),
  ]);

  const pageRows = rows.slice(0, limit);

  return {
    notifications: pageRows.map((row) => mapNotification(row, userId)),
    nextCursor: selectNextCursor(rows, limit),
    unread,
  };
}

export async function countUnread(userId: string) {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return Number(rows[0]?.value ?? 0);
}

/**
 * Idempotent by design: the caller sends the desired absolute state, not a
 * toggle, so a double-tap or a retry after a flaky response converges instead
 * of landing opposite to the optimistic UI (spec R4).
 */
export async function markNotificationRead(userId: string, notificationId: string, read: boolean) {
  const updated = await db
    .update(notifications)
    .set({
      // COALESCE keeps the original read timestamp when re-marking an
      // already-read row.
      readAt: read ? sql`coalesce(${notifications.readAt}, now())` : null,
    })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id, readAt: notifications.readAt });

  const row = updated[0];

  if (!row) {
    return null;
  }

  return { id: row.id, read: row.readAt !== null, unread: await countUnread(userId) };
}

export async function markAllNotificationsRead(userId: string) {
  const updated = await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return { unread: 0, updated: updated.length };
}

export async function getNotificationPreferences(userId: string): Promise<PreferencesDto> {
  const [userRows, channelRows, preferenceRows] = await Promise.all([
    db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({
        pushEnabled: notificationChannelSettings.pushEnabled,
        emailEnabled: notificationChannelSettings.emailEnabled,
      })
      .from(notificationChannelSettings)
      .where(eq(notificationChannelSettings.userId, userId))
      .limit(1),
    db
      .select({
        kind: notificationPreferences.kind,
        push: notificationPreferences.push,
        email: notificationPreferences.email,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)),
  ]);

  return buildPreferencesDto({
    email: userRows[0]?.email ?? null,
    channelSettings: toChannelFlags(channelRows[0]),
    preferences: mergePreferences(preferenceRows),
  });
}

export type PreferencesPatch = {
  channels?: Partial<ChannelFlags>;
  categories?: { kind: NotificationKind; channels: Partial<ChannelFlags> }[];
};

/**
 * Validate an untrusted request body into a patch. Manual validation matches the
 * String()/Number() coercion style already used in server/app.ts — zod is a
 * dependency of the client bundle, not the server.
 */
export function parsePreferencesPatch(body: unknown): PreferencesPatch {
  const source = (body ?? {}) as Record<string, unknown>;
  const patch: PreferencesPatch = {};

  if (source.channels !== undefined) {
    const channels = source.channels as Record<string, unknown>;
    const parsed: Partial<ChannelFlags> = {};

    for (const [key, value] of Object.entries(channels ?? {})) {
      if (!isNotificationChannelKey(key)) {
        throw new PreferencesValidationError("Unknown notification channel");
      }

      if (typeof value !== "boolean") {
        throw new PreferencesValidationError("Channel values must be boolean");
      }

      parsed[key] = value;
    }

    patch.channels = parsed;
  }

  if (source.categories !== undefined) {
    if (!Array.isArray(source.categories)) {
      throw new PreferencesValidationError("categories must be an array");
    }

    patch.categories = source.categories.map((entry) => {
      const category = (entry ?? {}) as Record<string, unknown>;

      if (!isNotificationKind(category.kind)) {
        throw new PreferencesValidationError("Unknown notification kind");
      }

      const parsed: Partial<ChannelFlags> = {};

      for (const [key, value] of Object.entries(
        (category.channels ?? {}) as Record<string, unknown>,
      )) {
        if (!isNotificationChannelKey(key)) {
          throw new PreferencesValidationError("Unknown notification channel");
        }

        if (typeof value !== "boolean") {
          throw new PreferencesValidationError("Channel values must be boolean");
        }

        parsed[key] = value;
      }

      return { kind: category.kind, channels: parsed };
    });
  }

  return patch;
}

export class PreferencesValidationError extends Error {}

/**
 * Apply a partial preference change.
 *
 * Deliberately does NOT read the current state first. An earlier version read a
 * snapshot, merged it in JS, and wrote every column back — so two quick
 * single-key requests (push off, then email off) both read the same snapshot and
 * the second silently re-enabled what the first had turned off. A control that
 * un-sets itself is precisely the bug this feature exists to fix.
 *
 * Instead the conflict clause updates ONLY the columns named in the patch, so
 * concurrent writes to different channels cannot clobber one another. The INSERT
 * branch supplies code defaults for untouched columns, matching the same
 * "sparse rows + code defaults" rule the read path uses.
 */
export async function updateNotificationPreferences(userId: string, patch: PreferencesPatch) {
  await db.transaction(async (tx) => {
    if (patch.channels && Object.keys(patch.channels).length > 0) {
      const set: Partial<typeof notificationChannelSettings.$inferInsert> = {};

      if (patch.channels.push !== undefined) {
        set.pushEnabled = patch.channels.push;
      }

      if (patch.channels.email !== undefined) {
        set.emailEnabled = patch.channels.email;
      }

      await tx
        .insert(notificationChannelSettings)
        .values({
          userId,
          pushEnabled: patch.channels.push ?? DEFAULT_CHANNEL_SETTINGS.push,
          emailEnabled: patch.channels.email ?? DEFAULT_CHANNEL_SETTINGS.email,
        })
        .onConflictDoUpdate({ target: notificationChannelSettings.userId, set });
    }

    for (const category of patch.categories ?? []) {
      if (Object.keys(category.channels).length === 0) {
        continue;
      }

      const defaults = DEFAULT_PREFERENCES[category.kind];
      const set: Partial<typeof notificationPreferences.$inferInsert> = {};

      if (category.channels.push !== undefined) {
        set.push = category.channels.push;
      }

      if (category.channels.email !== undefined) {
        set.email = category.channels.email;
      }

      await tx
        .insert(notificationPreferences)
        .values({
          userId,
          kind: category.kind,
          push: category.channels.push ?? defaults.push,
          email: category.channels.email ?? defaults.email,
        })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.kind],
          set,
        });
    }
  });

  return getNotificationPreferences(userId);
}

export { BOOTSTRAP_NOTIFICATION_LIMIT };
