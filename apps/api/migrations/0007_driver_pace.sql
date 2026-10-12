-- 0007_driver_pace: each driver's race pace per track and car class, reused by every event at
-- that track and class. Values are the driver's own estimates (CLAUDE.md rule 6).
CREATE TABLE driver_pace (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Display names as entered, plus normalised keys (trimmed, single spaces, lower case).
  track                text NOT NULL CHECK (char_length(track) BETWEEN 1 AND 80),
  track_key            text NOT NULL CHECK (track_key = lower(regexp_replace(btrim(track), '\s+', ' ', 'g'))),
  car_class            text NOT NULL CHECK (char_length(car_class) BETWEEN 1 AND 40),
  class_key            text NOT NULL CHECK (class_key = lower(regexp_replace(btrim(car_class), '\s+', ' ', 'g'))),
  -- Consumption is only meaningful with its unit: energy % or litres per lap.
  fuel_unit            text NOT NULL CHECK (fuel_unit IN ('percent', 'litres')),
  lap_ms               integer NOT NULL CHECK (lap_ms BETWEEN 10000 AND 1800000),
  consumption_per_lap  double precision NOT NULL CHECK (consumption_per_lap > 0 AND consumption_per_lap <= 1000),
  updated_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, track_key, class_key, fuel_unit)
);
