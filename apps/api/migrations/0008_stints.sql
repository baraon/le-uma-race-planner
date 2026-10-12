-- 0008_stints: the stint plan per event, in order. Times aren't stored: they're computed from
-- the event's strategy settings and drivers' pace, so changing any variable re-times the plan.
CREATE TABLE stints (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  position           integer NOT NULL CHECK (position >= 0),
  driver_id          uuid REFERENCES users (id) ON DELETE SET NULL,   -- null = not assigned yet
  spotter_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  laps_override      integer CHECK (laps_override BETWEEN 1 AND 1000),
  lap_ms_override    integer CHECK (lap_ms_override BETWEEN 10000 AND 1800000),
  extra_pit_seconds  double precision NOT NULL DEFAULT 0
                       CHECK (extra_pit_seconds >= 0 AND extra_pit_seconds <= 3600),
  notes              text CHECK (char_length(notes) <= 500),
  CONSTRAINT stints_event_position UNIQUE (event_id, position) DEFERRABLE INITIALLY DEFERRED
);
