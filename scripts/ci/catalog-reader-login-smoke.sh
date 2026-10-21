#!/usr/bin/env bash
set -euo pipefail
container="${1:?PostgreSQL container required}"
# Disposable PostgreSQL only. Never run against operational Supabase.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE sabora_catalog_login LOGIN NOINHERIT NOBYPASSRLS PASSWORD 'ci-only-catalog-password';
GRANT sabora_catalog_reader TO sabora_catalog_login;
-- Schema name resolution only; NO table SELECT or function EXECUTE is granted.
GRANT USAGE ON SCHEMA sabora TO sabora_catalog_login;
SQL
# Verify the login has no direct access before SET LOCAL ROLE.
docker exec -e PGPASSWORD=ci-only-catalog-password -i "$container" \
 psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U sabora_catalog_login -d postgres <<'SQL'
DO $verify$
BEGIN
 IF current_user <> 'sabora_catalog_login' THEN RAISE EXCEPTION 'wrong login'; END IF;
 IF has_table_privilege(current_user,'sabora.catalog_items','SELECT')
    OR has_table_privilege(current_user,'sabora.catalog_items','INSERT')
    OR has_table_privilege(current_user,'sabora.catalog_items','UPDATE')
    OR has_table_privilege(current_user,'sabora.catalog_items','DELETE') THEN
  RAISE EXCEPTION 'catalog login has direct table access';
 END IF;
 IF (SELECT rolinherit FROM pg_roles WHERE rolname=current_user)
    OR (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'catalog login has unsafe role attributes';
 END IF;
 IF has_function_privilege(current_user,'sabora.read_published_catalog()','EXECUTE') THEN
  RAISE EXCEPTION 'catalog login inherited RPC execution';
 END IF;
END $verify$;
-- Exercise denial as the real login, not only privilege metadata.
DO $deny_direct_rpc$
BEGIN
 BEGIN
  PERFORM count(*) FROM sabora.read_published_catalog();
  RAISE EXCEPTION 'catalog login executed restricted RPC without role switch';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $deny_direct_rpc$;
BEGIN;
SET LOCAL ROLE sabora_catalog_reader;
SELECT count(*) FROM sabora.read_published_catalog();
DO $deny$
BEGIN
 IF has_table_privilege(current_user,'sabora.catalog_items','SELECT')
    OR has_table_privilege(current_user,'sabora.catalog_items','INSERT')
    OR has_table_privilege(current_user,'sabora.catalog_items','UPDATE')
    OR has_table_privilege(current_user,'sabora.catalog_items','DELETE') THEN
  RAISE EXCEPTION 'catalog reader gained direct table privileges';
 END IF;
END $deny$;
-- Verify SQL privilege denial by actually issuing table queries, not just ACL metadata.
DO $catalog_table_denials$
BEGIN
 BEGIN
  PERFORM count(*) FROM sabora.catalog_items;
  RAISE EXCEPTION 'catalog reader selected catalog table directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE sabora.catalog_items SET sold_out=true WHERE false;
  RAISE EXCEPTION 'catalog reader updated catalog table directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $catalog_table_denials$;
-- Confirm the activated reader role cannot reach private customer or staff tables.
DO $private_denials$
BEGIN
 BEGIN
  PERFORM count(*) FROM sabora.customer_profiles;
  RAISE EXCEPTION 'catalog reader accessed customer profiles';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM count(*) FROM sabora.customer_sessions;
  RAISE EXCEPTION 'catalog reader accessed customer sessions';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM count(*) FROM sabora.staff_members;
  RAISE EXCEPTION 'catalog reader accessed staff';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $private_denials$;
COMMIT;
DO $verify_reset$
BEGIN
 IF current_user <> 'sabora_catalog_login' THEN RAISE EXCEPTION 'role leaked'; END IF;
 IF has_function_privilege(current_user,'sabora.read_published_catalog()','EXECUTE') THEN
  RAISE EXCEPTION 'restricted RPC remained executable after COMMIT';
 END IF;
 BEGIN
  PERFORM count(*) FROM sabora.read_published_catalog();
  RAISE EXCEPTION 'catalog login executed restricted RPC after COMMIT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $verify_reset$;
SQL
