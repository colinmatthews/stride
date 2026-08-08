# Linear navigation for discovery

The default move — `list_issues` with no scope — will almost always overflow on a real workspace. Use targeted queries first; fall back to full reads only when necessary.

## The overflow failure mode

- `mcp__linear__list_issues({ team: "Stride", limit: 100 })` returned **127,179 chars on a single line** on a workspace of 81 issues. The raw JSON is too wide for `Read` line-based offset/limit.
- If you hit this, delegate to a subagent (see "Subagent fallback" below).

## Preferred navigation order

Start narrow, widen only if you don't find what you need.

### 1. Get the shape before the content

Use these to understand the workspace without pulling issues:

- **`list_teams`** — which teams exist.
- **`list_projects`** — projects + their `summary` field (this is usually high-quality PM context in one sentence per project).
- **`list_initiatives`** — higher-altitude than projects; strategic themes.
- **`list_milestones`** — sequenced delivery checkpoints.
- **`get_status_updates`** — project-level written summaries of recent progress. Often the single most efficient read for "what's happening in project X".

### 2. Search by keyword, not by dump

- `list_issues({ team, query: "signup" })` — searches title + description.
- Follow up with adjacent terms: `"onboarding"`, `"first activity"`, `"auth"`, `"login"`, `"sync"`.
- Multiple narrow queries > one broad one.

### 3. Filter before you dump

`list_issues` accepts these filters — use them:

| Filter | When to use |
|---|---|
| `project` | You know which project is relevant (e.g. "Q2 Reliability") |
| `state` | Narrow to `In Progress`, `Todo`, etc. Combine with a query. |
| `priority` | `priority: 1` = Urgent; `priority: 2` = High. Catches the "what's on fire" view in a few calls. |
| `label` | If the workspace uses labels. Check `list_issue_labels` first. |
| `updatedAt: "-P3D"` | Last 3 days of activity. For recency-sensitive runs. |
| `createdAt: "-P3D"` | Issues *new* in the window (vs. ones merely touched). |
| `assignee: "me"` | Scope to the current user. |

### 4. Iterate with `cursor`

Always ask for a smaller `limit` (20–50) and paginate via `cursor` rather than loading everything at once. Each page fits in context.

## Common discovery queries

### "Is there a ticket for this theme?"

```
list_issues({ team: <team>, query: <theme-word>, limit: 20 })
```

Then scan titles. If zero results, that's a **discovery gap** — surface it as a finding.

### "What urgent work is open?"

```
list_issues({ team: <team>, priority: 1, state: <not Done>, limit: 20 })
list_issues({ team: <team>, priority: 2, state: <not Done>, limit: 30 })
```

### "What's new since last week?"

```
list_issues({ team: <team>, createdAt: "-P7D", orderBy: createdAt, limit: 30 })
```

### "What's a specific project working on?"

```
get_status_updates({ project: <id> })   # narrative summary
list_issues({ project: <id>, state: "In Progress", limit: 20 })
```

### "Find duplicates of a known issue"

```
list_issues({ team: <team>, query: <core-noun-phrase>, limit: 30 })
```

Scan titles — duplicates often cluster around a shared noun phrase (e.g. "password reset email delivery").

## Subagent fallback

When you need the full raw text (e.g. reconstructing a complex cross-project view), spawn a subagent with this prompt template:

> Slice `<path>` (JSON string on a single line, ~<N> chars) via `python3 -c "print(open('...').read()[A:B])"` in ~40,000-char spans until covered. Scan raw text for issue titles, descriptions, states, priorities, projects. Return: (1) backlog by project with top 5 titles each, (2) issues matching these themes: `<theme list>`, (3) recent issues (createdAt > <date>), (4) discovery gaps — themes with zero matches. Keep under 600 words.

The subagent returns a compact, scanned summary. Your main context stays clean.

## Reading issue detail efficiently

When a specific ticket matters (you're deciding whether to promote it, or checking state):

- `get_issue({ issue: "STR-14" })` — full detail of a single issue.
- Not `list_issues` with a query that happens to match one ticket — you pay for the wrapper overhead.

## Interrogating a Linear finding before promoting it

Don't call a Linear finding "evidence" until you've done one of these:

- **For a ticket cluster** — `get_issue` on the most-cited ticket. Read the full description, comments, and linked work. The list view title is often misleading; the body explains whether it's actually open work, blocked, abandoned, or already shipped.
- **For "no tickets exist on theme X"** — search ≥3 adjacent phrasings before calling it a gap. If the theme is "activation," try: "onboarding," "signup," "first run," "first activity," "welcome flow," "new user." A backlog gap is only a finding if the search was thorough.
- **For an Urgent ticket** — check its `createdAt`. An "Urgent" ticket open 3 months may be theatrical urgency, not real. Cross-check against actual sprint or cycle assignment.
- **For a duplicate cluster** — verify they're truly duplicates (same root cause) vs. similar-titled but distinct issues. Read 2–3 in detail. If duplicates, the Linear evidence weight collapses to 1 ticket, not N.

A Linear "finding" that has only been seen via `list_issues` titles is a hypothesis. One that has been read in detail via `get_issue` is evidence.

### Permission denial fallbacks

`get_issue`, `list_teams`, `list_projects`, and other per-item fetches may be denied mid-run depending on the user's permission setup. If a needed call is denied:

- **For ticket detail** (when `get_issue` is denied): if you previously ran `list_issues` and it overflowed to a file, that file contains the full description and comments for every ticket. Use `python3 -c "print(open('<path>').read()[A:B])"` to slice through ~40K-char windows, or grep for the ticket's STR-ID to find its JSON block.
- **For team/project shape** (when `list_teams`/`list_projects` is denied): infer from issue prefixes (e.g. `STR-` → team key STR) and the `project` field on individual issues. You won't get summaries, but you'll get the structural map.
- **Always note in the artifact** which calls were denied and how you worked around them — readers should know which findings rest on full reads vs. inferred structure.

## What to always extract from Linear

For each relevant issue the discovery run touches, pull:

- **ID** (e.g. `STR-14`) — for traceability into the artifact.
- **Title** — exactly as-is.
- **State** — Backlog / Todo / In Progress / In Review / Done.
- **Priority** — Urgent / High / Medium / Low / None.
- **Project** — tells you which initiative the ticket belongs to.

A solution in the OST that cites a ticket is 10× more actionable than one that doesn't — "Unblock STR-14 (Urgent, Backlog)" > "fix the password reset bug."
