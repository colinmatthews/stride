import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { pushSubscriptions } from "./db/schema.js";
import type { ChallengeProgressUpdate } from "./data.js";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:support@example.com";

const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);
} else {
  console.warn(
    "[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications are disabled.",
  );
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  await db
    .insert(pushSubscriptions)
    .values({
      id: `push-${randomUUID()}`,
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
}

function unitFor(metricType: string) {
  return metricType === "elevation_m" ? "m" : "km";
}

// Fire-and-forget from the caller: never throws, so it can't fail an
// activity save. Prunes subscriptions the push service reports as gone
// (404/410) so a stale endpoint doesn't keep failing forever.
export async function sendChallengeCompletionPush(
  userId: string,
  completion: ChallengeProgressUpdate,
) {
  if (!pushConfigured) {
    return;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: `Challenge complete: ${completion.name}`,
    body: `You hit ${completion.goalKm} ${unitFor(completion.metricType)} — nice work.`,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        } else {
          console.error("[push] send failed", error);
        }
      }
    }),
  );
}
