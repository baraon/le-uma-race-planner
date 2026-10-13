# CLAUDE.md

Context for Claude Code sessions on this repo. Read this first; read `docs/PLAN.md` for the phase
plan and what "done" means for each phase. Keep both files up to date when decisions change.

## What this is

**Le Uma Race Planner** (repo `baraon/le-uma-race-planner`, public, MIT): a team planning tool for
sim endurance races. Owner's choice: never name the game itself (no "Le Mans Ultimate" or
"LMU") in user-facing text, names or identifiers; "Le Mans" the race is fine. Inspired by iRacePlan's "Driver
Availabilities" page. v1 does one thing well: drivers mark when they can race on a shared timeline
for an event, and everyone sees it correctly in their own timezone.

Owner: Baraon (GitHub `baraon`), based in America/Chicago, develops on Windows.

## Current status

- **Phase 0 (platform setup): done.** Monorepo, Docker Compose dev stack, Postgres schema, CI.
- **Phase 1 (Discord login): done.** Auth code lives in `apps/api/src/auth/` (Discord client,
  sessions, `requireUser` preHandler) and `apps/api/src/routes/{auth,me}.ts`. `users.timezone` is
  nullable: `NULL` = not chosen yet; the web app saves the browser's zone on first login.
  `DISCORD_REDIRECT_URI` defaults to `APP_URL/auth/discord/callback`. Login accepts
  `?returnTo=/path` (same-site paths only) so invite links survive sign-in.
- **Phase 2 (groups, teams, events): done.** Routes in
  `apps/api/src/routes/{groups,invites,teams,events}.ts`; authorization helpers in
  `apps/api/src/auth/permissions.ts` (non-members get 404, members lacking a flag get 403).
- **Phase 3 (availability editor): done.** API in `apps/api/src/routes/availability.ts` +
  `apps/api/src/db/availability.ts`; editor in `apps/web/src/pages/AvailabilityEditor.tsx`
  (row wrapping in `apps/web/src/lib/paint.ts`). Moving an event trims
  availability to the new window in the same transaction (deferred DB check at commit).
- **Phase 4 (overview and launch): done.** Overview in
  `apps/web/src/pages/AvailabilityOverview.tsx`; axis marks in `packages/shared/src/timeline.ts`;
  legal pages in `apps/web/src/pages/LegalPages.tsx` (keep them true when data handling changes).
  v1 is complete; new work is driven by owner requests.
- **Phase 5 (stint planner): built**, awaiting the owner's check. Calculator in
  `packages/shared/src/plan.ts` (laps, exact stint times, pit stops, availability conflicts,
  driving totals) and `stints.ts` (laps per stint, lap-time text); track list in `tracks.ts`.
  API: `routes/pace.ts` (pace per driver × track × class × fuel unit) and `routes/stints.ts`
  (plan replaced whole on save). UI: `PaceCard.tsx`, `StintPlanCard.tsx` on the event page.
- A Discord application exists; its client ID/secret are in the owner's local `.env` only.
- Production: **https://leumaplanner.com** (registered and DNS at Squarespace). First host: a
  DigitalOcean $6/month droplet running `compose.prod.yaml`; runbook in `docs/DEPLOY.md`. The
  owner's DGX Spark (ARM64) behind a Cloudflare Tunnel is a possible $0 move later.

## Non-negotiable rules

1. **Time:** the server and database store only absolute instants (UTC `timestamptz`). Timezones
   exist only at the edges (display and input). Users have an IANA zone (`America/Chicago`),
   never a fixed offset (`UTC-5`). Never use local-time getters (`getHours()` etc.) in shared or
   server code; use the helpers in `packages/shared/src/timezones.ts`.
2. **Slots (availability only):** 15 minutes, counted from the event's green flag (slot 0). A
   final partial slot counts as a slot ending at the flag. An event that includes qualifying
   (`qualifying_minutes`, whole slots) opens the availability window that much earlier: slot 0 is
   then the start of qualifying and the grid still lines up with the green flag
   (`availabilityWindow` in `packages/shared/src/slots.ts`). The stint plan covers the race only. Availability periods are half-open
   `[start, end)`. **Stints are not slot-aligned:** their times come from laps × lap time plus pit
   stops and are exact instants, laid over the slot grid for display and conflict checks.
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
6. **Every strategy number is a variable.** Lap times, consumption, tank size, refuel time,
   pit-lane loss, tyre counts and so on are user-editable values (per driver, track, class or
   event). Built-in figures, e.g. per-track pit-lane loss, are only editable starting defaults;
   never hardcode them into calculations.

## Domain model (v1)

- **Group:** created by a user, who becomes its **owner** (exactly one). The owner invites
  drivers by **invite link** and can make members **admins** with specific permission flags:
  `can_manage_members`, `can_manage_teams`, `can_manage_events`, `can_manage_availability`.
  The owner implicitly has all permissions.
- **Team:** belongs to a group; created by the owner or admins with `can_manage_teams`.
  **Drivers assign themselves** to teams (must be group members). A user can be in many groups
  and teams.
- **Event:** a race for a team: `starts_at` (UTC, the green flag), `duration_minutes`, optional
  `qualifying_minutes` before the flag (0 = none), optional track, car class, `track_timezone`. Created by owner/admins with `can_manage_events`.
- **Availability:** per driver per event, blocks of `available` / `maybe` / `unavailable`. A
  driver edits their own; owner/admins with `can_manage_availability` can edit anyone's. Saving
  replaces the driver's whole row for that event in one transaction. Only drivers on the event's
  team have a row. Moving an event keeps rows at the same real-world times, trimmed to fit.
- Authorization is checked in the API on every request against `group_members`.
- Every member of a group sees all of its teams and events. Only the owner grants or revokes
  admin flags. `can_manage_members` covers invites and removing drivers; only the owner removes
  admins. The owner can't leave (only delete the group). Invite tokens are shown once at creation;
  only their SHA-256 is stored.
- Event times cross the API as UTC ISO strings (`...Z`). The web form takes a wall-clock time in
  a chosen zone and converts it with `fromZonedInput` (DST-safe) from `packages/shared`.

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

- Windows. Repo at `C:\Users\galle\Projects\lmu-race-planner` (the local folder predates the rename). Docker hot reload is unreliable
  from Windows folders; set `VITE_POLL=true` in `.env` if edits don't show up (or use WSL). The
  API's `tsx watch` doesn't see edits either: `docker compose restart api` after changing it.
- API tests that need Postgres skip without a database URL. In the dev stack run
  `docker compose exec api pnpm --filter @le-uma/api test`: they use `TEST_DATABASE_URL`
  (`leuma_test`, created automatically), never the dev data. CI uses its throwaway `DATABASE_URL`.
- `.env` (git-ignored) holds `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, etc.
  Discord redirect URI registered: `http://localhost:5173/auth/discord/callback`.

## Open items

- Backups: skipped by the owner's choice (manual `pg_dump` in `docs/DEPLOY.md`).
- Decide whether Dependabot should be limited to minor/patch updates if PR volume is annoying.
