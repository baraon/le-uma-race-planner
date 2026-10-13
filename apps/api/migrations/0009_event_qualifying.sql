-- 0009_event_qualifying: an event can include qualifying before the green flag. Drivers then mark
-- availability from the start of qualifying, so the availability window opens that much earlier.
-- Qualifying is a whole number of slots, which keeps the slot grid lined up with the green flag.
ALTER TABLE events
  ADD COLUMN qualifying_minutes integer NOT NULL DEFAULT 0
    CHECK (qualifying_minutes BETWEEN 0 AND 240 AND qualifying_minutes % slot_minutes = 0);

-- Blocks must sit inside the window (qualifying + race) and start/end on slot boundaries (or end
-- at the flag).
CREATE OR REPLACE FUNCTION availability_check_window() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev        events%ROWTYPE;
  win_start timestamptz;
  ev_end    timestamptz;
  step_secs integer;
BEGIN
  SELECT * INTO ev FROM events WHERE id = NEW.event_id;
  win_start := ev.starts_at - make_interval(mins => ev.qualifying_minutes);
  ev_end := ev.starts_at + make_interval(mins => ev.duration_minutes);
  step_secs := ev.slot_minutes * 60;

  IF lower(NEW.period) < win_start OR upper(NEW.period) > ev_end THEN
    RAISE EXCEPTION 'availability period % is outside the event window', NEW.period
      USING ERRCODE = 'check_violation';
  END IF;

  IF extract(epoch FROM lower(NEW.period) - win_start)::bigint % step_secs <> 0
     OR (upper(NEW.period) <> ev_end
         AND extract(epoch FROM upper(NEW.period) - win_start)::bigint % step_secs <> 0) THEN
    RAISE EXCEPTION 'availability period % is not aligned to % minute slots',
      NEW.period, ev.slot_minutes
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- The same check from the event's side, at commit, now also when qualifying changes.
CREATE OR REPLACE FUNCTION events_check_availability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev        events%ROWTYPE;
  win_start timestamptz;
  ev_end    timestamptz;
  step_secs integer;
BEGIN
  -- Re-read the event: by commit time it may have changed again since this row was queued.
  SELECT * INTO ev FROM events WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  win_start := ev.starts_at - make_interval(mins => ev.qualifying_minutes);
  ev_end := ev.starts_at + make_interval(mins => ev.duration_minutes);
  step_secs := ev.slot_minutes * 60;

  IF EXISTS (
    SELECT 1 FROM availability a
    WHERE a.event_id = ev.id
      AND (lower(a.period) < win_start
           OR upper(a.period) > ev_end
           OR extract(epoch FROM lower(a.period) - win_start)::bigint % step_secs <> 0
           OR (upper(a.period) <> ev_end
               AND extract(epoch FROM upper(a.period) - win_start)::bigint % step_secs <> 0))
  ) THEN
    RAISE EXCEPTION 'event % has availability outside its window or slot grid', ev.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER events_check_availability ON events;
CREATE CONSTRAINT TRIGGER events_check_availability
  AFTER UPDATE OF starts_at, duration_minutes, slot_minutes, qualifying_minutes ON events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION events_check_availability();
