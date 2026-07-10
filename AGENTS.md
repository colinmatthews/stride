# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Stride is a full-stack Strava-like training app: React 19 + Vite frontend on port 5173 and Express 5 + Drizzle ORM backend on port 3001. See `README.md` for the full stack description, scripts, and env var table.

### Database

PostgreSQL is required. The server crashes at startup without a valid `DB_URL` in `.env`. On Cloud Agent VMs, PostgreSQL is installed as a system package. Before running the app:

```bash
pg_ctlcluster 16 main start          # start the PG cluster (idempotent)
```

The database `stride` and user `stride:stride` are pre-created. Connection string: `postgresql://stride:stride@localhost:5432/stride`. After starting PG, apply any pending migrations with `npm run db:migrate`.

### Running the app

```bash
npm run dev        # starts both Vite (5173) and Express (3001) via concurrently
```

The Vite dev server proxies `/api` requests to the Express backend. The server seeds demo data (athletes, activities, segments, clubs, challenges) into PostgreSQL on startup, so the app has content immediately.

### Lint / Build

- `npm run lint` — ESLint + Prettier. Pre-existing formatting violations exist in `scripts/synth/` and `tmp/slides/`; the core `src/` and `server/` code is clean of logic errors.
- `npm run build` — Vite client build + tsc server build.

### PostHog, Intercom, Linear, Anthropic

All optional SaaS integrations. The app runs fully without them. Leave their `.env` values blank unless you specifically need analytics or synthetic data seeding.

### Gotchas

- The `.env` file is not committed. If it's missing, copy from `.env.example` (or create manually) and set at minimum `DB_URL=postgresql://stride:stride@localhost:5432/stride`.
- `npm run db:migrate` requires a running PostgreSQL instance; it will throw if `DB_URL` is unset or PG is down.
- The server's `initializeDatabase()` does an upsert seed on every startup — this is safe to run repeatedly.
