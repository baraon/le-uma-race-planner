-- 0003_group_integrity: rules for groups and teams that the database can hold on its own.

-- Role and permission flags agree: admins have at least one flag, members none, and the owner
-- none stored (the owner implicitly has every permission).
ALTER TABLE group_members ADD CONSTRAINT group_members_role_matches_flags CHECK (
  CASE role
    WHEN 'admin' THEN can_manage_members OR can_manage_teams OR can_manage_events
                      OR can_manage_availability
    ELSE NOT (can_manage_members OR can_manage_teams OR can_manage_events
              OR can_manage_availability)
  END
);

-- A new group must have its owner_id as its 'owner' member by the end of the transaction.
CREATE FUNCTION groups_check_owner_member() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = NEW.id AND user_id = NEW.owner_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'group % has no owner membership for user %', NEW.id, NEW.owner_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER groups_check_owner_member
  AFTER INSERT OR UPDATE OF owner_id ON groups
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION groups_check_owner_member();

-- The owner's membership can't be removed or demoted while the group exists (deleting the
-- group itself still cascades).
CREATE FUNCTION group_members_protect_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.user_id <> OLD.user_id)
     AND EXISTS (SELECT 1 FROM groups WHERE id = OLD.group_id AND owner_id = OLD.user_id) THEN
    RAISE EXCEPTION 'the owner of group % cannot be removed or demoted', OLD.group_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER group_members_protect_owner
  BEFORE UPDATE OR DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_protect_owner();

-- Only members of a team's group can be on the team.
CREATE FUNCTION team_members_check_group() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teams t
    JOIN group_members gm ON gm.group_id = t.group_id AND gm.user_id = NEW.user_id
    WHERE t.id = NEW.team_id
  ) THEN
    RAISE EXCEPTION 'user % is not a member of the group of team %', NEW.user_id, NEW.team_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_members_check_group
  BEFORE INSERT OR UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION team_members_check_group();

-- Leaving (or being removed from) a group also takes you off its teams.
CREATE FUNCTION group_members_leave_teams() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM team_members tm
  USING teams t
  WHERE tm.team_id = t.id AND t.group_id = OLD.group_id AND tm.user_id = OLD.user_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER group_members_leave_teams
  AFTER DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION group_members_leave_teams();

-- Moving or shortening an event must not strand availability outside the race or off its slot
-- grid (the availability trigger only runs when availability itself is written).
CREATE FUNCTION events_check_availability() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev_end    timestamptz := NEW.starts_at + make_interval(mins => NEW.duration_minutes);
  step_secs integer := NEW.slot_minutes * 60;
BEGIN
  IF EXISTS (
    SELECT 1 FROM availability a
    WHERE a.event_id = NEW.id
      AND (lower(a.period) < NEW.starts_at
           OR upper(a.period) > ev_end
           OR extract(epoch FROM lower(a.period) - NEW.starts_at)::bigint % step_secs <> 0
           OR (upper(a.period) <> ev_end
               AND extract(epoch FROM upper(a.period) - NEW.starts_at)::bigint % step_secs <> 0))
  ) THEN
    RAISE EXCEPTION 'event % has availability that would fall outside its new window', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_check_availability
  BEFORE UPDATE OF starts_at, duration_minutes, slot_minutes ON events
  FOR EACH ROW EXECUTE FUNCTION events_check_availability();

CREATE INDEX group_invites_group_id_idx ON group_invites (group_id);
