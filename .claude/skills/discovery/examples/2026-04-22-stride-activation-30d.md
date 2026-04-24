# Discovery — Stride 30-day new-user activation

**Outcome:** Lift 30-day new-user activation rate (signup → first activity within 30 days).
**Window:** Last 30 days (2026-03-24 → 2026-04-23).
**Run date:** 2026-04-22.
**Tools consulted:** PostHog (project 391447 "Default project"), Linear (team STR), Intercom.

---

## 1. Preflight findings

Two hard preflight issues. Both are **methodology blockers**, not opportunities. Read these before trusting any rate in this artifact.

### 1A. Duplicate signup events — canonical event is effectively dead

In the last 30 days:

| Event | Count (30d) | Count (prior 30d: -60d..-30d) |
|---|---|---|
| `user_signed_up` | **1** | 0 |
| `user_registered` | **46** | 3 |
| `onboarding_completed` | **1** | 0 |

`user_signed_up` and `user_registered` are sibling events pointing at the same concept — registration. `user_registered` is the de-facto canonical event, firing ~46× more often than `user_signed_up`. Any dashboard or funnel wired to `user_signed_up` is silently broken.

**Implication:** Until this is resolved, any "activation rate" number in this project is tool-dependent. This blocks trustworthy measurement of the outcome itself. Housekeeping item H-1 captures the fix; do not promote it to an opportunity.

### 1B. Window is too short for a true 30-day activation rate

The outcome is "signup → first activity within 30 days." A 30-day window can only fully measure cohorts that signed up ≥30 days before today. Registrations began only on 2026-04-07 (16 days ago). 63% of registrants (29 of 46) signed up in the last 7 days, so the majority of the cohort has not yet had a chance to fail the 30-day window.

- What we have: `user_registered` → `activity_created` within 30d funnel: **38 → 37 (97.4%)**, median conversion 24.5 hours.
- What this actually measures: a right-censored rate on a small, leading-edge cohort. The 37/38 number is **directional, not a baseline** — most of those registrants only had ~5–20 days of observation.

Take the 97.4% as "signups in this window that activated very quickly (within days)." Do not quote it as a 30-day rate.

### 1C. Partial-permissions caveats

Some MCP calls were denied during this run; findings should be read with this context:

- `mcp__posthog__annotations-list` — denied. Cannot verify whether the 3 → 46 jump in `user_registered` (prior 30d → current 30d) is a release, marketing push, data backfill, or real growth. All comparative-baseline interpretation is affected.
- `mcp__linear__list_teams`, `list_projects` — denied. Team shape inferred from ticket prefix (`STR-`) and project fields on issues.
- `mcp__linear__get_issue` — denied. Full ticket descriptions, comments, and relations could not be fetched; evidence rests on `list_issues` title + truncated description only. The Step-3 adjacency check "read the full body of the most-cited ticket" could not be completed for the password-reset cluster, which caps its confidence.

---

## 2. Signal inventory (compact)

### PostHog

| Signal | Finding |
|---|---|
| Events inventory | 20 events total. Canonical activation chain (`user_signed_up`, `onboarding_completed`) under-firing; `user_registered` carries the real signup volume; `activity_created` firing well (3,773 in 30d) |
| Registered → First activity, 30d funnel | 38 → 37 (97.4%), median conv. ~24h. Sample too small + window too short to call a rate. |
| `$pageview` by path (30d) | /feed 5,084 · /clubs 2,073 · /activities 2,007 · /profile 1,983 · /challenges 1,954 · /segments 1,874 · /settings 1,311 · / (landing) 15 · /auth 6 · **/onboarding 1** |
| `$rageclick` by path (30d) | /auth 3 rageclicks on 6 pageviews (50% per-view rate); other paths 0 or unrecorded. N=3 is anecdotal. |
| `$device_type` breakdown on the funnel | Property is not populated — empty string returned. Cohort breakdown cannot run. |

### Linear (team STR)

| Signal | Finding |
|---|---|
| "onboarding" query | 0 results |
| "signup" query | 0 results |
| "welcome" query | 0 results |
| "activation" query | 0 relevant results (all matches were substring hits on "activity") |
| "first activity" query | 0 relevant results |
| "auth" query | Cluster of 3 password-reset-email tickets: STR-6 (Urgent, Backlog, 2026-04-07), STR-14 (Urgent, Backlog, 2026-02-08), STR-8 (Done, 2026-03-17). Both Urgent tickets still open while one Done exists → suggests incomplete or regressed fix. |
| "auth" query (other) | STR-75 / STR-79 (Lucia auth migration, Medium, In Progress / Todo) — tech-debt; STR-32 (session tokens not invalidated on password change, Medium, Backlog) |

### Intercom (82 conversations in the workspace; timestamps cluster around 2026-04-20)

Top support themes by "Root cause" custom attribute:

| Theme (tag) | Count | Activation-relevance | Example verbatim |
|---|---|---|---|
| `gps-drift` | 4 | LOW (affects active users mid-activity) | — |
| `challenge-progress` | 4 | LOW (affects active users already logging activities) | "I just finished a long run… but my distance challenge still shows the same total" |
| `app-crash` | 4 | LOW (all reporters reference prior history: "summit push from last week," "solo gravel ride from yesterday") | "App keeps crashing when I open the feed" |
| `account-password` | 4 | **MEDIUM-HIGH** (locked-out users, at least one self-identifies as "pretty new to the app") | "Password reset email never arrived" · "I'm pretty new to the app and just want to get back in to log my walks" |
| `segment-mismatch` | 3 | NONE | — |
| `kudos-missing` | 3 | LOW (social/engagement) | — |
| `feature-request` | 3 | NONE | — |
| `sync-failure` | 2 | LOW | — |
| `billing-cancel` | 2 | NONE | — |

All 4 `account-password` conversations are Tickets in "Submitted" state (escalated/unresolved). Bodies consistently describe `~20 minutes` waiting for an email that never arrives.

---

## 3. Interrogation pass

Every candidate signal run through at least one adjacency check before being treated as evidence.

| Candidate signal | Adjacency check performed | Result |
|---|---|---|
| `user_signed_up` vs `user_registered` divergence (1 vs 46) | Cross-tool: no Linear tickets on event cleanup; no Intercom thread on event wiring. Trend check prior 30d: same pattern (0 vs 3). | **Evidence** — 46× divergence is structural, not seasonal. Methodology blocker → preflight finding 1A, Housekeeping H-1. |
| `onboarding_completed` ≈ 1 in 30d | Cross-check `/onboarding` pageview: 1 pageview in 30d vs 5,084 on /feed. | **Evidence of instrumentation gap** — either users bypass an onboarding route, or the /onboarding page/event is not wired. Cannot distinguish from data alone. Housekeeping H-2. |
| /auth rageclicks (3) | Baseline check: other paths have 0 recorded rageclicks across 30d; /auth pageviews only 6 (3/6 = 50% per-view rate). Requested session replay via paths query → no data (volume too low). Did not have `get` on $rageclick element selectors. | **Insufficient to promote alone** — 50% rate is striking but N=3. Directional. Noted in shelved signals S-1 with "what would unshelve it." |
| Password-reset ticket cluster (STR-6 Urgent, STR-14 Urgent, STR-8 Done) | Cross-tool: Intercom has 4 `account-password` tickets with consistent "email never arrived" bodies, all in Submitted state. `get_issue` denied — could not read full ticket bodies, linked PRs, or comments. | **Evidence (MEDIUM confidence ceiling)** — multi-tool triangulation (Linear cluster + Intercom cluster) met; Intercom floor ≥5 not quite met (4); adjacency check on Linear side incomplete due to permission denial. |
| Intercom `challenge-progress` (4 convos) | Full body read of top 2. All reference existing activity history ("finished my ride yesterday," "marathon pace run yesterday"). Not new users. | **Shelved S-3** — relevant to engagement retention, not to 30-day new-user activation. |
| Intercom `app-crash` (4 convos) | Full body read of top 2. All reference existing history. One user is explicitly "premium" member. Not new users. | **Shelved S-4** — relevant to retention, not activation. |
| Intercom `gps-drift` (4 convos) | Not activation-path — occurs during active recording. | Shelved S-5 — not in outcome scope. |
| `$device_type` breakdown empty | — | **Evidence of instrumentation gap** → Housekeeping H-3. |
| User_registered 3 → 46 jump (prior 30d vs current 30d) | `annotations-list` denied → cannot verify whether release, marketing launch, test data seed, or real growth. Daily trend shows registrations only began 2026-04-07 with no pre-ramp. | **Investigated, insufficient** — cannot attribute. Shelved S-2 pending annotation access. |
| Linear backlog gap on onboarding | 4 adjacent terms searched: onboarding, signup, welcome, first activity. All zero. "auth" returned password-reset cluster but nothing on new-user flow design. | **Evidence of discovery gap** — no tickets on new-user experience at all. Opportunity candidate. |

---

## 4. Opportunities (product, ranked)

Only **2 opportunities** survive interrogation. Data does not support padding to 3–6.

### O-1. New users who get locked out cannot recover — password reset emails do not arrive

**User voice:** *"I'm pretty new to the app and just want to get back in to log my walks. Can you help me out or resend that email?"* (Intercom, `account-password`)

**Problem statement:** Users who attempt a password reset — including at least one self-identified new user — do not receive the reset email. They are locked out, cannot complete a first activity, and are forced to escalate to support. Tickets on this root cause have been raised in both Linear (STR-6, STR-14, both Urgent / Backlog; STR-8 Done) and Intercom (4 conversations, all in Submitted state, all mentioning ~20-minute wait and either empty inbox or broken link).

**Activation link:** New users who sign up, forget or mistype their password, and attempt recovery are stopped at this exact step. The path from `user_registered` to `first activity_created` goes through "can I log back in?" for anyone who doesn't complete the first session in one sitting.

**Evidence weight:**
- Linear: 3 related tickets; 2 Urgent still open alongside 1 Done — classic recurring-bug pattern.
- Intercom: 4 conversations, consistent body pattern, all escalated (ticket_state = Submitted).
- Cross-tool: YES.
- Interrogation: partial — `get_issue` denied prevented full ticket-body read; Intercom bodies read.

**Ratings:**

| Impact | Confidence | Effort |
|---|---|---|
| MED–HIGH | **MEDIUM** (multi-tool triangulation + evidence of recurrence; capped below HIGH because: Intercom count = 4 is just below the ≥5 floor; `get_issue` adjacency check on the Linear cluster was blocked by permissions; only 1 of 4 Intercom bodies explicitly self-identifies as a new user) | M (1–4 weeks — email deliverability investigation + monitoring) |

### O-2. There is no instrumented (or designed?) first-run experience — the /onboarding route sees 1 pageview/month and no product work exists on the theme

**User voice:** None in Intercom — this is the silence itself. No tickets on onboarding (`onboarding`, `signup`, `welcome`, `first activity` all zero in Linear).

**Problem statement:** The app has a route `/onboarding` and an event `onboarding_completed`, but both fire effectively once in 30 days against 46 registrations. One of three things is true: (a) the route/event is not wired and the team has no visibility into whether users ever see a first-run experience; (b) users are skipping the flow via a direct deep-link and no one is guiding them to "first activity"; or (c) there is no intentional first-run experience at all. Across 4 adjacent Linear search terms, zero tickets on any of these concepts exist in the backlog.

**Activation link:** Direct. 30-day activation is by definition "the new user gets to first value within 30 days." Without an instrumented or designed first-run experience, the team cannot diagnose where in that path new users stall, and cannot test interventions.

**Evidence weight:**
- PostHog: `/onboarding` = 1 pageview / `onboarding_completed` = 1 event; both orders of magnitude below registration volume. Clear mismatch.
- Linear: 4-way search gap (onboarding / signup / welcome / first activity) = 0 tickets. Robust gap, not a narrow search.
- Intercom: silent — no conversations on "I can't figure out how to start." That silence is ambiguous — could be genuinely no pain, could be users silently bouncing without writing in.
- Cross-tool: PARTIAL (strong in PostHog + Linear-gap; silent in Intercom).

**Ratings:**

| Impact | Confidence | Effort |
|---|---|---|
| HIGH if (c) is true, MED if (a) | **MEDIUM** (PostHog + Linear gap converge, but Intercom provides no triangulation; and the signal is an *absence* — absence is weaker than presence, and without user-facing complaints we cannot confirm whether the absence of an onboarding is hurting users) | M to L (depends on whether the problem is "instrument" or "design from scratch" — first spike of ≤1 week to triage, then sized) |

---

## 5. Per-opportunity solution tables

### Solutions for O-1 (password reset emails not arriving)

| # | Solution | Type | Linear tie | Notes |
|---|---|---|---|---|
| 1 | Unblock STR-6 or STR-14 — investigate SES/SendGrid (or equivalent) deliverability: bounce logs, DMARC/SPF, reset-token expiry window, spam score | Root-cause fix, existing backlog | STR-6, STR-14 | Both tickets are Urgent, both in Backlog — prerequisite: pick ONE to progress; the cluster suggests a previous fix (STR-8 Done) didn't hold |
| 2 | Add an in-app password reset fallback — if email hasn't arrived in 2 min, show "resend" + "contact support" CTA with a one-time recovery code surface | User-visible loop closer | — (new ticket) | Treats the observable user pain (20-min lockout) even if root cause isn't immediately fixable |
| 3 | Wire a `password_reset_requested` event and a `password_reset_completed` event; build a trend that alerts when delivery rate drops | Instrument (learn more) | — | Pre-req for measuring whether fixes actually work |
| 4 | Rate-limit investigation + audit logs on the send pipeline | Short-term patch / diagnostic | STR-8 (Done — but read history) | Do alongside #1 |

Recommended solution order for this opportunity: **#1 → #3 → #2 → (4 in parallel)**. Fix root cause first, add measurement so we know if the fix held, then add user-visible fallback for the inevitable edge cases.

### Solutions for O-2 (no first-run experience / instrumentation)

| # | Solution | Type | Linear tie | Notes |
|---|---|---|---|---|
| 1 | 1-week spike: trace what a new user actually sees after `user_registered`. Is there a `/onboarding` route wired? Is it skipped? Is it designed? Close the ambiguity before sizing anything else | Act + Instrument (triage) | — (new ticket) | **Prerequisite** for this opportunity. Without this, we're picking solutions blind |
| 2 | If onboarding exists but is skippable: add a one-screen "Log your first activity" CTA gated behind registration, with an explicit `first_activity_cta_shown` / `_clicked` event pair | Ship new work, root-cause fix | — (new ticket) | Contingent on the spike result |
| 3 | If no onboarding exists: design minimum viable first-run — "Welcome, connect a device or log manually, see your feed populate." Scope: 1 screen + 1 event pair. | Ship new work, long-term structural | — (new ticket) | Contingent on the spike result; pair with product design |
| 4 | Fix canonical signup event as a prereq (Housekeeping H-1) before running any A/B on this opportunity, otherwise the experiment population is undefined | Instrument | H-1 | Cross-opportunity dependency |

Recommended solution order: **#1 (spike) first — do not skip.** Then #2 or #3 based on what the spike finds. #4 moves in parallel as a dependency.

---

## 6. Shelved signals

Signals investigated that did not survive interrogation. Kept here so future runs don't re-discover them.

| ID | Signal | Why shelved | What would unshelve it |
|---|---|---|---|
| S-1 | /auth rageclicks (3 on 6 pageviews, 50% rate) | N=3 is anecdotal; cannot distinguish from noise at this volume | 10+ rageclicks in a widened window (60d) **or** session replays showing a specific click target **or** an Intercom theme matching (currently zero) |
| S-2 | 3 → 46 jump in `user_registered` prior-30d vs current-30d | Cannot attribute without annotations access | Re-run with `annotations-list` permission to correlate against releases/campaigns |
| S-3 | Intercom `challenge-progress` theme (4 convos) | All users are already active (logging activities). Not activation-class. | Would promote if pattern shifts to new users within first 30 days |
| S-4 | Intercom `app-crash` theme (4 convos) | All users reference prior history; one self-identifies as premium. Retention signal, not activation. | Promotes to activation if a new-user crash-on-first-activity thread emerges |
| S-5 | Intercom `gps-drift` (4) and `kudos-missing` (3) | Not on the activation path at all | N/A for this outcome |
| S-6 | STR-75 / STR-79 Lucia auth migration | Tech debt that *could* affect signup friction indirectly, but neither description references new-user issues; no outcome-tied hypothesis | A ticket comment or bug report linking Lucia migration to signup failures |

---

## 7. Housekeeping / measurement hygiene

**Not competing with opportunities for this sprint.** Listed so the team knows; pick up as capacity allows, BUT H-1 is a genuine prerequisite — until it's resolved, the team cannot measure whether any activation opportunity moved the needle.

| ID | Item | Severity | Effort | Notes |
|---|---|---|---|---|
| H-1 | Resolve `user_signed_up` vs `user_registered` duplicate-event confusion. Pick one canonical. Backfill or alias the other. Document in the workspace. | **Blocker for measurement** of this outcome | S | Without this, the activation rate itself is tool-dependent — any dashboard on `user_signed_up` shows ~0, any on `user_registered` shows 46. Prerequisite for both O-1 and O-2 measurement |
| H-2 | Investigate why `/onboarding` has 1 pageview and `onboarding_completed` has 1 event in 30 days. Is the route wired? Is the event wired? (Overlaps with Opportunity O-2 solution #1, but framing here is "measurement readiness" not "product decision") | Measurement blocker | S | |
| H-3 | `$device_type` is empty on events — cannot do device-cohort breakdowns on the funnel. Check PostHog SDK init | Measurement gap | S | |
| H-4 | Regain `mcp__linear__get_issue` and `mcp__posthog__annotations-list` permissions for discovery runs. Several Step-3 adjacency checks could not complete. | Tooling gap for discovery | S | |
| H-5 | Intercom workspace appears to have only 82 conversations, all timestamped within a narrow recent window. Verify this is a real support dataset vs seeded test data before relying on volume-based floors. | Data quality question | S | If it's seed data, all Intercom floors in `prioritization.md` need re-grounding |

---

## 8. Sequencing recommendation

### Next sprint (this week)

1. **H-1: Resolve the duplicate signup event.** (S, Housekeeping — prerequisite). Without it, you can't measure whether anything else moved.
2. **O-2 solution #1: 1-week spike on the first-run experience.** (S, Opportunity O-2). We genuinely don't know whether there's an onboarding flow at all; figure that out before sizing a fix.
3. **O-1 solution #1: Progress STR-6 or STR-14 on password-reset email deliverability.** (M, Opportunity O-1). One of these Urgent tickets has been open 75+ days — move it.

### Following sprint

4. Depending on O-2 spike outcome: ship #2 (CTA to first activity) or scope #3 (first-run design).
5. O-1 solution #3: wire password-reset event pair so we can detect regression if STR-8-style fix-break cycle repeats.
6. H-2, H-3 alongside.

### Do NOT do this sprint

- Ship any experiment on activation before H-1 lands. You will not be able to tell if it worked.
- Expand the opportunity list beyond these 2 based on /auth rageclicks (S-1) — volume is too thin.
- Chase the `challenge-progress` / `app-crash` / `gps-drift` Intercom clusters under the activation banner — those are retention/engagement signals. They may be real opportunities against a *different* outcome; they are not evidence for this one.

---

## 9. Appendix — key PostHog links

- Event counts 30d: https://us.posthog.com/project/391447/insights/new (see TrendsQuery ActionsTable in run log)
- Registered → First activity funnel, 30d window: see run log, PostHog URL in query response
- Pageview by pathname 30d: see run log
- Rageclick by pathname 30d: see run log

All queries used in this discovery are replayable from the `_posthogUrl` fields in the query-run responses captured during this session.
