# Spec: Billing & Cancellation UX
**Opportunity:** Users can't cancel premium or resolve billing errors — UI too buried  
**Effort:** S (≤1 week) | **Impact:** HIGH | **Confidence:** MEDIUM

---

## Problem

Users who want to cancel premium can't find how to do it. Several spend a week looking before writing in to support. Users who were double-charged don't know how to dispute it or request a refund without contacting support.

Both issues generate avoidable support load and, for cancellation, accelerate churn — a user who can't cancel often disputes the charge with their bank instead, which is worse.

**Evidence:**
- Intercom: ~6 conversations in a single 50-convo sample (estimated ~24 total) on billing/cancellation, the #4 support theme overall
- Quote: *"I've been trying to cancel my premium membership for the last week but I can't find where to do it in settings. I'm getting charged again next month and I don't want to be billed if I'm not using the app anymore."*
- Quote: *"Charged €9.99 twice this month"* — user didn't know how to resolve it in-app
- PostHog: cancellations (3) outnumbered new subscription starts (2) in 28 days — directional
- Linear: STR-22 ("Premium subscription cancellation UI not discoverable") and STR-25 ("Duplicate premium subscription charge") were filed and marked Duplicate — the underlying originals should be found and tracked

---

## Goals

1. A user who wants to cancel premium finds the option without contacting support.
2. A user who was charged incorrectly can see their billing history and initiate a refund or dispute in-app.
3. Support volume on billing/cancellation themes drops measurably.

---

## Non-goals

- Reducing cancellation rate through persuasion flows (save offers, pause prompts) — that's a retention play, not this spec. Could be added later.
- Rebuilding the billing backend or payment processor integration.

---

## What to build

### 1. Cancellation — surface the option

**Current:** Cancellation is buried or missing from the expected location (Account > Billing or Account > Subscription).

**Change:** Add a clearly labeled "Cancel subscription" link at the top level of Account > Subscription. No hiding behind a "Manage plan" sub-menu.

Acceptance criteria:
- User can reach the cancellation flow in ≤2 taps from the account screen.
- Cancellation confirmation shows: when access ends, what they'll lose, a single confirm button.
- After confirming, user sees a success state with the access end date.
- Cancelled status is immediately reflected in Account > Subscription (no stale cache — check against STR-31 pattern).

### 2. Billing history — make charges visible

**Current:** Users who see an unexpected charge have no in-app way to review what they were charged or when.

**Change:** Add a "Billing history" section under Account > Subscription showing the last 12 months of charges: date, amount, description, status (paid / refunded / failed).

Acceptance criteria:
- Each line item shows charge date, amount, and plan name.
- If a charge is duplicated (same amount, same plan, within 24h), it is visually flagged.

### 3. Refund / billing issue — give users a path

**Current:** Users with billing problems have no in-app action; they email support or dispute with their bank.

**Change:** Add a "Report a billing issue" link on the billing history screen that opens a pre-filled support message: user ID, charge date, amount pre-populated from the selected transaction. Routes to Intercom.

Acceptance criteria:
- Link is visible on billing history.
- Tapping it opens a support thread with charge metadata pre-filled.
- Does not require user to re-type their account details.

---

## Out of scope

- Pause subscription (worth considering for V2 as a cancellation alternative).
- Prorated refund calculation in-app.
- Self-serve refund processing (requires payment processor integration work).

---

## Open questions

1. **Where are the canonical originals of STR-22 and STR-25?** Both were marked Duplicate — find the parent tickets before starting implementation to avoid rework.
2. **What is the actual cancellation flow today?** Walk through it before designing the fix — the issue may be a missing nav link vs. the flow itself being broken.
3. **Does the duplicate charge bug have a known root cause?** If the idempotency issue is unresolved, the billing history view will surface it more visibly — coordinate timing with the backend fix.

---

## Success metrics

- Support conversations on billing/cancellation themes drop by ≥50% in the 30 days after ship.
- Zero users who cancel premium contact support to confirm it worked.
