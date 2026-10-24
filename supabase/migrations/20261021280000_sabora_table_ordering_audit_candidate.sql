-- Candidate immutable database-origin audit for every table ordering transition.
-- The actor is intentionally NULL: database triggers cannot safely infer the
-- authenticated staff principal from a user-controlled session setting.
BEGIN;
CREATE TABLE sabora.table_ordering_audit_candidate (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 old_state text NOT NULL,
 new_state text NOT NULL,
 old_session_id uuid NOT NULL,
 new_session_id uuid NOT NULL,
 old_pause_until timestamptz,
 new_pause_until timestamptz,
 actor_user_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT table_ordering_audit_actual_change CHECK
  (old_state<>new_state OR old_pause_until IS DISTINCT FROM new_pause_until)
);
ALTER TABLE sabora.table_ordering_audit_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.table_ordering_audit_candidate FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.table_ordering_audit_candidate
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;
CREATE FUNCTION sabora.capture_table_ordering_audit_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,sabora AS $body$
BEGIN
 IF OLD.ordering_state IS DISTINCT FROM NEW.ordering_state
    OR OLD.pause_until IS DISTINCT FROM NEW.pause_until THEN
  INSERT INTO sabora.table_ordering_audit_candidate
   (table_id,old_state,new_state,old_session_id,new_session_id,
    old_pause_until,new_pause_until)
  VALUES(NEW.id,OLD.ordering_state,NEW.ordering_state,
   OLD.session_id,NEW.session_id,OLD.pause_until,NEW.pause_until);
 END IF;
 RETURN NULL;
END $body$;
CREATE TRIGGER table_ordering_audit_candidate_capture
AFTER UPDATE ON sabora.dining_tables FOR EACH ROW
EXECUTE FUNCTION sabora.capture_table_ordering_audit_candidate();
CREATE FUNCTION sabora.reject_table_ordering_audit_mutation_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,sabora AS $body$
BEGIN
 RAISE EXCEPTION 'table_ordering_audit_append_only' USING ERRCODE='42501';
END $body$;
CREATE TRIGGER table_ordering_audit_candidate_immutable
BEFORE UPDATE OR DELETE ON sabora.table_ordering_audit_candidate
FOR EACH ROW EXECUTE FUNCTION sabora.reject_table_ordering_audit_mutation_candidate();
REVOKE ALL ON FUNCTION sabora.capture_table_ordering_audit_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;
REVOKE ALL ON FUNCTION sabora.reject_table_ordering_audit_mutation_candidate()
 FROM PUBLIC,anon,authenticated,sabora_admin_writer,sabora_catalog_reader;
COMMIT;
