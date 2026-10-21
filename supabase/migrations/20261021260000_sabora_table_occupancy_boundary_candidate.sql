-- Candidate lifecycle hardening: a new occupancy must never inherit the
-- preceding visit's session, QR authorization or grouping clock.
-- Trigger functions are not exposed to API roles.
BEGIN;
CREATE FUNCTION sabora.table_occupancy_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,sabora AS $fn$
BEGIN
 IF OLD.ordering_state IS DISTINCT FROM NEW.ordering_state
    OR OLD.pause_until IS DISTINCT FROM NEW.pause_until THEN
  NEW.ordering_state_changed_at:=clock_timestamp();
 END IF;
 IF OLD.ordering_state<>'closed' AND NEW.ordering_state='closed' THEN
  NEW.session_id:=gen_random_uuid();
  NEW.first_confirmed_at:=NULL;
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER table_occupancy_before_update
BEFORE UPDATE ON sabora.dining_tables FOR EACH ROW
EXECUTE FUNCTION sabora.table_occupancy_before_update();

CREATE FUNCTION sabora.table_occupancy_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,sabora AS $fn$
BEGIN
 IF OLD.ordering_state<>'closed' AND NEW.ordering_state='closed' THEN
  UPDATE sabora.customer_table_visits
     SET revoked_at=clock_timestamp()
   WHERE table_id=NEW.id AND session_id=OLD.session_id
     AND revoked_at IS NULL;
 END IF;
 RETURN NULL;
END $fn$;
CREATE TRIGGER table_occupancy_after_update
AFTER UPDATE ON sabora.dining_tables FOR EACH ROW
EXECUTE FUNCTION sabora.table_occupancy_after_update();

REVOKE ALL ON FUNCTION sabora.table_occupancy_before_update() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION sabora.table_occupancy_after_update() FROM PUBLIC,anon,authenticated;
COMMIT;
