# PostHog signals per outcome

Outcome → which PostHog query pulls the right signal. Use these as starting points; adapt to the event names in the project.

## Always first: inventory events

Before running any query:

```
event-definitions-list  # up to ~30 events
```

Match event names to the outcome's causal chain. If an expected event is missing (e.g. no `onboarding_completed` when the outcome involves onboarding), that's an **instrumentation gap** — a first-class discovery finding.

## Outcome playbooks

### Activation (signup → first value)

**Funnel:** `user_signed_up` → `onboarding_completed` → `first_activity_event` (or whatever "first value" means in the product).

```json
{
  "kind": "FunnelsQuery",
  "dateRange": { "date_from": "-7d" },
  "series": [
    { "kind": "EventsNode", "event": "user_signed_up", "custom_name": "Signed up" },
    { "kind": "EventsNode", "event": "onboarding_completed", "custom_name": "Onboarding" },
    { "kind": "EventsNode", "event": "<first-value-event>", "custom_name": "First value" }
  ],
  "funnelsFilter": { "funnelWindowInterval": 7, "funnelWindowIntervalUnit": "day" }
}
```

Adjust `funnelWindowInterval` to match the outcome's time bound (e.g. 3 days for "3-day activation").

Also pull:
- **Trends** per event (daily breakdown) — spot ingestion issues where one event is undercounted.
- **Rageclicks** on signup / onboarding paths — friction signal.
- **`first_time_for_user`** math mode on the first-value event — distinguishes brand-new users from existing ones.

### Retention (week-N return)

**Retention query** or a `FunnelsQuery` using `user_signed_up` (cohort) → `session_started` across intervals.

Also: paths analysis from `user_signed_up` to identify drop-off pages early in the journey.

### Free → paid conversion

**Funnel:** `user_signed_up` → `<trial_started if applicable>` → `subscription_started`.

Trends on `subscription_started` by day + `subscription_cancelled` by day. Ratio signals trial-period health.

Breakdown by plan tier, signup source, locale.

### Support deflection

**Trends** on `$rageclick`, `$web_vitals`, `$pageview` to surface client-side errors correlated with support conversation spikes (cross-reference with Intercom timing).

Paths ending on `contact_support` or `help_center_viewed` to see what users do right before they reach out.

### Engagement depth

**Trends** on the product's core action verb (e.g. `activity_created`, `document_opened`) with `math: "weekly_active"` — compares unique-user engagement week over week.

Breakdown by cohort (signup month) to see whether newer cohorts engage differently.

## Query patterns

### Funnel

Use for conversion rates across ordered steps. Always set `funnelWindowInterval` to match the outcome's time scope.

### Trends

Use for rates over time. `interval: "day"` for short windows; `interval: "week"` for longer. `math: "first_time_for_user"` for "first-ever-X" counts.

### Paths

Use for navigation / drop-off analysis. `startPoint` or `endPoint` to constrain. `stepLimit: 5` usually enough.

### HogQL

Last resort. Use when the above four can't express the question. Prefer trends/funnels for all standard cases.

## Reading a funnel result

```json
"results": [
  { "custom_name": "Signed up", "count": 1, "order": 0 },
  { "custom_name": "Onboarding", "count": 1, "order": 1, "median_conversion_time": 12.975 },
  { "custom_name": "First value", "count": 0, "order": 2 }
]
```

- `count` at each step = users who reached that step.
- `median_conversion_time` = seconds between this step and the previous.
- **Sample size matters.** If step-0 count is <30, report the funnel as "directional, not significant." Don't generalize a rate from 1 datapoint.
- `people: []` — the MCP doesn't return person IDs. If you need per-user detail, query `persons-list` separately.

## Preflight: broken canonical events

Before computing any rate, scan event-definitions for **sibling events with similar names** that might be doing the same job. Common patterns:

- `user_signed_up` vs `user_registered`
- `purchase_completed` vs `checkout_succeeded`
- `workspace_created` vs `team_created`
- `activity_created` vs `workout_logged`

If two siblings exist and their volumes diverge dramatically (e.g. 1 vs 46 in the same window), the instrumentation is confused. **The headline finding is the mismatch itself, not whatever rate you'd compute downstream.** Surface it as a preflight warning at the very top of the artifact and run the rest of the analysis qualitatively until the canonical event is settled. This finding is not an opportunity — it's a methodology blocker.

## Preflight: check annotations before trusting a trend break

If you see a sharp spike, drop, or plateau in a trend chart, run `mcp__posthog__annotations-list` before treating it as a product signal. Annotations capture releases, migrations, promo campaigns, outage windows — the context that explains why a metric changed without any user behavior changing. A spike that coincides with a "New paid campaign launched" annotation is marketing, not discovery signal. A drop that coincides with "Migration to new ingestion pipeline" is data, not behavior.

## Interrogating a signal (mandatory before promoting it to evidence)

Finding a friction signal is not the same as finding a problem. Run at least one adjacency check before you call a signal evidence.

### Rageclick / friction cluster on a path

The single biggest mistake: calling 3 rageclicks "HIGH confidence." It almost never is. Before promoting:

1. **Compare to baseline.** Run the same rageclick query for the prior 7–28 days, or for sibling paths in the same window. If `/auth` has 3 rageclicks and `/feed` has 30 in the same window, `/auth` is the calm path. If every path has 2–4, the cluster is noise.
   ```json
   {"kind": "TrendsQuery", "dateRange": {"date_from": "-28d"},
    "series": [{"event": "$rageclick", "math": "total"}],
    "breakdownFilter": {"breakdown": "$pathname", "breakdown_limit": 20}}
   ```
2. **Pull session replays.** PostHog: `session-recording-get` for the sessions that emitted the rageclicks. Watching 2 actual sessions tells you more than 100 events.
3. **Check the click target.** The `$rageclick` event has properties like `$el_text`, `$selector`. Run a HogQL query to group by `$el_text` and see what users actually rage-click on. A specific element is a real problem; rageclicks scattered across a path is noise.
4. **Cross-check with errors.** Are there `$exception` events on the same sessions? Rageclicks correlated with JS errors are real. Standalone rageclicks often aren't.

### Funnel drop

1. **Breakdown by cohort** — `breakdownFilter.breakdown` on `$device_type`, `$browser`, `$geoip_country_name`, or signup source property. A drop concentrated in one cohort is actionable; an even drop across cohorts is structural.
2. **Compare to a 28-day baseline.** Is this a regression or steady state? Same query with `dateRange: { date_from: "-28d" }` — the 3-day rate vs the 28-day rate.
3. **Check upstream volume.** Low signups → low onboarding → low first-activity is one event of friction, not three. Don't double-count derivative drops.

### Low event volume

1. **Cross-check `$pageview` for the corresponding page.** If users aren't reaching the page, the missing event isn't a friction signal — it's an upstream funnel problem.
2. **Check the event definition's `last_seen_at`.** If it stopped firing recently, instrumentation broke; the metric drop is a measurement issue, not a behavior change.

### Path / drop-off

Pair a `PathsQuery` with the funnel drop. Run with `endPoint: "<step that's dropping>"` to see what users were doing right before they bailed.

## Instrumentation gaps = opportunities

If the outcome is "activation" and the project has:

- `user_signed_up` ✓ but no `onboarding_completed` — instrumentation gap → opportunity to instrument.
- `user_signed_up` ≫ `user_registered` with similar volume — likely duplicate events; flag as data quality issue.
- `activity_created` fires 13× but `user_signed_up` only 1× in the same window — suggests signup event is undercounted. Flag.

These are often headline findings — the team literally cannot measure the outcome they say matters.

## What to always extract from PostHog

For each signal cited in the OST:

- **Event name(s)** and window.
- **Number** (counts, rates, or medians).
- **Sample size caveat** if n is small.
- **Link to the PostHog insight URL** (MCP query responses include `_posthogUrl`) — so the reader can replicate.
