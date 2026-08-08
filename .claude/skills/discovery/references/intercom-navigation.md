# Intercom navigation for discovery

The default move — `search_conversations` with minimal filters — overflows on any busy workspace (20 conversations returned 71,993 chars). Use filters aggressively and extract themes before pulling full bodies.

## The overflow failure mode

- `search_conversations({ created_at: {>}, per_page: 20 })` returned **~72K chars** for just 20 conversations because each conversation carries full body + metadata.
- Preferred pattern: pull minimal fields for theme-counting, then pull full bodies only for the priority cluster.

## Preferred navigation order

### 1. Count themes before pulling bodies

Intercom auto-generates an **AI Title** custom attribute on each conversation that summarizes the theme in ~3–5 words. That's your cheap theme index.

```
grep -E '"AI Title":' <saved-file> | sort | uniq -c | sort -rn
```

If the search results overflowed and saved to a file, this gives you a theme distribution for free. No body reads required.

### 2. Filter to scope

`search_conversations` accepts many filters — use them:

| Filter | When to use |
|---|---|
| `created_at: { operator: ">", value: <unix ts> }` | Recency window |
| `state: "open"` | Active issues only; skip closed noise |
| `priority: "priority"` | Team has already flagged these as important |
| `tag_ids: [...]` | Workspace uses tags — pre-categorized themes |
| `ai_agent_resolution_state: "routed_to_team"` | Cases the AI couldn't resolve — usually the juicy ones |
| `conversation_rating_score: { <=, 3 }` | Low-rated conversations — dissatisfied users |
| `source_author_email` | Specific user |

Check `list_tags` once per workspace to see what pre-categorization exists. Tags are almost always worth using if they exist.

### 3. Use `search` for natural-language scan

`mcp__intercom__search` accepts a plain query and ranks conversations + articles by relevance. Good for "find conversations about signup" when you don't know what tags exist.

### 4. Pull full bodies only for priority cluster

Once you've identified the top theme from step 1's theme count, get full detail on just those 3–8 conversations:

- Use `get_conversation({ id })` per conversation for the priority cluster.
- Don't re-fetch every conversation just to read bodies you already have in the overflow file.

## Common discovery queries

### "What's the top support theme in the last 3 days?"

```
search_conversations({
  created_at: { operator: ">", value: <3-days-ago-unix> },
  per_page: 50  # fetches titles; bodies go into the overflow file
})
```

Then `grep '"AI Title":' <file> | sort | uniq -c | sort -rn`. Top count = top theme.

### "Which conversations are bug reports vs feature requests?"

If tags exist: filter by tag. If not, grep AI Titles for bug-like nouns ("crashing", "not working", "broken", "error") vs request-like ("would love", "feature", "request", "option").

### "Who are the dissatisfied users?"

```
search_conversations({ conversation_rating_score: { operator: "<=", value: 3 }, per_page: 20 })
```

Low-scored conversations cluster around specific themes — often the highest-leverage improvements.

### "What did the AI fail to resolve?"

```
search_conversations({ ai_agent_resolution_state: "routed_to_team", per_page: 20 })
```

AI couldn't answer → unique, non-boilerplate problems.

## Subagent fallback

When the overflow file is big and you need semantic clustering (not just AI Title counts), use a subagent:

> Read `<path>` in chunks of ~200 lines with offset/limit until all N lines covered. For each conversation extract: id, author name, AI Title, first ~300 chars of body (strip HTML). Cluster into themes. For each cluster: name, count, representative quote, **<outcome>-relevance tag** (HIGH/MEDIUM/LOW/NONE) with one-phrase reason. End with top 3 <outcome>-relevant themes and rationale. Keep under 500 words.

Replace `<outcome>` with the discovery run's outcome — this keeps the subagent focused on what matters.

## Intercom → OST mapping

Use Intercom output in the OST like this:

- **Count** of conversations per theme → evidence weight for an opportunity.
- **Direct user quotes** → opportunity framing language (opportunities are user-voiced).
- **AI Titles** → shortcut labels for the clusters.
- **AI resolution state** → which themes the team is spending human time on (= where support burden lives).
- **Conversation rating remarks** (if present) → emotional texture; adds confidence to an opportunity.

## Interrogating an Intercom theme before promoting it

Don't call a theme cluster "evidence" until you've done at least one of:

- **Read the full bodies** of the top 2–3 conversations in the cluster (not just AI Titles). The AI Title is a 3-word summary; the body has the texture that decides whether the theme is one user's quirk or a real pattern.
- **Widen the window.** If the 3-day window has 4 convos on a theme, run the same search over 14–28 days. If the 14-day count is also 4, the theme is small. If it's 40, you have a real pattern.
- **Check rating + escalation.** Use `conversation_rating_score: <=3` and `ai_agent_resolution_state: "routed_to_team"` filters on the same theme. Themes that produce low ratings or AI failures are stronger evidence than themes that are routine.
- **Sample for representativeness.** If the loud user in the cluster has filed 10 tickets in 30 days, treat their volume as one user's intensity, not a theme. Use `source_author_email` to check.

A theme with a count and a rep quote is a hypothesis. A theme with a count, full bodies of the top conversations, a widened-window check, and a rating/resolution filter is evidence.

### Permission denial fallbacks

If `get_conversation` is denied mid-run:

- The full body, custom attributes, and `AI Title` for every conversation are already in the overflow file produced by your earlier `search_conversations` call. Use grep to locate the conversation by ID (e.g. `grep -A 200 '"id": "<conv-id>"' <path>`) — the body is in the JSON block right after.
- For widened-window checks, run a fresh `search_conversations` with the wider date range (search is usually permitted even when per-item fetches aren't).
- **Always note in the artifact** which calls were denied. A theme's confidence depends on whether bodies were genuinely read or only inferred from AI Titles.

### Semantic theme clustering

When the AI Titles split a single root cause across several phrasings (e.g. "Activity not syncing" + "Activity not showing" + "Garmin missing" + "Workout disappeared"), you can sum them toward the volume floor — but only after reading 2–3 full bodies from each cluster to confirm they describe the same problem at the same user-facing layer. See `prioritization.md` → "Semantic-cluster theme counting" for the full rule.

## What to always extract from Intercom

For each theme cluster cited in an OST:

- **Count** — number of conversations in the cluster.
- **One verbatim quote** — preserve the user's words. Pithy is better than complete.
- **Outcome-relevance tag** — HIGH/MEDIUM/LOW/NONE relative to the current discovery run's outcome.
- **At least one conversation ID** — so the reader can check the source.

A solution that cites a theme ("4 users reported missing workouts from Garmin devices") is far more actionable than "users seem unhappy with sync."
