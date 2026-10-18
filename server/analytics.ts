import { PostHog } from "posthog-node";

// Server-side capture for events whose numbers the server computes (they can't be
// faked by a client and aren't lost to ad blockers). No-op without a project token.
let client: PostHog | null | undefined;

function getClient() {
  if (client === undefined) {
    const token =
      process.env.POSTHOG_PROJECT_TOKEN || process.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
    client = token
      ? new PostHog(token, {
          host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
          flushAt: 1,
          flushInterval: 0,
        })
      : null;
  }
  return client;
}

export function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
) {
  try {
    getClient()?.capture({ distinctId, event, properties });
  } catch (error) {
    // Analytics must never fail the request that triggered it.
    console.error(`Failed to capture ${event}`, error);
  }
}
