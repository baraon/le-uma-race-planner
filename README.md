# Le Uma Race Planner

Driver availability planning for **Le Mans Ultimate** endurance races. Each driver marks when they
can race on a shared timeline, and everyone sees it in their own timezone.

> Status: **Phase 4 — overview and launch.** Discord login, groups with invite links, teams,
> events, the availability editor and the team overview all work. Next: an accessibility pass and
> the first production deploy. See [docs/PLAN.md](docs/PLAN.md).

## How timezones work

The one rule: **the server and database only store absolute instants (UTC). Timezones exist only
when a person reads or enters a time.**

- A race is a UTC start time plus a duration, cut into 15-minute slots counted from the green
  flag. Slot boundaries are the same instants for every driver.
- Each user has an IANA timezone (e.g. `America/Chicago`), never a fixed offset like `UTC-5`, so
  daylight-saving changes are handled correctly.
- The UI converts slots to the viewer's zone for display, with a switcher for UTC or any
  teammate's zone.

The slot and timezone logic is in [`packages/shared`](packages/shared/src). CI runs its tests
under five different machine timezones to prove the results don't change.

## Discord login: minimum permissions

Login uses Discord OAuth2 with **only the `identify` scope** (username, display name, avatar). No
email, no server list, no bot. Discord tokens are thrown away right after login; the app keeps its
own session cookie.

## Stack

| Layer    | Choice                                                         |
| -------- | -------------------------------------------------------------- |
| Language | TypeScript (strict), Node.js 22                                |
| Frontend | React 19, Vite, Tailwind CSS 4, TanStack Query                 |
| Backend  | Fastify 5, Zod validation shared with the frontend             |
| Database | PostgreSQL 17, Drizzle ORM for queries, plain SQL migrations   |
| Time     | Native `Intl` API (IANA timezone database built into browsers) |
| Tooling  | pnpm workspaces, ESLint, Prettier, Vitest, GitHub Actions      |
| Run      | Docker Compose locally and in production; Caddy for HTTPS      |

## Getting started

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine) and
Git. Node.js 22 and pnpm are optional but help your editor (`corepack enable` gives you pnpm).

```bash
git clone https://github.com/baraon/lmu-race-planner.git
cd lmu-race-planner
cp .env.example .env        # defaults work for local development
docker compose up
```

Then open <http://localhost:5173>. The first start takes a minute while dependencies install.
The API runs at <http://localhost:3000> (health check: `/api/health`), and Postgres is on
`localhost:5432` (user `lmu`, password `lmu-dev-password`).

The containers mount your source folder, so the web app and API reload when you save a file.

**Windows:** clone the repo inside WSL (e.g. `~/code` in Ubuntu), not under `C:\`. File-change
events don't reach containers from Windows folders. If you must use a Windows folder, set
`VITE_POLL=true` in `.env`.

### Without Docker

Requires Node.js 22, pnpm and a local PostgreSQL.

```bash
pnpm install
export DATABASE_URL=postgres://lmu:lmu-dev-password@localhost:5432/lmu
export SESSION_SECRET=dev-only-session-secret-change-me-0000000000
pnpm db:migrate
pnpm --filter @lmu/api dev     # terminal 1
pnpm --filter @lmu/web dev     # terminal 2
```

### First run: commit the lockfile

`pnpm-lock.yaml` isn't in the repo yet. After your first `pnpm install` (or `docker compose up`),
commit it so CI and Docker builds use exactly the same dependency versions:

```bash
git add pnpm-lock.yaml && git commit -m "Add pnpm lockfile" && git push
```

## Scripts

| Command               | What it does                                 |
| --------------------- | -------------------------------------------- |
| `pnpm dev`            | `docker compose up` (whole dev stack)        |
| `pnpm lint`           | ESLint across the repo                       |
| `pnpm format`         | Prettier, writing fixes                      |
| `pnpm typecheck`      | TypeScript in every package                  |
| `pnpm test`           | All unit tests                               |
| `pnpm test:timezones` | Shared tests under five machine timezones    |
| `pnpm db:migrate`     | Apply new SQL files in `apps/api/migrations` |
| `pnpm build`          | Production builds of the API and web app     |

## Project layout

```
apps/
  api/              Fastify API
    migrations/     Plain SQL migrations, applied in order (source of truth for the schema)
    src/db/         Drizzle schema (typed queries), migration runner
  web/              React + Vite frontend
packages/
  shared/           Slot and timezone logic, Zod schemas shared by api and web
docker/             Production Dockerfiles and Caddyfile
compose.yaml        Development stack
compose.prod.yaml   Production stack (single server)
```

### Database rules enforced by Postgres

- A driver can't have overlapping availability blocks in the same event (exclusion constraint).
- Blocks must sit inside the race window and line up with 15-minute slots (trigger).
- A group has exactly one owner.

## Production

On a small Linux server with Docker installed:

```bash
git clone https://github.com/baraon/lmu-race-planner.git && cd lmu-race-planner
cp .env.example .env   # set real passwords, SESSION_SECRET, APP_URL, SITE_ADDRESS
docker compose -f compose.prod.yaml up -d --build
```

With `SITE_ADDRESS` set to your domain (DNS pointing at the server), Caddy gets an HTTPS
certificate automatically. The production domain hasn't been chosen yet.

## Security

This repository is public. Real secrets live only in `.env` (git-ignored) and in GitHub Actions
secrets. Never commit `.env`. Please report security issues privately to the repository owner
rather than opening a public issue.

## License

[MIT](LICENSE)
