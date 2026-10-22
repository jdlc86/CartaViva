-- PostgreSQL 17 disposable only. Security activation gate for the candidate
-- staff table transition: no untrusted runtime role may choose p_actor.
-- The migration runner is intentionally privileged; these assertions inspect
-- effective grants and fail closed before any production route is enabled.
BEGIN;
DO $gate$
DECLARE
  r text;
  fn regprocedure := 'sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz)'::regprocedure;
  audit regclass := 'sabora.table_ordering_audit_candidate'::regclass;
  transition_proc oid;
BEGIN
  SELECT p.oid INTO transition_proc FROM pg_proc p WHERE p.oid=fn;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid=transition_proc AND p.prosecdef=false
  ) THEN RAISE EXCEPTION 'staff transition must remain SECURITY INVOKER'; END IF;
  FOREACH r IN ARRAY ARRAY['PUBLIC','anon','authenticated','sabora_admin_writer','sabora_catalog_reader'] LOOP
    IF has_function_privilege(r,fn,'EXECUTE') THEN
      RAISE EXCEPTION 'unsafe transition EXECUTE granted to %',r;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid=audit AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'audit ledger must FORCE RLS'; END IF;
  FOREACH r IN ARRAY ARRAY['PUBLIC','anon','authenticated','sabora_admin_writer','sabora_catalog_reader'] LOOP
    IF has_table_privilege(r,audit,'SELECT')
      OR has_table_privilege(r,audit,'INSERT')
      OR has_table_privilege(r,audit,'UPDATE')
      OR has_table_privilege(r,audit,'DELETE')
      OR has_table_privilege(r,audit,'TRUNCATE') THEN
      RAISE EXCEPTION 'unsafe audit ledger grant to %',r;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid=audit AND t.tgname='table_ordering_audit_candidate_immutable'
      AND t.tgenabled='O' AND (t.tgtype & 1)=1
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid=audit AND t.tgname='table_ordering_audit_candidate_no_truncate'
      AND t.tgenabled='O'
  ) THEN RAISE EXCEPTION 'append-only audit triggers missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='sabora.dining_tables'::regclass
      AND t.tgname='table_ordering_audit_candidate_capture' AND t.tgenabled='O'
  ) THEN RAISE EXCEPTION 'audit capture trigger missing'; END IF;
END $gate$;
ROLLBACK;
