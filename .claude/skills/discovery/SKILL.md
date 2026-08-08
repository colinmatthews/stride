---
name: discovery
description: Use when the user is doing PM discovery work — translating a business outcome into prioritized opportunities and then prioritized solutions using Linear, PostHog, and Intercom data. Activates when the user mentions "discovery", "opportunity", "roadmap", "what should we build next", or gives a business outcome and asks for priorities. Two disciplines the skill enforces and you MUST NOT skip: (1) prioritize at each level — outcome → opportunities → solutions, never just at the solution level; (2) interrogate every signal before calling it an opportunity — thin data produces thin opportunities, so widen the window, run adjacent queries, and cross-check across tools before assigning confidence.
---

# Discovery — from business outcome to prioritized roadmap

Turn Linear + PostHog + Intercom data into a PM-ready prioritized roadmap. The point is not to jump to solutions. The point is to enforce the **opportunity layer**, where signal clusters into problem statements that the team can then generate multiple solutions against — and prioritize at each level.

## When to use

Triggers include:

- "Let's do discovery on X."
- "Given [outcome], what should we work on?"
- "What are the top opportunities for [metric]?"
- "Pull the last N days from Linear/PostHog/Intercom and tell me what to focus on."

Don't use for: one-off data pulls, single-tool queries, or "just tell me what the support tickets say" — those don't need the opportunity scaffolding.

## Two disciplines this skill enforces

### 1. Prioritize at each level

| Layer | What it is | Prioritization |
|---|---|---|
| Outcome | The measurable business result you're moving | Set by leadership; this skill takes it as input |
| **Opportunities** | **Problems worth solving that would move the outcome** | **Rank these before generating any solutions** |
| Solutions | Concrete ways to address an opportunity | Rank within each opportunity |

Jumping from outcome → solutions skips the thing that matters most: *are we sure this is the right problem to solve?* Opportunities are where PM judgment lives.

### 2. Interrogate signals before promoting them to opportunities

Finding a signal is not the same as finding an opportunity. A thin signal — 3 rageclicks, 1 angry user, 2 tickets on a theme — is a prompt to investigate, not a conclusion. Before you write an opportunity:

- **Compare to a baseline.** Is 3 rageclicks on `/auth` above the site-wide rageclick rate? Or is every path getting 2–5 rageclicks and `/auth` is noise?
- **Run the adjacent query.** A rageclick cluster justifies a session replay. A funnel drop justifies a cohort breakdown. A support theme justifies pulling the full conversations for the top 2–3 cases.
- **Triangulate across tools.** A signal that appears in only one tool is weaker than a signal that appears in two. Always ask: *does the other side of this story show up?*
- **Respect sample size.** See `references/prioritization.md` for hard floors. Do not call anything HIGH confidence below the thresholds.

This discipline is slower than flipping every signal into an opportunity. That is the point.

## Bundled references

Load as needed — don't read all of them on every run:

- `references/discovery-method.md` — the layered method (outcome → opportunities → solutions) without framework branding
- `references/linear-navigation.md` — efficient Linear queries + how to interrogate a Linear finding before promoting it
- `references/intercom-navigation.md` — efficient Intercom queries + how to interrogate a support theme
- `references/posthog-signals.md` — outcome → signal recipes, AND a section on adjacency queries (session replay, cohort breakdowns, baseline comparison) for interrogating PostHog signals
- `references/prioritization.md` — scoring with hard sample-size floors for confidence ratings

## Workflow

### Step 1. Anchor on the outcome and run a preflight check

Every run starts with a specific, measurable business outcome. Examples:
- "Lift 3-day new-user activation rate"
- "Reduce support conversation volume by 30%"
- "Improve free → paid conversion within 14 days of signup"
- "Increase weekly retention at week 4"

If the user hasn't given you one, propose 2–3 defaults informed by what you see in their tools. Don't guess — ask.

**Preflight has two checks:** (a) window size, (b) instrumentation sanity.

**(a) Is the window big enough for the outcome?** Each outcome has a natural cycle:

| Outcome class | Useful minimum window |
|---|---|
| Activation (signup → first value) | 2–4 weeks for stable rates; <1 week is directional only |
| Week-N retention | At least N + 2 weeks |
| Support deflection | 2 weeks for theme stability |
| Free → paid conversion | At least 2× the trial length |
| Engagement depth | 4 weeks minimum |

If the user has asked for a tighter window than the outcome supports, **say so explicitly** and flag everything as "directional, not a baseline." Don't quietly produce confident-looking rates from N=1.

**(b) Is the instrumentation trustworthy?** Before trusting any numbers:

- Look for duplicate-or-similar events (e.g. `user_signed_up` vs `user_registered`, `purchase_completed` vs `checkout_succeeded`). Use `event-definitions-list` to scan. If two similarly-named events diverge significantly in volume, the instrumentation is confused — the headline finding is *that*, not any downstream rate.
- Check that entry events for the outcome's funnel have credible volume (≥30 in the window). If the canonical entry event is sub-threshold but a sibling event has volume, surface the mismatch as a preflight warning and run qualitatively.
- If **every funnel in the workspace is sub-threshold**, the finding IS that traffic is too low for quantitative discovery. Pivot to qualitative-only — Intercom themes, Linear backlog gaps, direct user conversations. Don't keep computing borderline rates.

Broken or confused instrumentation is a **methodology blocker**, not an opportunity. It prevents computing rates you can trust. Surface it here, at the top of the artifact, and continue qualitatively.

### Step 2. Pull initial signal from each tool

Read `references/posthog-signals.md` for the signal recipe that matches the outcome. Pull from each tool in parallel where possible. Use the navigation references — **do not** dump `list_issues` or `search_conversations` without scope.

For each tool:
- **PostHog**: funnel for the outcome's causal chain; trends for the rates; rageclicks / web vitals for friction; paths if navigation matters.
- **Linear**: projects relevant to the outcome; recent issues on the outcome's theme; explicit backlog gaps. Target queries, don't dump.
- **Intercom**: conversations tagged or themed around the outcome; grep AI Titles for theme counts; pull full bodies only for the top cluster.

### Step 3. Interrogate every signal before promoting it

This is the step most likely to be skipped. Don't.

For each candidate signal you found in step 2, run at least one **adjacent query** before treating it as evidence:

| Signal type | Mandatory adjacency check |
|---|---|
| Rageclick or friction cluster on a path | Compare count to baseline (other paths over same window). Run a session replay or paths query for the top 2–3 sessions. |
| Funnel drop | Breakdown by cohort (device, browser, locale, signup source). Compare to a 28-day baseline — is this a regression or steady state? |
| Single Intercom theme | Pull full bodies of the top 2–3 conversations. Check `conversation_rating_score` and `ai_agent_resolution_state`. Widen the window 2–4× and check if the theme persists. |
| Linear ticket cluster | `get_issue` on the most-referenced one to read full description, comments, and linked work. Verify it's not already shipped or duplicated against a fix. |
| Backlog gap (no tickets on a theme) | Search adjacent terms (signup → onboarding → first-run → welcome → activation) before declaring a gap. |
| Low event volume | Cross-check `$pageview` to confirm users are even reaching the step. Low volume might be an upstream funnel problem, not a signal. |

A signal that survives interrogation graduates to **evidence**. A signal that doesn't survive gets noted as "investigated, insufficient" — keep the audit trail; future runs benefit.

### Step 4. Cluster surviving evidence into opportunities

An opportunity is a **problem worth solving that moves the outcome through customer value**. Good opportunities are:

- **User-voiced** where possible — borrow language from Intercom quotes and PostHog friction patterns.
- **Distinct from solutions** — "users can't finish auth" is an opportunity; "ship password reset fix" is a solution.
- **Wide enough to admit multiple solutions** — if only one solution fits, the opportunity is phrased too narrowly.
- **Backed by interrogated evidence** — every opportunity cites at least one signal that survived step 3.

Aim for 3–6 opportunities. If you have fewer than 3 after interrogation, the data isn't supporting more — say so rather than padding.

**Non-obvious opportunities** — watch for backlog gaps (themes with zero Linear tickets across 3–4 phrasings of the search). Those can be high-leverage product opportunities.

**What is NOT an opportunity** (route to a separate `Housekeeping` section in the artifact, never into the ranked opportunity list):

- **Instrumentation work** — dashboards, event cleanup, duplicate-event resolution, alerts. This is measurement hygiene / tech debt. It enables you to *see* customer value moving; it doesn't move customer value itself. Ranking it #1 tells the team "our top priority is dashboards," which is almost never true.
- **Tech debt** without a specific customer-outcome tie.
- **"We should measure X"** without a product-facing hypothesis behind it.

Instrumentation findings still belong in the artifact — they affect how confident downstream work can be — but they live in a separate section beside the ranked opportunities, not within them.

### Step 5. Prioritize opportunities

Use the scoring approach in `references/prioritization.md`, which has explicit floors:

- **Impact**: LOW / MEDIUM / HIGH (how much this would move the outcome if fully solved)
- **Confidence**: LOW / MEDIUM / HIGH — **subject to sample-size floors in `prioritization.md`**. HIGH requires multi-tool triangulation AND volume above the threshold. Most opportunities should be MEDIUM until proven HIGH.
- **Effort**: S (≤1 week) / M (1–4 weeks) / L (>4 weeks)

Rank. Apply sequencing overrides: prerequisites (e.g. "build the dashboard before measuring lift") go first regardless of score.

### Step 6. Generate and prioritize solutions

For each opportunity (in ranked order), generate **2–4 candidate solutions**. Vary along axes:

- **Ship existing backlog** vs **ship new work**
- **Root-cause fix** vs **close the loop from the user's POV** (when root cause is too expensive)
- **Instrument** (learn more) vs **act**
- **Short-term patch** vs **long-term structural**

Then rank solutions within each opportunity using the same Impact × Confidence ÷ Effort rubric. Cite Linear ticket IDs for any solution that maps to existing work.

## Output shape

A single markdown document structured like `examples/2026-04-22-stride-activation.md`. Minimum sections:

1. **Preflight findings** — window adequacy + instrumentation sanity. If either fails, this is the headline.
2. **Signal inventory** — what each tool returned, compact. Quote users where possible.
3. **Interrogation pass** — table of signals checked, what survived, what got shelved.
4. **Opportunities (product, ranked)** — one row per opportunity with Impact / Confidence / Effort. Product-facing only.
5. **Per-opportunity solution tables** — solutions ranked within each opportunity.
6. **Shelved signals** — what didn't survive interrogation, with "what would unshelve them" notes.
7. **Housekeeping / measurement hygiene** — instrumentation gaps, dashboards to build, event cleanup, tech debt. **NOT ranked alongside opportunities.** Listed because the team should know, not as competitors for the next sprint.
8. **Sequencing recommendation** — what to do this sprint / next sprint.

Save the artifact to `discovery-runs/<YYYY-MM-DD>-<outcome-slug>.md` in the repo (or wherever the user prefers). Timestamped files build a history of discovery judgments that future runs can learn from.

## Example

`examples/2026-04-22-stride-activation.md` — a full sample run against the Stride (Strava clone) codebase for the outcome "lift 3-day activation rate." Read it to see the output shape concretely.
