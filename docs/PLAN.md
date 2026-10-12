# Le Uma Race Planner — Plan

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

**Not in v1:** syncing data from the game (schedules, results), stint/strategy planning, leagues,
recruitment, surveys, mobile apps, Discord bot or notifications.

## Phases

### Phase 0 — Platform setup ✅

Monorepo, Docker Compose dev stack, Postgres with migrations, lint/format/typecheck/tests, CI,
production Dockerfiles and Caddy, sample timeline with timezone switcher on the home page.

### Phase 1 — Discord login ✅

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

### Phase 2 — Groups, teams and events ✅

- Create a group (creator = owner). Invite links (expiry, max uses). Join via link.
- Owner grants/revokes admin flags. Admins create teams; drivers join/leave teams themselves.
- Create/edit events (UTC start + duration, track, car class, optional track timezone).
- Every endpoint authorizes against `group_members`.
- **Done when:** a manager creates an event and each driver sees it in their own local time.

### Phase 3 — Availability editor ✅

- Paint slots by click-and-drag (mouse and touch), keyboard support (arrows move, space paints).
- "Available for whole race" and "Clear" shortcuts; explicit Save; unsaved changes flagged.
- Save replaces the driver's row in one transaction; DB constraints are the last line of defense.
- Admins with `can_manage_availability` can edit any driver's row (driver picker).
- Decided: when an event moves or changes length, saved availability keeps its real-world times,
  trimmed to the new window and shrunk to whole slots of the new grid (`clipToWindow`).
- Only drivers on the event's team have a row; every group member can read all rows.
- Long races: the editor and overview wrap onto 6-hour rows (races over 8 h). Painting is always
  in 15-minute slots; coarser brush sizes were tried and dropped as unnecessary once rows wrapped.
- **Done when:** drivers in different timezones paint the same slots and see identical results.

### Phase 4 — Overview and launch ✅

- Overview: driver rows, coverage row against an optional "drivers needed at once"
  (`events.min_drivers`), written gap list, zone switcher (you, UTC, track, any teammate),
  hover/tap/keyboard details, "now" marker, date marks at local midnight, clock-change badges,
  6-hour rows for long races.
- Accessibility pass: axe (WCAG 2.2 A/AA) clean on every page at desktop and phone widths;
  status colors paired with patterns; underlined in-text links; strong focus outline; skip link;
  keyboard access to the editor and overview; per-page titles.
- Live at https://leumaplanner.com (DigitalOcean London, HTTPS via Caddy). Nightly backups were
  skipped by the owner's choice; `docs/DEPLOY.md` has the manual `pg_dump` command.
- Terms of Service and Privacy Policy published (`/terms`, `/privacy`).

### Phase 5 — Stint planner (built; awaiting owner check)

Inspired by the team's 24 h stint spreadsheet; every number is an editable variable (CLAUDE.md
rule 6), the spreadsheet's figures are at most starting defaults.

- Track list in shared code: name, timezone, default pit-lane time loss (editable per event).
- Race strategy settings per event: fuel measured as energy % or litres, usable capacity, full
  refuel time, pit-lane time loss.
- Pace profiles per driver × track × car class: race lap time and consumption per lap. Drivers
  enter their own; managers can edit anyone's. Missing values fall back to the team average and
  are flagged "estimated".
- Stint lineup per event: ordered stints with driver and spotter; per-stint overrides for laps,
  lap time and extra pit time. Laps per stint = whole laps the tank allows; stint length = laps ×
  lap time; pit stop = pit-lane loss + refuel time for the fuel added + extra. Times shown in each
  viewer's zone; the last stint ends at the flag.
- Availability conflicts: flag stints whose driver or spotter is Not available / Maybe / no
  answer in that window. Driving-time fairness per driver (stints, laps, minutes). Projected laps.
- Privacy policy covers pace data.
- Stint timeline (one row per driver, blocks at exact times, pit-stop row, availability tinted
  behind each row, blocks jump to their table row; always sticky on large screens) and a Display
  menu (table columns; timezone: track / browser / you / each person, identical zones merged, no
  UTC; saved per browser). Each stint row leads with a drag handle (drag, or arrow keys) and a
  driver status icon: ✓ available, ⚠ maybe or no answer, ✕ not available.
- **Done when:** a manager builds a 24 h lineup from drivers' own pace numbers and sees exact
  stint times, conflicts and driving time per driver.

### Phase 6 — Pit stops, tyres and game clock

- Tyre allocation (sets available, used in qualifying), per-stop tyre changes per corner
  (new / used / no change), seconds per tyre change, remaining-tyre warnings.
- Per-stint pace adjustments (night, rain, worn tyres).
- In-game start time and time scale: track time of day per stint.
- Display menu gains a "Sim time" column once the in-game clock exists.

### Phase 7 — Race day and extras

- Live mode: countdown, who's driving / next, enter actual pit laps and repair time, re-plan the
  rest; optionally refine driver averages from real laps.
- Stint notes and per-driver setup preferences shown to the next driver (a "Setup" column, like
  the reference tool's dry / wet / eco). Weather is out of scope unless a data source appears.
- Auto-suggested lineup from availability and fairness. Export (print / CSV / Discord text).

## Required timezone test cases (keep these passing)

Same availability rendered under `America/Chicago`, `Europe/Berlin`, `Australia/Sydney`,
`Asia/Kolkata` (half-hour offset) shows identical slots; an event spanning a DST transition
(repeated and skipped hours); an event crossing local midnight.
