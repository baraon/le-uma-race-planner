-- 0006_event_strategy: race strategy settings per event. Every value is the organiser's to set;
-- the defaults are only starting points (CLAUDE.md rule 6).
ALTER TABLE events
  ADD COLUMN fuel_unit text NOT NULL DEFAULT 'percent' CHECK (fuel_unit IN ('percent', 'litres')),
  -- Usable energy (%) or tank size (litres).
  ADD COLUMN fuel_capacity double precision NOT NULL DEFAULT 100
    CHECK (fuel_capacity > 0 AND fuel_capacity <= 1000),
  -- Seconds to refuel from empty to full; a stop takes the share for the fuel added.
  ADD COLUMN refuel_seconds double precision NOT NULL DEFAULT 60
    CHECK (refuel_seconds >= 0 AND refuel_seconds <= 600),
  -- Seconds lost driving through the pit lane versus staying out.
  ADD COLUMN pit_lane_loss_seconds double precision NOT NULL DEFAULT 30
    CHECK (pit_lane_loss_seconds >= 0 AND pit_lane_loss_seconds <= 300);
