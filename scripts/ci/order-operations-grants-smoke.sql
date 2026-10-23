-- Disposable PostgreSQL 17 only. Validate the closed-by-default operational
-- boundary without granting a runtime login or touching an operational DB.
BEGIN;

DO $gate$
DECLARE
  v_role text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'sabora'
       AND relation.relname = 'order_line_transition_requests'
       AND relation.relrowsecurity
       AND relation.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'order transition request RLS missing';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['public','anon','authenticated'] LOOP
    IF has_table_privilege(v_role,
      'sabora.order_line_transition_requests','SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'unexpected order operation table privilege for %', v_role;
    END IF;
    IF has_function_privilege(v_role,
      'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)',
      'EXECUTE') THEN
      RAISE EXCEPTION 'unexpected order operation function privilege for %', v_role;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'sabora.order_line_transition_requests'::regclass
       AND contype = 'p'
  ) THEN
    RAISE EXCEPTION 'order operation idempotency key missing';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_trigger trigger
     WHERE trigger.tgrelid IN (
       'sabora.order_line_events'::regclass,
       'sabora.order_line_transition_requests'::regclass
     )
       AND trigger.tgname IN (
         'sabora_order_line_events_append_only',
         'sabora_order_line_events_no_truncate',
         'sabora_order_line_transition_requests_append_only',
         'sabora_order_line_transition_requests_no_truncate'
       )
       AND NOT trigger.tgisinternal
       AND trigger.tgenabled = 'O'
  ) <> 4 THEN
    RAISE EXCEPTION 'order operation append-only triggers missing';
  END IF;
END;
$gate$;

ROLLBACK;
