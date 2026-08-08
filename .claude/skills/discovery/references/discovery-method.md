# The discovery method

The structural logic this skill operates on. Not branded to any framework — just a layered way to keep PM judgment honest.

## The layers

```
                 Outcome
                    |
       +------------+------------+
       |            |            |
  Opportunity  Opportunity  Opportunity    ← rank these
       |            |            |
    +--+--+      +--+--+      +--+--+
    |     |      |     |      |     |
   Sol   Sol    Sol   Sol    Sol   Sol     ← also rank, but within each opportunity
```

1. **Outcome** — a measurable business result. Given as input.
2. **Opportunity** — a problem worth solving, phrased in the user's voice where possible.
3. **Solution** — a specific thing to build, ship, or change to address an opportunity.

## Why the opportunity layer matters

Most teams skip it. They go outcome → solutions ("activate more users → build an onboarding tour"). The risks:

- Commit to one solution before considering alternatives.
- Solve a symptom, not a root cause.
- Can't explain *why* a solution should work — only that someone is building it.

The opportunity layer forces *what problem is worth solving?* before *how?*. It also creates space for multiple solution candidates to compete on merit within each opportunity.

## What makes a good opportunity

- **User-framed.** "First-activity uploads silently fail for device users" > "fix the sync bug."
- **Wide enough for multiple solutions.** If only one solution fits, the opportunity is phrased too narrowly.
- **Distinct from other opportunities.** Two opportunities that share all their evidence should probably be one.
- **Rooted in interrogated evidence.** Each opportunity cites at least one signal that survived a baseline check, an adjacency query, or a cross-tool corroboration. See SKILL.md Step 3.
- **Moves the outcome.** If you solved this opportunity, would the outcome measurably move? If not, it doesn't belong under this outcome.

## What makes a bad opportunity

- **Built from a single thin signal.** 3 events, 1 user, or 2 tickets is a prompt to investigate, not a finding.
- **Restated as a solution.** "Add password reset flow" is a solution. The opportunity behind it is something like "users locked out can't recover access in time to activate."
- **Generic.** "Improve onboarding" is a category, not a problem. Specificity earns the opportunity layer its keep.
- **Padding.** If you're claiming 8 opportunities and only 4 have real evidence, the other 4 dilute the rest.

## Two kinds of gaps — handle them differently

A useful finding type, but the two flavors don't belong in the same place in the artifact:

**Product gaps** (treat as ranked opportunities):
- Themes with signal in Intercom or PostHog but **zero tickets in Linear** — the team isn't working on a real customer problem. Search 3–4 phrasings before declaring the gap.

**Instrumentation gaps** (route to `Housekeeping` — never to ranked opportunities):
- Events tracked in PostHog but **no dashboard or alerts**.
- Duplicate or sibling events firing at very different volumes (data is confused).
- Outcomes the company cares about but **no measurement framework** behind them.

Why split them: instrumentation gaps move no customer value by themselves. They're hygiene. If they sit alongside product opportunities in a ranked list, the ranking implicitly says "the dashboard you don't have is more important than the broken signup flow," which is almost never true. Note them — but in their own section.

## How many of each?

- **3–6 opportunities** per outcome. After interrogation, fewer is fine — say so rather than padding.
- **2–4 solutions** per opportunity. Fewer means no real choice; more means diluted thinking.

## Framing language

Good opportunity statements often follow these patterns:

- *"[User segment] can't [action] because [barrier]."*
- *"[User segment] doesn't [action] even though [motivation exists]."*
- *"We don't know whether [assumption] — we haven't [instrumented/asked]."*

The third pattern is how you surface observability holes as opportunities.
