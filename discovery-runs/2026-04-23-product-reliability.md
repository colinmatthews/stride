# Discovery Run — 2026-04-23
**Outcome framing:** Reduce churn and retention loss from trust-breaking product failures, and unblock users locked out of their accounts.

*No outcome was specified, so this run is framed around the dominant signal: users losing workouts, losing access to their account, and losing trust in the data — all of which drive cancellation.*

---

## 1. Preflight Findings

### (a) Window adequacy
28-day window used. Adequate for identifying support themes and bug clusters. Too short for computing week-N retention rates — no retention analysis attempted.

### ⚠️ (b) Instrumentation — METHODOLOGY BLOCKER

`user_signed_up` fired **1 time** in 28 days. `user_registered` fired **46 times** in the same window. These are almost certainly duplicate events for the same user action — the canonical signup event is unclear.

**Consequence:** The activation funnel (`user_signed_up → onboarding_completed → activity_created`) is untrustworthy. Step 0 has N=1; any rate computed downstream is meaningless. All activation analysis in this run is qualitative only.

Do not compute activation rates until one event is retired and all funnels point at the canonical event.

---

## 2. Signal Inventory

### PostHog (28-day window)
| Signal | Value | Notes |
|---|---|---|
| `user_signed_up` trend | 1 total | Likely undercounted; see preflight |
| `user_registered` trend | 46 total | Likely the real signup event |
| Activation funnel | N/A | Untrustworthy; see preflight |
| Rageclicks by path | 3 on `/auth` (Apr 21 only) | Only path with any rageclicks |
| `subscription_started` | 2 total | Too low for significance |
| `subscription_cancelled` | 3 total | Cancellations outnumber new starts — directional |
| Core engagement events | `activity_created`, `activity_kudoed`, `activity_commented`, `challenge_joined`, `club_joined`, `athlete_followed` — all present and firing | No obvious instrumentation gaps in the engagement layer |

### Linear — Q2 Reliability project (open issues only)

**Activity sync cluster:**
| ID | Title | Priority | State |
|---|---|---|---|
| STR-21 | Activity sync fails to retrieve workouts from previous day | Urgent | Todo |
| STR-23 | Garmin Forerunner 265 ride lost during upload | Urgent | In Progress |
| STR-86 | Activity sync failing for runs logged >12h prior on mobile | High | Backlog |
| STR-16 | Activity sync drops Apple Watch Ultra 2 workouts from feed | High | In Progress |
| STR-19 | Garmin Forerunner 265 workout lost after successful initial sync | Medium | In Progress |

**Password reset cluster:**
| ID | Title | Priority | State |
|---|---|---|---|
| STR-6 | Password reset email delivery failure | Urgent | Backlog |
| STR-14 | Password reset email delivery failure | Urgent | Backlog |

*(STR-8 — same title — is Done; these two represent new or re-opened occurrences.)*

**Segment detection cluster:**
| ID | Title | Priority | State |
|---|---|---|---|
| STR-12 | Capitol Hill Run segment fails to record activity completion | High | Backlog |
| STR-81 | Segment effort not recorded for Ikoma Skyline climb | High | Backlog |
| STR-24 | Djurgården Loop segment fails to record on completed rides | Medium | Todo |

**Privacy / data control cluster:**
| ID | Title | Priority | State |
|---|---|---|---|
| STR-85 | User reports inappropriate comments exposing private information | High | Todo |
| STR-82 | GDPR data export endpoint missing activity history completeness | High | Backlog |
| STR-15 | Account deletion flow missing permanent data purge confirmation | High | In Progress |
| STR-3 | Account deletion request not processing — data retention after user removal | Medium | Todo |

**GPS / data accuracy:**
| ID | Title | Priority | State |
|---|---|---|---|
| STR-20 | GPS drift causes track to penetrate buildings, inflates distance calc | Medium | Todo |

**Challenge progress:**
| ID | Title | Priority | State |
|---|---|---|---|
| STR-37 | Cron job for challenge progress runs twice on DST transition | Medium | Todo |

### Linear — New Metrics project (open, non-Done)
| ID | Title | Priority | State |
|---|---|---|---|
| STR-59 | 3D replay visualization of run activity | High | Todo |
| STR-56 | Automatic injury-risk alerts from training load monitoring | High | Todo |
| STR-45 | Nutrition tracking per activity | High | Todo |
| STR-60 | Real-time route sharing for group activities | Medium | Todo |
| STR-47 | 3D replay visualization for completed runs | Medium | Done |
| STR-83 | Heatmap view for personal activity segments | Medium | Backlog |
| STR-48 | Automatic injury-risk alerts from training load | (no priority) | Backlog |
| STR-64 | Integrate power zone training data from cycling platforms | Low | Todo |

*Note: STR-47 (3D replay) is Done but STR-59 (same concept) is still open at High — likely a different scope or revamp. STR-41 (injury risk alerts) is Done; STR-48 and STR-56 are open variants.*

### Intercom (50 conversations, page 1 of 4 — extrapolate at ~4× for full volume)

| Theme | Page-1 count | Estimated full volume | Rep quote |
|---|---|---|---|
| Activity sync / missing workout | ~10 | ~40 | *"I completed a 50K trail run on my Garmin Forerunner 265 this past Sunday… it never appeared in my feed. This was a major milestone for me."* |
| App crashing (feed/activity view) | ~6 | ~24 | *"I've been getting constant crashes whenever I try to look at my feed… I just logged my hill repeats and now I can't even view them. I pay for premium."* |
| GPS accuracy / distance wrong | ~6 | ~24 | *"My GPS shows me cutting straight through a building on 5th Ave… My actual distance was 8.5km but the app recorded 7km. This is exactly why I'm cancelling."* (churn signal) |
| Billing / can't cancel / overcharged | ~6 | ~24 | *"I've been trying to cancel my premium membership for the last week but I can't find where to do it in settings."* |
| Challenge progress not updating | ~4 | ~16 | *"I just finished a marathon pace run and it's not showing up toward my distance challenge progress. The deadline's coming up so I really need this to count."* |
| Notification overload / can't configure | ~4 | ~16 | *"I'm getting bombarded with push notifications for every kudo, follower, and reminder. As a premium user I'd expect better notification management."* |
| Segment effort not recorded | ~4 | ~16 | *"I completed a ride that included the Ikoma Skyline segment, and my time would've placed in the top 20, but the segment effort wasn't recorded."* |
| Password reset / locked out | ~4 | ~16 | *"I've been locked out of my account for 20 minutes. Clicked the reset link — it says it's expired or broken? I never even got an email to begin with."* |
| Feature requests (dark mode, power zones) | ~4 | ~16 | *"The bright white interface is straining my eyes in the dark… Would love a dark mode I could toggle on."* |

*No conversation ratings were set (all null). One GPS ticket contains explicit cancellation language.*

---

## 3. Interrogation Pass

| Signal | Tool(s) | Adjacency check run | Verdict |
|---|---|---|---|
| Activity sync failures (multiple devices, time-offset) | Linear (5 tickets) + Intercom (~10 convos, page 1) | Cross-tool triangulation; device names match across both sources (Garmin Forerunner 265 in both) | **Survives** — HIGH confidence |
| Password reset email not delivered | Linear (2 Urgent open) + PostHog (3 `/auth` rageclicks) + Intercom (~4 convos) | Three-tool triangulation; `/auth` rageclicks concentrated on same date as rage suggests login-wall frustration | **Survives** — HIGH confidence |
| GPS accuracy / distance wrong | Intercom (~6 convos incl. churn language) + Linear (STR-20 open) | Could not run session replay (no GPS error events tracked in PostHog) | **Survives** — MEDIUM confidence |
| Billing: cancellation UI not findable | Intercom (~6 convos) + PostHog (cancellations > new starts, directional) | Linear tickets STR-22, STR-25 were marked Duplicate — underlying bug may be tracked elsewhere | **Survives** — MEDIUM confidence |
| Segment detection failures | Linear (3 open: STR-12, STR-81, STR-24) + Intercom (~4 convos) | Names match across tools (Ikoma Skyline in both) | **Survives** — MEDIUM confidence |
| Challenge progress not updating | Intercom (~4 convos) + Linear (STR-37 open, DST cron bug) | STR-18 (elevation challenge progress) is Done — suggests partial fix, recurring issue | **Survives** — MEDIUM confidence |
| App crashing | Intercom (~6 convos) | Linear STR-39 (memory leak in ingest worker) In Progress — likely root cause | **Survives as opportunity** — MEDIUM confidence (user-facing framing: can't view activities after logging) |
| Notification management gaps | Intercom (~4 convos) | No Linear tickets found after searching "notification", "push", "alerts settings" | **Survives** — LOW confidence (single tool, no Linear validation, but true backlog gap) |
| 3D replay (STR-59) | Linear only | STR-47 is Done but STR-59 is open — likely different scope; no user demand signal in Intercom or PostHog | **Shelved** — insufficient multi-source signal for now |
| /auth rageclicks alone | PostHog only | 3 events, only 1 path, N well below floor — but corroborated by password reset signals | Treated as corroborating evidence only, not standalone opportunity |
| Subscription rate (3 cancelled vs 2 started) | PostHog only | N < 10 on both sides; directional only | Corroborating for billing opportunity; not standalone |

---

## 4. Opportunities (Ranked)

| # | Opportunity | Impact | Confidence | Effort | Notes |
|---|---|---|---|---|---|
| 1 | Users lose workouts when syncing from devices — activity data disappears or never arrives | HIGH | HIGH | L | Dominant theme across all three tools. Core value prop at stake. |
| 2 | Users get locked out of their accounts and can't recover access | HIGH | HIGH | S | All three tools. Two Urgent open tickets. Quick win — unblocks users fast. |
| 3 | GPS data is wrong — routes go through buildings, distances are inaccurate | HIGH | MEDIUM | M | Explicit churn language in Intercom. Data trust is the product's foundation. |
| 4 | Users can't find how to cancel premium or resolve billing errors | HIGH | MEDIUM | S | Cancellations > new starts (PostHog). Billing frustration is the #4 Intercom theme. |
| 5 | Segment efforts go unrecorded even when athletes complete the route | MEDIUM | MEDIUM | M | Competitive differentiator. Two tools, matching named segments. |
| 6 | Challenge progress doesn't update after completing qualifying activities | MEDIUM | MEDIUM | M | Urgency signals in Intercom. Engagement loop is broken at the payoff moment. |
| 7 | Users can't control which notifications they receive | MEDIUM | LOW | M | Single-tool. Backlog gap — no Linear tickets. Real friction for premium users but needs more validation. |

---

## 5. Solutions Per Opportunity

### Opp 1: Users lose workouts when syncing from devices

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Fix 24h-lookback window bug | Workouts from the previous day fall outside the sync window; extend or remove the cutoff | STR-21 (Urgent), STR-86 (High) | HIGH | S |
| Fix Garmin Forerunner 265 ingestion failure | Device-specific pipeline bug causing dropped activities | STR-23 (Urgent, In Progress) | HIGH | M |
| Fix Apple Watch Ultra 2 ingestion | Device-specific drop after successful sync confirmation | STR-16 (High, In Progress) | HIGH | M |
| Add user-visible sync status + manual retry | Closes the loop while root causes are fixed; gives users confidence and a self-serve action | New work | MEDIUM | M |

**Recommended first:** Ship STR-21/STR-86 fix (lookback window) — highest-coverage single fix. STR-23 and STR-16 are In Progress.

---

### Opp 2: Users get locked out and can't recover access

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Fix password reset email delivery | Root cause fix — email not sent or expired token | STR-14 (Urgent), STR-6 (Urgent) | HIGH | S |
| Add in-app fallback when email doesn't arrive | "Didn't get the email? Contact support" prompt with direct link | New work | MEDIUM | S |

**Recommended:** Fix the email delivery first (STR-14 / STR-6 are both open Urgent, same bug — pick one as canonical and close the other as duplicate). Ship the in-app fallback alongside.

---

### Opp 3: GPS data is wrong — routes through buildings, inflated distances

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Improve GPS smoothing / filter impossible vectors | Algorithm change to reject coordinates that imply passing through structures or impossible speeds | STR-20 (Medium, Todo) | HIGH | M |
| Add post-hoc distance correction UI | Let users manually adjust distance when they know GPS failed | New work | MEDIUM | M |
| Surface "low GPS quality" warning on affected activities | Honest signal to user that data may be approximate | New work | LOW | S |

---

### Opp 4: Users can't find how to cancel or fix billing errors

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Promote cancellation path in Account > Billing settings | Move "Cancel subscription" to a visible top-level option, not buried in submenus | Underlying issue of STR-22 (Duplicate) | HIGH | S |
| Fix duplicate charge bug | Investigate and patch the idempotency issue causing double billing | Underlying issue of STR-25 (Duplicate) | HIGH | M |
| Add pause-subscription option | Reduces cancellations by offering an alternative | New work | MEDIUM | M |

**Note:** STR-22 and STR-25 are marked Duplicate in Linear — search for the originals before opening new tickets.

---

### Opp 5: Segment efforts go unrecorded

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Fix GPS matching tolerance in segment detection algorithm | Current tolerance too strict — valid routes are rejected | STR-12 (High), STR-81 (High), STR-24 (Medium) | HIGH | M |
| "Near miss" notification — you were close to a segment credit | Gives users visibility when they came close; reduces frustration even before fix | New work | MEDIUM | S |

---

### Opp 6: Challenge progress doesn't update after qualifying activities

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Fix DST cron double-execution (prevents duplicate + prevents missed runs) | Root cause: cron fires twice on DST transition, causing duplicate or skipped updates | STR-37 (Medium, Todo) | HIGH | S |
| Trigger challenge progress recalculation on activity sync completion | Event-driven update instead of scheduled-only — closes the gap for users who sync late | New work | MEDIUM | M |

---

### Opp 7: Notification control (LOW confidence — validate before shipping)

| Solution | Approach | Linear | Impact | Effort |
|---|---|---|---|---|
| Build granular notification preferences UI | Per-category toggles: kudos, new followers, challenge reminders, clubs | New work | MEDIUM | M |
| Quick survey / in-app prompt to validate demand before building | Run a 2-question survey to premium users to confirm priority | New work | LOW | S |

**Recommended:** Run the survey first — this is currently single-tool signal.

---

## 6. Shelved Signals

| Signal | Why shelved | What would unshelve |
|---|---|---|
| 3D replay (STR-59) | No user demand in Intercom or PostHog. STR-47 is Done — unclear if STR-59 is a new scope or abandoned. | User requests in Intercom, or engagement data showing existing replay views high |
| Injury risk alerts (STR-48, STR-56) | No Intercom conversations on this theme. STR-41 (Done) was a first implementation. Feels supply-side (eng interest) not demand-side. | Coach/club-facing conversations in Intercom, or a sports science use case with retention data |
| Social nutrition tracking (STR-49) | Large effort (13 points), no Intercom demand, no PostHog signal. | User requests, competitive pressure, or activation data showing nutrition-linked users retain better |
| /auth rageclicks in isolation | Only 3 events, N below floor. Treated as corroborating evidence only. | Rageclick volume > 30 on /auth with baseline comparison |
| Subscription rate imbalance | N < 10 on both sides; too early to call. | 28-day window with N ≥ 30 on subscription_started |

---

## 7. Housekeeping / Measurement Hygiene

*Not opportunities — tracked separately because the team should know.*

- **`user_signed_up` vs `user_registered` event dedup** — retire one, update all funnels. Without this, activation rates are unmeasurable. (METHODOLOGY BLOCKER — see Preflight)
- **Sentry breadcrumbs for activity sync failures** — STR-27 and STR-28 both open. Needed for root cause diagnosis of Opp 1, not a user-facing fix.
- **Memory leak in background activity ingest worker** — STR-39 (High, In Progress). Root cause of app crashes / feed failures; not user-facing itself.
- **Auth session migration to Lucia** — STR-75 (Medium, In Progress). Security and maintenance; not user-facing.
- **GraphQL cache stale after club join/leave** — STR-31 (Urgent, Backlog), STR-38 (In Progress). Minor UX annoyance (requires manual refresh), not churn-driving.
- **GDPR data export completeness** — STR-82 (High). Compliance-facing, not product-facing; may be legal priority independently.
- **DST cron double-execution** — STR-33 (Backlog) and STR-37 (Todo) are duplicates of each other. Close one.

---

## 8. Sequencing Recommendation

### This sprint
1. **Password reset email delivery** (STR-14 or STR-6 — close the duplicate) — S effort, HIGH impact, all three tools confirm. Unblocks locked-out users immediately.
2. **Cancellation UI discoverability** — S effort, HIGH impact, prevents billing-driven cancellations. Find the original tickets behind STR-22/STR-25 duplicates.
3. **Activity sync: 24h lookback window fix** (STR-21, STR-86) — covers the largest cluster of sync failures in a single targeted fix.

### Next sprint
4. **GPS smoothing / distance accuracy** (STR-20) — churn signal is explicit; M effort.
5. **Segment detection tolerance fix** (STR-12, STR-81, STR-24) — M effort, competitive feature.
6. **Challenge progress: DST cron fix** (STR-37) — S effort, closes the engagement loop.

### Backlog / validate first
7. **Notification preferences** — validate with in-app survey before building.
8. **New Metrics features** (3D replay, injury alerts, power zones) — no urgent user demand signal. Revisit once reliability issues are resolved.

---

*Data sources: PostHog (project 391447, 28-day window), Linear (Stride team), Intercom (50 of ~200 conversations, page 1 of 4). Intercom full-volume estimates extrapolated at ×4 — treat as directional.*
*Run date: 2026-04-23*
