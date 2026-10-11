# Le Mans Race Planner — Plan

Agreed scope and phases. Each phase ends in something a teammate can actually use, and ships as
one or more PRs merged when CI is green.

## v1 scope

- Sign in with Discord (`identify` scope only).
- Groups → teams → events, with owner/admin permissions and invite links (see `CLAUDE.md`).
- Drivers paint their availability (Available / Maybe / Not available) on an event timeline in
  15-minute slots.
- Availability overview: one row per driver, a coverage row (drivers available per slot), gaps
  highlighted.
- Every time shown in the viewer's timezone, with a switcher for UTC, track time, or any
  teammate's zone.

**Not in v1:** Le Mans Ultimate data sync (schedules, results), stint/strategy planning, leagues,
recruitment, surveys, mobile apps, Discord bot or notifications.

## Phases

### Phase 0 — Platform setup ✅

Monorepo, Docker Compose dev stack, Postgres with migrations, lint/format/typecheck/tests, CI,
production Dockerfiles and Caddy, sample timeline with timezone switcher on the home page.

### Phase 1 — Discord login (next)

- `GET /auth/discord`: random `state` in a short-lived signed cookie; redirect to Discord authorize
  URL with `scope=identify` and `response_type=code`.
- `GET /auth/discord/callback`: verify `state`; exchange `code` server-side; `GET /users/@me`;
  upsert `users` by `discord_id`; discard Discord tokens; create session (random 32-byte token in
  cookie, SHA-256 stored); redirect to `APP_URL`.
- `POST /auth/logout`: delete session row, clear cookie.
- `GET /api/me`: current user or 401. `PATCH /api/me`: update `timezone` (validated IANA name).
- On first login, the web app sends the browser's detected timezone if the user has none set.
- Session: 30-day sliding expiry, rotated on login; purge expired rows periodically.
- Rate-limit `/auth/*`. Tests use a fake Discord (no network in tests).
- Web: sign-in page, signed-in header with avatar/name, profile page with timezone picker,
  logout.
- **Done when:** a user signs in, sees their name and avatar, sets a timezone and logs out.

### Phase 2 — Groups, teams and events

- Create a group (creator = owner). Invite links (expiry, max uses). Join via link.
- Owner grants/revokes admin flags. Admins create teams; drivers join/leave teams themselves.
- Create/edit events (UTC start + duration, track, car class, optional track timezone).
- Every endpoint authorizes against `group_members`.
- **Done when:** a manager creates an event and each driver sees it in their own local time.

### Phase 3 — Availability editor

- Paint slots by click-and-drag (mouse and touch), keyboard support (arrows move, space paints).
- "Available for whole race" and "Clear" shortcuts; explicit Save; unsaved changes flagged.
- Save replaces the driver's row in one transaction; DB constraints are the last line of defense.
- Admins with `can_manage_availability` can edit any driver's row (driver picker).
- **Done when:** drivers in different timezones paint the same slots and see identical results.

### Phase 4 — Overview and launch

- Overview: driver rows, coverage row, timezone switcher, hover details (time for you and for
  that driver), "now" marker during the race, day labels at local midnight, DST hours labelled.
- Accessibility pass (status colors paired with patterns/icons, keyboard, contrast).
- Production deploy on a small VPS with `compose.prod.yaml`, HTTPS via Caddy, nightly backups.
- **Done when:** live on the production domain with HTTPS and nightly backups.

## Required timezone test cases (keep these passing)

Same availability rendered under `America/Chicago`, `Europe/Berlin`, `Australia/Sydney`,
`Asia/Kolkata` (half-hour offset) shows identical slots; an event spanning a DST transition
(repeated and skipped hours); an event crossing local midnight.
