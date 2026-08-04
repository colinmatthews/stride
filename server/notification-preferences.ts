export const NOTIFICATION_TYPES = ["kudos", "follow", "challenge"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_FREQUENCIES = ["instant", "daily", "weekly", "off"] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

export type NotificationPreferences = Record<NotificationType, NotificationFrequency>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  kudos: "instant",
  follow: "instant",
  challenge: "daily",
};

export function isNotificationType(value: unknown): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType);
}

export function isNotificationFrequency(value: unknown): value is NotificationFrequency {
  return NOTIFICATION_FREQUENCIES.includes(value as NotificationFrequency);
}

export function parseNotificationUpdates(
  body: unknown,
): { ok: true; updates: Partial<NotificationPreferences> } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  const updates: Partial<NotificationPreferences> = {};

  for (const [key, value] of Object.entries(body)) {
    if (!isNotificationType(key)) {
      return { ok: false, error: `Unknown notification type: ${key}` };
    }

    if (!isNotificationFrequency(value)) {
      return { ok: false, error: `Invalid frequency for ${key}: ${String(value)}` };
    }

    updates[key] = value;
  }

  return { ok: true, updates };
}
