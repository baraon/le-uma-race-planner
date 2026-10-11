-- 0004_event_edit_deferred_check: moving an event now trims its availability in the same
-- transaction, so check the result at commit instead of rejecting the event update outright.
DROP TRIGGER events_check_availability ON events;
DROP FUNCTION events_check_availability();

CREATE FUNCTION events_check_availability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev        events%ROWTYPE;
  ev_end    timestamptz;
  step_secs integer;
BEGIN
  -- Re-read the event: by commit time it may have changed again since this row was queued.
  SELECT * INTO ev FROM events WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  ev_end := ev.starts_at + make_interval(mins => ev.duration_minutes);
  step_secs := ev.slot_minutes * 60;

  IF EXISTS (
    SELECT 1 FROM availability a
    WHERE a.event_id = ev.id
      AND (lower(a.period) < ev.starts_at
           OR upper(a.period) > ev_end
           OR extract(epoch FROM lower(a.period) - ev.starts_at)::bigint % step_secs <> 0
           OR (upper(a.period) <> ev_end
               AND extract(epoch FROM upper(a.period) - ev.starts_at)::bigint % step_secs <> 0))
  ) THEN
    RAISE EXCEPTION 'event % has availability outside its window or slot grid', ev.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER events_check_availability
  AFTER UPDATE OF starts_at, duration_minutes, slot_minutes ON events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION events_check_availability();
