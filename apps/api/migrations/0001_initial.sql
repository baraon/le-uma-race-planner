-- 0001_initial: users, sessions, groups, teams, events and availability.
-- Every timestamp is timestamptz (an absolute instant). Timezones are a display concern only.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE group_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE availability_status AS ENUM ('available', 'maybe', 'unavailable');

-- Identity comes from Discord's `identify` scope only. No email, no Discord tokens stored.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id    text NOT NULL UNIQUE,
  username      text NOT NULL,
  display_name  text,
  avatar_hash   text,
  timezone      text NOT NULL DEFAULT 'UTC',   -- IANA name, validated by the API
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          text PRIMARY KEY,                -- SHA-256 of the cookie token
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- A group is created by one user (its owner). The owner grants admins specific permissions.
CREATE TABLE groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_id    uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id                 uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role                     group_role NOT NULL DEFAULT 'member',
  can_manage_members       boolean NOT NULL DEFAULT false,
  can_manage_teams         boolean NOT NULL DEFAULT false,
  can_manage_events        boolean NOT NULL DEFAULT false,
  can_manage_availability  boolean NOT NULL DEFAULT false,
  joined_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_id_idx ON group_members (user_id);
-- Exactly one owner row per group.
CREATE UNIQUE INDEX group_members_one_owner_idx ON group_members (group_id) WHERE role = 'owner';

CREATE TABLE group_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,            -- SHA-256 of the invite token in the link
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at  timestamptz,
  max_uses    integer CHECK (max_uses IS NULL OR max_uses > 0),
  use_count   integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (max_uses IS NULL OR use_count <= max_uses)
);

CREATE TABLE teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);

-- Drivers add and remove themselves. Group membership is checked by the API.
CREATE TABLE team_members (
  team_id    uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user_id_idx ON team_members (user_id);

CREATE TABLE events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  name              text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  track             text,
  car_class         text,
  starts_at         timestamptz NOT NULL,      -- green flag, UTC instant
  duration_minutes  integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 2880),
  slot_minutes      integer NOT NULL DEFAULT 15 CHECK (slot_minutes = 15),
  track_timezone    text,                      -- optional IANA name for "track time" display
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_team_starts_idx ON events (team_id, starts_at);

-- One row per run of same-status slots for one driver. Periods are half-open [start, end).
CREATE TABLE availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  period      tstzrange NOT NULL,
  status      availability_status NOT NULL,
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_period_shape
    CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period)
           AND NOT lower_inf(period) AND NOT upper_inf(period)),
  -- A driver can't have two overlapping blocks in the same event.
  CONSTRAINT availability_no_overlap
    EXCLUDE USING gist (event_id WITH =, user_id WITH =, period WITH &&)
);

-- Blocks must sit inside the race and start/end on slot boundaries (or end at the flag).
CREATE FUNCTION availability_check_window() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev        events%ROWTYPE;
  ev_end    timestamptz;
  step_secs integer;
BEGIN
  SELECT * INTO ev FROM events WHERE id = NEW.event_id;
  ev_end := ev.starts_at + make_interval(mins => ev.duration_minutes);
  step_secs := ev.slot_minutes * 60;

  IF lower(NEW.period) < ev.starts_at OR upper(NEW.period) > ev_end THEN
    RAISE EXCEPTION 'availability period % is outside the event window', NEW.period
      USING ERRCODE = 'check_violation';
  END IF;

  IF extract(epoch FROM lower(NEW.period) - ev.starts_at)::bigint % step_secs <> 0
     OR (upper(NEW.period) <> ev_end
         AND extract(epoch FROM upper(NEW.period) - ev.starts_at)::bigint % step_secs <> 0) THEN
    RAISE EXCEPTION 'availability period % is not aligned to % minute slots',
      NEW.period, ev.slot_minutes
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER availability_check_window
  BEFORE INSERT OR UPDATE OF period, event_id ON availability
  FOR EACH ROW EXECUTE FUNCTION availability_check_window();
