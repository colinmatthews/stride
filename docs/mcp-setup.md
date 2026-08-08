# Connecting MCP servers to Claude Code

For this course you'll connect Claude Code to three services: **Intercom**, **PostHog**, and **Linear**. Each one lets Claude query real product data — support conversations, analytics events, engineering issues — directly from your prompts.

## Before you start

**You'll need the Claude Code CLI installed** (`claude --version` should print a version). If not, see the [Claude Code install guide](https://code.claude.com/docs/en/setup).

**Three API keys — provided by your instructor**. Paste them into a scratch file or password manager as you go; the same tokens are used for all three commands below.

- `INTERCOM_ACCESS_TOKEN` — starts with a long base64-looking string, no prefix
- `POSTHOG_PERSONAL_API_KEY` — starts with `phx_`
- `LINEAR_API_KEY` — starts with `lin_api_`

**Why API keys and not OAuth?** OAuth would require each of you to log into Intercom and Linear with your own accounts — those products charge per seat, so that's not viable at course scale. Instead, the instructor issues read-only Bearer tokens scoped to the course workspaces. You paste them once and Claude Code uses them on every query.

---

## Step 1. Connect Intercom

The Intercom MCP server lets Claude read your support conversations, tickets, and contact data.

**Server URL** (US workspaces only):

| Region | URL |
|---|---|
| US (default) | `https://mcp.intercom.com/mcp` |

**Add it to Claude Code:**

```bash
claude mcp add --transport http intercom https://mcp.intercom.com/mcp \
  --header "Authorization: Bearer dG9rOmQ0ZDNkY2U1XzYzNjZfNDNkOF9hN2YwXzJkY2JiODYyZTM1MToxOjA=" \
  -s user
```

**Verify:**

```bash
claude mcp list
```

You should see `intercom  ✓ Connected`.

Open a Claude Code session and try:

> Using the Intercom MCP, show me 3 recent support conversations with their body text.

You should get three conversations back with actual message content.

---

## Step 2. Connect PostHog

The PostHog MCP server lets Claude query events, persons, cohorts, and insights.

**Server URL:**

| Region | URL |
|---|---|
| US (default) | `https://mcp.posthog.com/mcp` |
| EU | `https://mcp-eu.posthog.com/mcp` |

Use US for this course.

**Add it to Claude Code:**

```bash
claude mcp add --transport http posthog https://mcp.posthog.com/mcp \
  --header "Authorization: Bearer phx_xjAHY4iifs5KwEQmYJB5doFbXC9mtRC5ASvCrDBzZqyujvpe" \
  -s user
```

**Verify:**

```bash
claude mcp list
```

You should see `posthog  ✓ Connected`.

Open a Claude Code session and try:

> Using the PostHog MCP, how many `user_registered` events happened in the last 90 days?

You should get a number around 230. If you get zero or an auth error, double-check the token.

---

## Step 3. Connect Linear

The Linear MCP server lets Claude read issues, projects, cycles, and labels.

**Server URL:**

| Region | URL |
|---|---|
| Global | `https://mcp.linear.app/mcp` |

**Add it to Claude Code:**

```bash
claude mcp add linear -s user -- \
  npx -y mcp-remote https://mcp.linear.app/mcp \
  --header "Authorization:Bearer lin_api_VxaVg6wTEmJPH3V7S4t3psl3MyAWdADcRAH6hStC"
```

> Note: Linear's docs emphasize OAuth as the primary flow (`claude mcp add --transport http linear https://mcp.linear.app/mcp` with no header, then `/mcp` to trigger the browser OAuth). For this course, we skip OAuth entirely by passing the API key as a Bearer header — same endpoint, no login popup.

**Verify:**

```bash
claude mcp list
```

You should see `linear  ✓ Connected`.

Open a Claude Code session and try:

> Using the Linear MCP, list 5 issues from the Stride Eng team with priority Urgent or High.

You should get 5 issue titles with their `STR-###` identifiers.

---

## Step 4. Cross-service test

This is what the course is really about — Claude reading across all three in one prompt. Try:

> Using Intercom, find the most recent conversation that mention sync issues. Get the customer's email from that conversation. Then use PostHog to find that person's last 5 events. Then check Linear for any issues that reference the conversation ID.

If all three MCPs are connected correctly, Claude will chain the three servers together and produce a cross-linked summary. If it complains about missing data or auth, one of the three isn't wired up — re-run `claude mcp list` to see which.

---

## Checking your setup

Useful commands any time:

```bash
claude mcp list                    # show all connected servers + status
claude mcp get intercom            # show config for one server
claude mcp remove intercom -s user # disconnect a server (can re-add later)
```

The user-scope config is stored in `~/.claude.json`. Safe to inspect, don't paste it publicly (it contains your tokens).

---

## Troubleshooting

### `claude mcp list` shows `✗ Failed to connect`

First, check the token itself is valid by calling the service API directly. Paste the relevant command below into your terminal (replace `YOUR_TOKEN` with the token value only — no `Bearer` prefix in these curl commands, since `-H "Authorization: Bearer ..."` adds it):

**Intercom:**
```bash
curl -s -H "Authorization: Bearer YOUR_INTERCOM_ACCESS_TOKEN" \
  -H "Intercom-Version: 2.11" \
  https://api.intercom.io/me
```
Expect a JSON response with an `app` object. `401` means the token is bad.

**PostHog:**
```bash
curl -s -H "Authorization: Bearer YOUR_POSTHOG_PERSONAL_API_KEY" \
  https://us.i.posthog.com/api/users/@me/
```
Expect a JSON response with your email. `401` means wrong key or the key is the `phc_` Project key (should be `phx_` Personal key).

**Linear:**
```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: Bearer YOUR_LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { viewer { email name } }"}'
```
Expect `{"data":{"viewer":{"email":"…"}}}`. An `errors` array means the token is rejected.

If all three direct-API checks succeed but `claude mcp list` still fails, the problem is in the Claude Code config — most commonly a missing `--transport http` flag on the `claude mcp add` command. Remove and re-add:

```bash
claude mcp remove intercom -s user
claude mcp add --transport http intercom https://mcp.intercom.com/mcp \
  --header "Authorization: Bearer YOUR_INTERCOM_ACCESS_TOKEN" -s user
```

### Queries return "no data"

- Check you're pointing at the right workspace. Your instructor should have shared the workspace URLs — if you can't see data in the Intercom/PostHog/Linear web UI with the test token, the MCP won't either. That usually means a wrong or revoked token.

### Something else

Post in `#cohort-x-social` with the exact `claude mcp list` output and a screenshot. Do **not** paste your tokens — the connection status and error message is enough to help.

---

## What you can do now

You have Claude Code connected to:
- **Stride's support inbox** (Intercom) — conversations, tickets, contacts
- **Stride's analytics** (PostHog) — events, persons, funnels, cohorts
- **Stride's engineering backlog** (Linear) — issues, cycles, projects, labels

These three sources plus the Stride codebase itself are everything you'll use throughout the course. Week 1 is about learning to ask good questions across them.
