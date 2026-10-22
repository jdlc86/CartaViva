-- Disposable PostgreSQL 17 only. This gate must FAIL if a candidate
-- economic writer or legacy confirm_order becomes callable by runtime roles.
-- Read-only catalog/ACL assertions, wrapped in a transaction for CI hygiene.
BEGIN;
DO $gate$
DECLARE
  role_name text;
  table_name text;
  trigger_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
   'anon','authenticated','sabora_admin_writer',
   'sabora_catalog_reader','sabora_staff_reader'
  ] LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
    RAISE EXCEPTION 'missing expected isolated role: %',role_name;
   END IF;
   FOREACH table_name IN ARRAY ARRAY[
    'catalog_displayed_quotes','catalog_confirmation_attempts'
   ] LOOP
    IF has_table_privilege(role_name,'sabora.'||table_name,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
     RAISE EXCEPTION 'economic ledger privilege leaked: % %',role_name,table_name;
    END IF;
   END LOOP;
   IF has_function_privilege(role_name,
      'sabora.confirm_order(uuid,text,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'legacy confirm_order callable by runtime: %',role_name;
   END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
   'catalog_displayed_quotes','catalog_confirmation_attempts'
  ] LOOP
   IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='sabora' AND c.relname=table_name
      AND c.relrowsecurity AND c.relforcerowsecurity
   ) THEN
    RAISE EXCEPTION 'economic ledger RLS not forced: %',table_name;
   END IF;
   FOREACH trigger_name IN ARRAY ARRAY[
    table_name||'_append_only',table_name||'_no_truncate'
   ] LOOP
    IF NOT EXISTS (
     SELECT 1 FROM pg_trigger tr
     JOIN pg_class c ON c.oid=tr.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     JOIN pg_proc p ON p.oid=tr.tgfoid
     JOIN pg_namespace pn ON pn.oid=p.pronamespace
     WHERE n.nspname='sabora' AND c.relname=table_name
       AND tr.tgname=trigger_name AND tr.tgenabled IN ('O','A')
       AND NOT tr.tgisinternal
       AND pn.nspname='sabora' AND p.proname='reject_catalog_ledger_mutation'
       AND ((
        trigger_name=table_name||'_append_only'
        AND (tr.tgtype & 1)=1 AND (tr.tgtype & 2)=2
        AND (tr.tgtype & 16)=16 AND (tr.tgtype & 8)=8
       ) OR (
        trigger_name=table_name||'_no_truncate'
        AND (tr.tgtype & 1)=0 AND (tr.tgtype & 2)=2
        AND (tr.tgtype & 32)=32
       ))
    ) THEN
     RAISE EXCEPTION 'economic ledger mutation guard missing or disabled: %',trigger_name;
    END IF;
   END LOOP;
   IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='sabora' AND tablename=table_name
   ) THEN
    RAISE EXCEPTION 'economic ledger unexpectedly has runtime policy: %',table_name;
   END IF;
  END LOOP;

  IF EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='sabora' AND p.proname='reject_catalog_ledger_mutation'
     AND p.prosecdef
  ) THEN
   RAISE EXCEPTION 'economic ledger mutation guard must be security invoker';
  END IF;
  IF EXISTS (
   SELECT 1 FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   CROSS JOIN LATERAL aclexplode(
    COALESCE(p.proacl,acldefault('f',p.proowner))) acl
   WHERE n.nspname='sabora' AND p.proname='reject_catalog_ledger_mutation'
     AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN
   RAISE EXCEPTION 'economic ledger mutation guard exposed to PUBLIC';
  END IF;

  IF NOT EXISTS (
   SELECT 1 FROM pg_constraint con
   JOIN pg_class c ON c.oid=con.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='sabora' AND c.relname='catalog_confirmation_attempts'
    AND con.conname='catalog_confirmation_idempotency' AND con.contype='u'
  ) THEN
   RAISE EXCEPTION 'missing economic idempotency unique constraint';
  END IF;
  IF NOT EXISTS (
   SELECT 1 FROM pg_constraint con
   JOIN pg_class c ON c.oid=con.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='sabora' AND c.relname='catalog_confirmation_attempts'
    AND con.conname='catalog_confirmation_quote_scope' AND con.contype='f'
  ) THEN
   RAISE EXCEPTION 'missing scoped quote foreign key';
  END IF;
END;
$gate$;
ROLLBACK;
