-- Candidate-only B3 H6 reader isolation on disposable PG17. Never persist grants.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)') IS NULL OR
    to_regprocedure('sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'B3 H6 reader signatures missing';
 END IF;
END $$;
CREATE ROLE sabora_b3_h6_reader_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE sabora_b3_h6_reader_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA sabora TO sabora_b3_h6_reader_runtime;
-- Remove inherited PUBLIC EXECUTE only inside this rollback-only transaction.
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sabora' LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',fn.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid) TO sabora_b3_h6_reader_runtime;
GRANT EXECUTE ON FUNCTION sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text) TO sabora_b3_h6_reader_runtime;
GRANT sabora_b3_h6_reader_runtime TO sabora_b3_h6_reader_login WITH SET TRUE, INHERIT FALSE;
DO $$ DECLARE functions text[]; memberships text[]; BEGIN
 SELECT coalesce(array_agg(n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ',',')||')' ORDER BY p.oid),'{}'::text[])
 INTO functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sabora' AND has_function_privilege('sabora_b3_h6_reader_runtime',p.oid,'EXECUTE');
 IF functions <> ARRAY['sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
 'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)']::text[] AND
    (SELECT count(*) FROM unnest(functions) f WHERE f IN (
    'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)',
    'sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid)')) <> 2 THEN
  RAISE EXCEPTION 'unexpected reader function surface: %',functions;
 END IF;
 IF cardinality(functions) <> 2 THEN RAISE EXCEPTION 'extra reader grant: %',functions; END IF;
 IF EXISTS(SELECT 1 FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace
  WHERE ns.nspname='sabora' AND rel.relkind IN ('r','p')
   AND has_table_privilege('sabora_b3_h6_reader_runtime',rel.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) OR
    EXISTS(SELECT 1 FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace
     WHERE ns.nspname='sabora' AND rel.relkind='S' AND
      has_sequence_privilege('sabora_b3_h6_reader_runtime',rel.oid,'USAGE,SELECT,UPDATE')) THEN
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
    NOT has_function_privilege(current_user,'sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'reader cannot execute expected functions';
 END IF;
 IF to_regprocedure('sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)') IS NOT NULL AND
    has_function_privilege(current_user,'sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)','EXECUTE') THEN
  RAISE EXCEPTION 'reader can execute transfer writer';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
  ('sabora_b3_h6_reader_runtime','sabora_b3_h6_reader_login')) THEN
  RAISE EXCEPTION 'B3 H6 reader test roles survived transaction rollback';
 END IF;
END $$;
SELECT 'b3_h6_reader_role_rollback_verified' AS result;
