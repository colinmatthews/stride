# Stride (Strava prototype)

Full-stack Strava-like training app used for end-to-end prototyping: running
real discovery workflows, testing instrumentation, and seeding realistic data
across PostHog, Intercom, and Linear.

Design tokens and typography decisions live in [DESIGN.md](DESIGN.md).
Frontend-only fork for quick component prototypes:
[stride-components](https://github.com/colinmatthews/stride-components).

## Stack

- **Frontend**: Vite + React 19 + TypeScript + TanStack Router + Tailwind v4 +
  shadcn/ui + PostHog
- **Backend**: Express 5 + Drizzle ORM + Postgres (Neon)
- **Synthetic data**: Faker + Claude for personas, behavior, and support/ticket
  content

## Setup

```bash
npm install
cp .env.example .env   # then fill in keys
npm run db:migrate     # apply Drizzle schema
npm run dev            # runs client (vite) + server (tsx watch) concurrently
```

Client: <http://localhost:5173> — Server: <http://localhost:3001>

## Required env vars

| Var                                | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `DB_URL`                           | Postgres connection string        |
| `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`| Client PostHog key                |
| `VITE_PUBLIC_POSTHOG_HOST`         | PostHog host (e.g. us.i.posthog.com) |
| `POSTHOG_API_KEY`                  | Server-side PostHog key           |
| `LINEAR_API_KEY` / `LINEAR_TEAM_KEY`| For Linear seeding                |
| `INTERCOM_ACCESS_TOKEN` / `INTERCOM_REGION` / `INTERCOM_TICKET_TYPE_ID` | For Intercom seeding |
| `ANTHROPIC_API_KEY`                | Used by content generators        |
| `SYNTH_USER_COUNT` / `SYNTH_RNG_SEED` / `SYNTH_COHORT_ID` | Synth config |

Read-only keys (`*_READ_*`) are used by discovery scripts that shouldn't mutate
third-party state.

## Scripts

Dev:
- `npm run dev` — client + server concurrently
- `npm run dev:client` / `npm run dev:server` — run one side only
- `npm run build` — prod build for both

Database:
- `npm run db:generate` — generate a Drizzle migration from schema changes
- `npm run db:migrate` — apply pending migrations

Synthetic data (fills out a realistic product):
- `npm run synth:users` — generate personas → `data/synth-users.json`
- `npm run synth:db` — seed Postgres from the generated users
- `npm run synth:posthog` — replay events to PostHog
- `npm run synth:intercom` — create support conversations + tickets
- `npm run synth:linear` — create issues / projects in Linear
- `npm run synth:weekly` — weekly rollup
- `npm run check:keys` — sanity-check required env vars

Lint/format:
- `npm run lint` / `npm run format`

## Layout

```
src/                 frontend (TanStack Router file-based routes)
  components/        app components + shadcn/ui primitives
  lib/               api client, mock data shape, utils
  routes/            pages
server/              Express API, auth, data access, seed
  db/                Drizzle schema + migrations
scripts/synth/       persona + PostHog + Intercom + Linear generators
data/                generated synthetic JSON (users, weekly logs, content)
.claude/skills/      Claude Code skills wired into this repo
```

## Related

- [`stride-components`](https://github.com/colinmatthews/stride-components) —
  frontend-only starter that teams can fork for quick UI prototypes without
  touching the backend
