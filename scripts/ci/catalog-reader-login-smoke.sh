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
COMMIT;
DO $verify_reset$
BEGIN
 IF current_user <> 'sabora_catalog_login' THEN RAISE EXCEPTION 'role leaked'; END IF;
END $verify_reset$;
SQL
