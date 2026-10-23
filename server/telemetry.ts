import { PostHog } from "posthog-node";

// Server-side operational events. Always written to the server log so the team
// sees them even when PostHog isn't configured; also sent to PostHog when a
// project token is available.

let client: PostHog | null | undefined;

function getClient() {
  if (client === undefined) {
    const token = process.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
    client = token
      ? new PostHog(token, {
          host: process.env.VITE_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          flushAt: 1,
          flushInterval: 0,
        })
      : null;
  }

  return client;
}

export function reportServerEvent(
  userId: string,
  event: string,
  properties: Record<string, string | number | boolean | null>,
  level: "info" | "warn" = "warn",
) {
  console[level](JSON.stringify({ level, event, userId, ...properties }));

  try {
    getClient()?.capture({ distinctId: userId, event, properties });
  } catch (error) {
    // Telemetry must never break the request that triggered it.
    console.error("Failed to send telemetry", error);
  }
}
