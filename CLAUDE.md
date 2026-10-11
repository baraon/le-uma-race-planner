# CLAUDE.md

Context for Claude Code sessions on this repo. Read this first; read `docs/PLAN.md` for the phase
plan and what "done" means for each phase. Keep both files up to date when decisions change.

## What this is

**Le Mans Race Planner** (repo `baraon/lmu-race-planner`, public, MIT): a team planning tool for
endurance races in the sim racing game **Le Mans Ultimate**. Inspired by iRacePlan's "Driver
Availabilities" page. v1 does one thing well: drivers mark when they can race on a shared timeline
for an event, and everyone sees it correctly in their own timezone.

Owner: Baraon (GitHub `baraon`), based in America/Chicago, develops on Windows.

## Current status

- **Phase 0 (platform setup): done.** Monorepo, Docker Compose dev stack, Postgres schema, CI.
- **Phase 1 (Discord login): next.** See `docs/PLAN.md`.
- A Discord application exists; its client ID/secret are in the owner's local `.env` only.
- Production domain: **not decided.** Hosting: cheapest option, one small VPS with Docker Compose.

## Non-negotiable rules

1. **Time:** the server and database store only absolute instants (UTC `timestamptz`). Timezones
   exist only at the edges (display and input). Users have an IANA zone (`America/Chicago`),
   never a fixed offset (`UTC-5`). Never use local-time getters (`getHours()` etc.) in shared or
   server code; use the helpers in `packages/shared/src/timezones.ts`.
2. **Slots:** 15 minutes, counted from the event's green flag (slot 0). Fixed for now because
   future stint planning uses the same unit. A final partial slot counts as a slot ending at the
   flag. Availability periods are half-open `[start, end)`.
3. **Discord auth: minimum permissions.** Request only the `identify` OAuth2 scope. No `email`,
   `guilds`, `connections`, no bot, no permission integer. Exchange the code server-side, call
   `GET /users/@me` once, then **discard Discord's tokens**. Store only Discord user ID, username,
   global display name, avatar hash. Our own session = random token in an `httpOnly`, `Secure`,
   `SameSite=Lax` cookie; only its SHA-256 is stored (`sessions.id`). Validate `state` (CSRF).
4. **Secrets:** the repo is public. Never commit `.env` or real credentials. Never ask the owner
   to paste secrets into chat.
5. **The database enforces integrity** where it can (exclusion constraint for overlapping
   availability, trigger for slot alignment and event window, one owner per group). Keep it that
   way; don't move those rules into app code only.

## Domain model (v1)

- **Group:** created by a user, who becomes its **owner** (exactly one). The owner invites
  drivers by **invite link** and can make members **admins** with specific permission flags:
  `can_manage_members`, `can_manage_teams`, `can_manage_events`, `can_manage_availability`.
  The owner implicitly has all permissions.
- **Team:** belongs to a group; created by the owner or admins with `can_manage_teams`.
  **Drivers assign themselves** to teams (must be group members). A user can be in many groups
  and teams.
- **Event:** a race for a team: `starts_at` (UTC), `duration_minutes`, optional track, car class,
  `track_timezone`. Created by owner/admins with `can_manage_events`.
- **Availability:** per driver per event, blocks of `available` / `maybe` / `unavailable`. A
  driver edits their own; owner/admins with `can_manage_availability` can edit anyone's. Saving
  replaces the driver's whole row for that event in one transaction.
- Authorization is checked in the API on every request against `group_members`.

Schema source of truth: `apps/api/migrations/*.sql` (plain SQL, applied in order by
`apps/api/src/db/migrate.ts`). `apps/api/src/db/schema.ts` is the Drizzle typed mirror; keep it
in step. New schema change = new numbered migration file; never edit an applied one.

## Stack and layout

TypeScript (strict) everywhere, Node 22 LTS, pnpm workspaces.

- `apps/web` React 19 + Vite + Tailwind 4 + TanStack Query. Design tokens in `src/index.css`
  (dark theme first; status colors always paired with a non-color cue).
- `apps/api` Fastify 5, Zod, Drizzle ORM over `postgres` (postgres.js). Bundled with tsup.
- `packages/shared` slot + timezone logic and Zod schemas used by both apps.
- `docker/` production Dockerfiles + Caddyfile; `compose.yaml` dev; `compose.prod.yaml` prod.
- Timezone handling uses the native `Intl` API (no date library).

## Commands

```bash
docker compose up            # whole dev stack: web :5173, api :3000, postgres :5432
pnpm install                 # without Docker
pnpm lint | pnpm format:check | pnpm typecheck
pnpm test                    # all unit tests
pnpm test:timezones          # shared tests under 5 machine timezones (CI runs this)
pnpm db:migrate              # needs DATABASE_URL
pnpm build
```

Run `pnpm format` before committing; CI fails on Prettier differences.

## How we work (agreed with the owner)

- **Branch per piece of work, open a PR, merge it yourself once CI is green.** The owner may
  review anytime. Don't push straight to `main`.
- **CI is the test loop of record** (GitHub Actions: lint, format, typecheck, timezone tests,
  migrations twice, api/web tests, build, both Docker images). Cloud sessions can't reach npm or
  Docker Hub, so they rely on CI; local sessions should run the checks before pushing.
- **Dependabot:** merge its PRs when green, except close upgrades that leave Node LTS (e.g. Node 25) or break the build; fix forward if a major bump needs code changes.
- **Ask one question at a time** when a decision is genuinely the owner's; otherwise pick the
  sensible default, note it in the PR, and keep going.
- Keep PR descriptions short: what changed, how it was verified, anything the owner must do.

## Owner's environment

- Windows. Repo at `C:\Users\galle\Projects\lmu-race-planner`. Docker hot reload is unreliable
  from Windows folders; set `VITE_POLL=true` in `.env` if edits don't show up (or use WSL).
- `.env` (git-ignored) holds `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, etc.
  Discord redirect URI registered: `http://localhost:5173/auth/discord/callback`.

## Open items

- Production domain (needed before first deploy; also add its redirect URI in Discord).
- Decide whether Dependabot should be limited to minor/patch updates if PR volume is annoying.
