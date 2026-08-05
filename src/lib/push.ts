import { apiSubscribeToPush } from "./api";

function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Vite requires web-safe base64 (base64url) applicationServerKey as a
// Uint8Array, not the raw VAPID string.
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export type PushSubscribeResult = "subscribed" | "denied" | "unsupported";

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    return "unsupported";
  }

  const vapidKey = import.meta.env.VITE_PUBLIC_VAPID_KEY;

  if (!vapidKey) {
    return "unsupported";
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return "denied";
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }));

  await apiSubscribeToPush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });

  return "subscribed";
}
