-- Candidate-only B3 H6 reader isolation on disposable PG17. Never persist grants.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)') IS NULL OR
    to_regprocedure('sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)') IS NULL OR
    to_regprocedure('sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)') IS NULL THEN
  RAISE EXCEPTION 'B3 H6 reader signatures missing';
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sabora_b3_h6_reader_runtime'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls
  AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) THEN
  RAISE EXCEPTION 'versioned B3 H6 reader capability missing or unsafe';
 END IF;
END $$;
CREATE ROLE sabora_b3_h6_reader_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
-- Remove inherited PUBLIC EXECUTE only inside this rollback-only transaction.
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sabora' LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',fn.signature);
 END LOOP;
END $$;
GRANT sabora_b3_h6_reader_runtime TO sabora_b3_h6_reader_login WITH SET TRUE, INHERIT FALSE;
DO $$ DECLARE functions text[]; memberships text[]; BEGIN
 SELECT coalesce(array_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')' ORDER BY p.oid),'{}'::text[])
 INTO functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND has_function_privilege('sabora_b3_h6_reader_runtime',p.oid,'EXECUTE');
 IF functions <> ARRAY['sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
 'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)',
 'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)']::text[] AND
    (SELECT count(*) FROM unnest(functions) f WHERE f IN (
    'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
    'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)',
    'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)')) <> 3 THEN
  RAISE EXCEPTION 'unexpected reader function surface: %',functions;
 END IF;
 IF cardinality(functions) <> 3 THEN RAISE EXCEPTION 'extra reader grant: %',functions; END IF;
 IF EXISTS(SELECT 1 FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace
  WHERE ns.nspname='sabora' AND rel.relkind IN ('r','p')
   AND CASE WHEN rel.relkind IN ('r','p') THEN
    has_table_privilege('sabora_b3_h6_reader_runtime',rel.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END) OR
    EXISTS(SELECT 1 FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace
     WHERE ns.nspname='sabora' AND rel.relkind='S' AND
      CASE WHEN rel.relkind='S' THEN
      has_sequence_privilege('sabora_b3_h6_reader_runtime',rel.oid,'USAGE,SELECT,UPDATE') ELSE false END) THEN
  RAISE EXCEPTION 'B3 reader role has direct table or sequence privileges';
 END IF;
 IF has_schema_privilege('sabora_b3_h6_reader_runtime','sabora','CREATE') OR
    has_database_privilege('sabora_b3_h6_reader_runtime',current_database(),'CREATE') THEN
  RAISE EXCEPTION 'B3 reader role has schema or database CREATE';
 END IF;
 SELECT coalesce(array_agg(r.rolname::text ORDER BY r.rolname),'{}'::text[])
 INTO memberships FROM pg_roles r WHERE r.rolname<>'sabora_b3_h6_reader_login'
 AND pg_has_role('sabora_b3_h6_reader_login',r.oid,'SET');
 IF memberships <> ARRAY['sabora_b3_h6_reader_runtime']::text[] THEN
  RAISE EXCEPTION 'unexpected login SET ROLE: %',memberships;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='sabora' AND has_function_privilege('sabora_b3_h6_reader_login',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'login has direct function execution';
 END IF;
END $$;
SET LOCAL ROLE sabora_b3_h6_reader_login;
DO $$ BEGIN
 IF NOT pg_has_role(current_user,'sabora_b3_h6_reader_runtime','SET') THEN
  RAISE EXCEPTION 'login cannot SET reader role';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='sabora' AND p.proname='read_customer_round_h6_candidate'
   AND has_function_privilege(current_user,p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'login unexpectedly executes reader RPC';
 END IF;
END $$;
SET LOCAL ROLE sabora_b3_h6_reader_runtime;
DO $$ BEGIN
 IF NOT has_function_privilege(current_user,'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)','EXECUTE') OR
    NOT has_function_privilege(current_user,'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)','EXECUTE') OR
    NOT has_function_privilege(current_user,'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'reader cannot execute expected functions';
 END IF;
 IF to_regprocedure('sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)') IS NOT NULL AND
    has_function_privilege(current_user,'sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)','EXECUTE') THEN
  RAISE EXCEPTION 'reader can execute transfer writer';
 END IF;
END $$;
-- The reader catalog signature is canonical under both search_path variants.
SET LOCAL search_path TO sabora,public;
DO $$ DECLARE names text[]; BEGIN
 SELECT coalesce(array_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')' ORDER BY p.oid),'{}'::text[])
 INTO names FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND has_function_privilege(current_user,p.oid,'EXECUTE');
 IF cardinality(names) <> 3 OR NOT names @> ARRAY[
 'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)',
 'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
 'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)']::text[] THEN
  RAISE EXCEPTION 'reader canonical signatures changed with search_path: %',names;
 END IF;
END $$;
RESET ROLE;
-- Simulate a genuine login identity rather than SET ROLE from postgres alone.
-- session_user must be the restricted login, as required by the Node preflight.
SET SESSION AUTHORIZATION sabora_b3_h6_reader_login;
DO $$ BEGIN
 IF session_user <> 'sabora_b3_h6_reader_login' OR
    current_user <> 'sabora_b3_h6_reader_login' THEN
  RAISE EXCEPTION 'B3 reader preflight session identity mismatch';
 END IF;
 IF NOT pg_has_role(current_user,'sabora_b3_h6_reader_runtime','SET') OR
    has_schema_privilege(current_user,'sabora','CREATE') THEN
  RAISE EXCEPTION 'B3 reader login identity has invalid role or schema privileges';
 END IF;
END $$;
SET ROLE sabora_b3_h6_reader_runtime;
DO $$ BEGIN
 IF session_user <> 'sabora_b3_h6_reader_login' OR
    current_user <> 'sabora_b3_h6_reader_runtime' THEN
  RAISE EXCEPTION 'B3 reader role switch escaped login session';
 END IF;
 IF NOT has_function_privilege(current_user,
  'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)','EXECUTE') OR
    NOT has_function_privilege(current_user,
  'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)','EXECUTE') OR
    NOT has_function_privilege(current_user,
  'sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'B3 restricted login cannot assume reader capabilities';
 END IF;
END $$;
RESET ROLE;
RESET SESSION AUTHORIZATION;
ROLLBACK;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sabora_b3_h6_reader_runtime') OR
    EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sabora_b3_h6_reader_login') THEN
  RAISE EXCEPTION 'B3 H6 reader rollback changed versioned capability or retained disposable login';
 END IF;
END $$;
SELECT 'b3_h6_reader_role_rollback_verified' AS result;
