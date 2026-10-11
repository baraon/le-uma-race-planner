-- 0005_event_min_drivers: how many drivers an event needs available at once. The overview
-- highlights slots below it. NULL means "at least one".
ALTER TABLE events ADD COLUMN min_drivers smallint CHECK (min_drivers BETWEEN 1 AND 20);
