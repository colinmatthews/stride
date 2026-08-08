# Prioritization for discovery

How to rank opportunities and solutions without drowning in spreadsheets, AND with hard floors that prevent thin signals from getting confident-sounding ratings.

## Two levels, two prioritizations

- **Opportunity-level ranking** — which problem is most worth solving?
- **Solution-level ranking (within each opportunity)** — given we're solving this problem, which approach first?

Never collapse the two levels into a single "top 10 solutions" list. That loses the discipline of opportunity selection.

## The rubric: Impact × Confidence ÷ Effort

A light variant of standard scoring. Reach is usually implicit at the opportunity level (the outcome's target population), so we drop it.

| Dimension | Meaning | Scale |
|---|---|---|
| **Impact** | How much this would move the outcome if fully realized | LOW / MEDIUM / HIGH |
| **Confidence** | Strength of the evidence behind the claim | LOW / MEDIUM / HIGH (subject to floors below) |
| **Effort** | Estimated cost to make a meaningful dent | S (≤1 week) / M (1–4 weeks) / L (>4 weeks) |

Don't produce numeric scores. Bands are good enough and force qualitative judgment.

## Confidence has hard floors — read carefully

The biggest failure mode of this skill is calling a thin signal "HIGH confidence." Apply these floors strictly:

### HIGH confidence requires ALL of:

- **Multi-tool triangulation** — the same problem appears in at least 2 of {PostHog, Linear, Intercom}.
- **Volume threshold met in at least one tool**:
  - PostHog: ≥30 events of the relevant type in a window where 30 is meaningful (or a baseline-comparison showing this metric is ≥2× the typical rate)
  - Intercom: ≥5 conversations on the theme, AND at least one is escalated to a human or rated low
  - Linear: ≥3 distinct tickets on the theme (not duplicates of the same root cause)
- **An adjacency check has been run** (session replay, cohort breakdown, full-body conversation read, or `get_issue` detail fetch — see SKILL.md Step 3).

### MEDIUM confidence:

- Single tool with solid volume (e.g. 10+ Intercom convos, but no PostHog corroboration), OR
- Two tools with thin signal each that align in direction.

### LOW confidence:

- Single tool, single source, or signal close to baseline noise.
- Use this when you have a *hypothesis*, not a finding.

### INSUFFICIENT (don't promote to opportunity):

- <5 Intercom conversations + <10 PostHog events + 0 Linear tickets.
- A single user complaint without corroboration.
- A funnel rate calculated on N < 10 at the entry step.

When evidence is INSUFFICIENT, **don't pad an opportunity**. Note it as "investigated, insufficient signal — needs more data." That's a real finding too.

## What is never an opportunity (route to `Housekeeping` instead)

A finding can be true and important but still not belong on the ranked opportunity list. Always route these to a separate "Housekeeping / measurement hygiene" section of the artifact, never into the top-ranked opportunities:

- **Instrumentation work** — dashboards, event cleanup, duplicate-event resolution, alerting, funnel definitions. This enables you to *see* whether customer value is moving; it doesn't move customer value itself. Ranking it #1 tells the team "our top priority is dashboards," which is almost never true.
- **Generic tech debt** without a specific customer-outcome tie.
- **"We should measure X"** as a standalone item — without a downstream product hypothesis behind it.

There's one exception that's not an opportunity either, but a louder finding: **broken or duplicated entry events that make rates untrustworthy** (e.g. `user_signed_up` fires once while `user_registered` fires 46×). That's a methodology blocker — surface it as a top-of-artifact preflight warning, not in either the opportunities or the housekeeping list. Until it's resolved, you can't compute the rates that other opportunities would be measured against.

## Semantic-cluster theme counting

When counting Intercom evidence toward the floors, you can sum across **semantically equivalent AI Titles** that point at one root cause — not just literal title repetition. Example:

> "Activity not syncing" (2) + "Activity not showing" (3) + "Garmin missing" (4) + "Workout disappeared" (4) = 13 conversations on one root cause.

This counts toward the ≥5 threshold once, for the clustered theme.

The test for whether two titles cluster: **read 2–3 full bodies from each.** If the user stories describe the same underlying problem at the same user-facing layer, they cluster. If they describe different problems that happen to share a noun, they don't.

When in doubt, don't cluster. Loose clustering masks which problem is actually dominant and lets weak themes hitchhike on stronger ones.

## What does NOT count as evidence

- **3 events of anything** — that's an anecdote.
- **One vocal user** — one user, not a theme.
- **A Linear ticket existing** — a ticket existing ≠ the problem is solved (or unsolved). Read the ticket state.
- **Time-bounded windows shorter than the outcome's natural cycle** — e.g. 3 days for week-2 retention. Don't infer rates.
- **Absence of evidence** without a search — "no tickets on activation" requires searching ≥3 adjacent terms before claiming a gap (see SKILL.md Step 3).

## Sequencing beats scoring

Pure score ranking misses structure. Apply these overrides:

1. **Prerequisites first.** If Opportunity A unlocks measurement for B/C/D (e.g. "build the funnel dashboard"), A goes first regardless of score.
2. **Quick wins early.** A MEDIUM-impact / SMALL-effort opportunity often beats a HIGH-impact / LARGE-effort one for the first sprint — momentum matters.
3. **Biggest lever last (or spread).** A HIGH / HIGH / LARGE opportunity warrants its own multi-sprint plan, not a cramming attempt.

## Solution-level prioritization

Within each opportunity, vary solutions along these axes:

- **Ship existing backlog** (accelerate an Urgent-priority ticket) vs **ship new work**
- **Root-cause fix** vs **user-visible loop closer**
- **Instrument** (learn more) vs **act** (change the product)
- **Short-term patch** vs **long-term structural**

Good solution tables are **short** (2–4 options) and **annotated** — cite Linear ticket IDs where relevant.

## Discovery gap weighting

Opportunities that surface **discovery gaps** often score MEDIUM on raw Impact but HIGH on strategic leverage. Add a notes column:

| Opportunity | Impact | Confidence | Effort | Notes |
|---|---|---|---|---|
| Activation instrumentation | MED | MED | S | **Prereq — blocks measurement of every other opportunity** |

Explicit "prereq" or "gap" notes beat numeric scores for communicating sequencing logic to stakeholders.

## Anti-patterns

- **Solution-first discovery.** "We should build X" without a parent opportunity. Reject. Ask what problem X solves.
- **Opportunity padding.** Claiming 8 opportunities when the signal supports 4. Padding dilutes ranking.
- **Asymmetric effort estimates.** Calling every solution "Medium" means you haven't thought about effort. Force some S and some L.
- **Confidence inflation.** "HIGH confidence" on a single Intercom quote or 3 rageclicks is wrong. Apply the floors above.

## When to involve the user

- **Outcome selection** — always.
- **Impact estimates** — sanity-check with the PM before finalizing.
- **Effort estimates** — sanity-check with engineering.
- **Opportunity framing** — share the list before drafting solutions. Misframed opportunities cascade into misaligned solutions.
- **Whenever the data is INSUFFICIENT** — surface it instead of producing a confident-looking artifact from thin air.
