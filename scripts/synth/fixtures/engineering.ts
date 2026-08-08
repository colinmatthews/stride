import type { RootCause } from "./scenarios.js";

export type IssueType = "bug-from-intercom" | "bug-eng" | "feature" | "tech-debt";

export const AREA_LABELS = [
  "activity-sync",
  "mobile",
  "web",
  "gps",
  "segments",
  "social",
  "notifications",
  "billing",
  "account",
  "auth",
  "privacy",
  "stability",
  "features",
  "integrations",
  "clubs",
  "challenges",
  "infra",
  "performance",
] as const;

export type AreaLabel = (typeof AREA_LABELS)[number];

export const TYPE_LABELS = ["bug", "feature", "tech-debt", "design"] as const;
export type TypeLabel = (typeof TYPE_LABELS)[number];

export const SCENARIO_TO_AREAS: Record<RootCause, AreaLabel[]> = {
  "sync-failure": ["activity-sync", "mobile"],
  "gps-drift": ["gps", "mobile"],
  "segment-mismatch": ["segments"],
  "elevation-wrong": ["activity-sync", "mobile"],
  "kudos-missing": ["social", "notifications"],
  "billing-overcharge": ["billing"],
  "billing-cancel": ["billing", "account"],
  "billing-refund": ["billing"],
  "billing-downgrade": ["billing", "account"],
  "account-password": ["account", "auth"],
  "account-email": ["account"],
  "account-deletion": ["account", "privacy"],
  "data-export": ["privacy", "web"],
  "app-crash": ["mobile", "stability"],
  notifications: ["notifications"],
  "feature-request": ["features"],
  "club-join": ["clubs", "social"],
  "challenge-progress": ["challenges"],
  "privacy-report": ["privacy", "social"],
};

export const PROJECTS = [
  {
    name: "Q2 Reliability",
    description:
      "Stability and reliability bugs: crashes, sync failures, GPS issues, billing anomalies.",
    color: "#E11D48",
  },
  {
    name: "New Metrics",
    description:
      "Power zones, training plans, stroke analysis, improved segment leaderboards — feature work for 2026.",
    color: "#2563EB",
  },
  {
    name: "Platform Foundations",
    description:
      "Technical debt, infra upgrades, observability, and test coverage investments.",
    color: "#7C3AED",
  },
] as const;

export type ProjectName = (typeof PROJECTS)[number]["name"];

export const FEATURE_THEMES = [
  "Power zones for cycling activities",
  "Training plan import/export",
  "Dark mode for mobile and web",
  "Stroke breakdown for swim activities",
  "Custom challenge creation by clubs",
  "Real-time route sharing during activities",
  "Relive-style 3D replay of runs",
  "Heatmap view across all personal activities",
  "Polar and Suunto watch integrations",
  "Nutrition tracking per activity",
  "AI-suggested segments",
  "Export activities to CSV/FIT batch",
  "Club event planning with RSVPs",
  "Cadence, ground contact time, vertical oscillation metrics",
  "Automatic injury-risk alerts from training load",
];

export const TECH_DEBT_THEMES = [
  "Rewrite activity import pipeline for Garmin FIT v2.0",
  "Add Postgres composite index on (athlete_id, date) for feed query",
  "Migrate from raw pg to pgbouncer for connection pooling",
  "Add OpenTelemetry tracing across API and ingestion services",
  "Drop support for iOS 16 and below",
  "Consolidate duplicate segment detection logic into shared lib",
  "Add contract tests for Garmin, Polar, Apple Watch webhook payloads",
  "Move feature flags from env vars to GrowthBook",
  "Reduce JS bundle by 200KB via route-level code splitting",
  "Replace Moment with date-fns in mobile app",
  "Set up Sentry source map upload in CI",
  "Deprecate /v1 API endpoints and notify integrators",
  "Fix N+1 query in challenge progress rollup",
  "Test coverage for segment effort matching",
  "Migrate auth sessions from custom scrypt to Lucia",
];

export const ENG_BUG_THEMES = [
  "Flaky integration test on segment matching",
  "Feed query p95 latency spiked to 2s",
  "Memory leak in background activity ingest worker",
  "Duplicate kudos entries after rapid double-tap",
  "Activity upload retries not respecting exponential backoff",
  "Session token not invalidated on password change",
  "GraphQL cache stale after mutation on club membership",
  "Mobile app silently drops activity when offline > 24h",
  "Missing sentry breadcrumb for activity sync failures",
  "Cron job for challenge progress runs twice on DST transition",
];

export const ENG_INSTRUCTIONS: Record<IssueType, string> = {
  "bug-from-intercom": `Write a Linear bug ticket based on a customer support conversation that was just escalated by support to engineering.

Voice: Concise engineering-PM tone. Don't echo the customer's words verbatim — rephrase in technical terms. Be specific.

Title: Under 70 chars, engineering-focused (not "user says X" — more like "Activity sync loses uploads from Garmin Forerunner on slow network").

Description (markdown, use ## headers):
## What happened
## Expected
## Actual
## Reproduction
## Environment
## Related
- End with a "## Related" section that includes: "Reported via Intercom conversation {conversation_id}." (the conversation_id will be provided in the user prompt).

Return JSON: {"title":"...","body":"..."}. No code fences.`,
  "bug-eng": `Write a Linear bug ticket for an internal engineering-found bug (regression, flaky test, perf issue, monitoring anomaly).

Title: Under 70 chars.

Description (markdown with ## headers):
## What happened
## Expected
## Actual
## Reproduction
## Environment
## Notes

Return JSON: {"title":"...","body":"..."}. No code fences.`,
  feature: `Write a Linear product feature ticket.

Title: Under 70 chars, feature-forward.

Description (markdown with ## headers):
## Problem
## Proposal
## Success metric
## Out of scope
## Open questions

Return JSON: {"title":"...","body":"..."}. No code fences.`,
  "tech-debt": `Write a Linear technical debt / infrastructure ticket.

Title: Under 70 chars.

Description (markdown with ## headers):
## Problem
## Proposed approach
## Risk / rollout plan
## Estimated impact
## Out of scope

Return JSON: {"title":"...","body":"..."}. No code fences.`,
};
