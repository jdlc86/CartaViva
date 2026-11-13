#!/usr/bin/env bash
set -euo pipefail
# Applies the real ordered chain once, records exact checksums, interrupts after a
# confirmed real migration and resumes without re-executing confirmed SQL.
if [[ "${GITHUB_ACTIONS:-}" != true || -z "${RUNNER_TEMP:-}" || -z "${GITHUB_RUN_ID:-}" || "$#" -ne 1 ]]; then
 echo 'migration_chain_harness_required' >&2; exit 1
fi
container="$1"
case "$container" in "sabora-pg-single-ci-${GITHUB_RUN_ID}-"*) ;; *) echo 'migration_chain_foreign_container_denied' >&2; exit 1 ;; esac
docker exec "$container" psql -X -U postgres -d postgres -Atqc "select current_setting('server_version_num')::int / 10000" | grep -Fx 17

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create schema sabora_migration_meta;
revoke all on schema sabora_migration_meta from public, anon, authenticated;
create table sabora_migration_meta.applied_migrations(
 version text primary key check(version ~ '^[0-9]{14}$'),
 name text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 application_count integer not null default 1 check(application_count=1),
 applied_at timestamptz not null default clock_timestamp()
);
revoke all on all tables in schema sabora_migration_meta from public, anon, authenticated;
SQL

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
[[ "${#migrations[@]}" -gt 1 ]] || { echo 'migration_chain_empty' >&2; exit 1; }

emit_atomic_apply_prefix(){
 local version="$1" name="$2" checksum="$3"
 cat <<SQL
SET client_min_messages=error;
BEGIN;
CREATE TEMP TABLE cv005_pending_migration(
 version text NOT NULL,
 name text NOT NULL,
 sha256 text NOT NULL
) ON COMMIT DROP;
CREATE FUNCTION pg_temp.cv005_record_committed_migration()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS \$cv005_atomic\$
BEGIN
 INSERT INTO sabora_migration_meta.applied_migrations(version,name,sha256)
 VALUES (NEW.version,NEW.name,NEW.sha256);
 RETURN NEW;
END
\$cv005_atomic\$;
CREATE CONSTRAINT TRIGGER cv005_commit_ledger
AFTER INSERT ON cv005_pending_migration
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION pg_temp.cv005_record_committed_migration();
INSERT INTO cv005_pending_migration(version,name,sha256)
VALUES ('$version','$name','$checksum');
SQL
}

ledger_status(){
 local version="$1" name="$2" checksum="$3" actual
 actual="$(docker exec "$container" psql -X -U postgres -d postgres -Atqc \
  "select name || ':' || sha256 from sabora_migration_meta.applied_migrations where version='$version'")"
 if [[ -z "$actual" ]]; then return 1; fi
 if [[ "$actual" != "$name:$checksum" ]]; then
  echo "migration_chain_checksum_drift:$version" >&2; return 42
 fi
 return 0
}

apply_or_skip(){
 local name="$1" path="supabase/migrations/$1" version checksum begin_count commit_count
 version="${name:0:14}"
 checksum="$(sha256sum "$path" | cut -d' ' -f1)"
 [[ "$version" =~ ^[0-9]{14}$ && "$checksum" =~ ^[a-f0-9]{64}$ && "$name" =~ ^[0-9]{14}_[A-Za-z0-9_-]+\.sql$ ]] || {
  echo 'migration_chain_invalid_manifest_entry' >&2; exit 1;
 }
 begin_count="$(grep -ci '^BEGIN;$' "$path" || true)"
 commit_count="$(grep -ci '^COMMIT;$' "$path" || true)"
 [[ "$begin_count" -eq 1 && "$commit_count" -eq 1 ]] || {
  echo "migration_chain_transaction_boundary_invalid:$name:$begin_count:$commit_count" >&2; exit 1;
 }
 if ledger_status "$version" "$name" "$checksum"; then
  return 0
 else
  local status=$?
  [[ "$status" -eq 1 ]] || return "$status"
 fi
 # The migration's own final COMMIT fires the deferred ledger trigger. SQL and
 # checksum therefore either commit together or both roll back on interruption.
 {
  emit_atomic_apply_prefix "$version" "$name" "$checksum"
  cat "$path"
 } | docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
}

assert_precommit_interruption_atomic(){
 local version='00000000000000' name='00000000000000_atomicity_probe.sql'
 local checksum probe_app client_pid backend_pid status state
 checksum="$(printf '0%.0s' {1..64})"
 probe_app="sabora_chain_precommit_probe_${GITHUB_RUN_ID}_$$"
 (
  {
   emit_atomic_apply_prefix "$version" "$name" "$checksum"
   cat <<'SQL'
BEGIN;
CREATE TABLE public.sabora_chain_atomicity_probe(id integer PRIMARY KEY);
SELECT pg_sleep(30);
COMMIT;
SQL
  } | docker exec -i "$container" env PGAPPNAME="$probe_app" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
 ) >/dev/null 2>&1 &
 client_pid=$!
 backend_pid=''
 for _ in $(seq 1 100); do
  backend_pid="$(docker exec "$container" psql -X -U postgres -d postgres -Atqc \
   "select pid from pg_stat_activity where application_name='$probe_app' and state='active' limit 1")"
  [[ -n "$backend_pid" ]] && break
  sleep 0.1
 done
 [[ -n "$backend_pid" ]] || {
  kill "$client_pid" >/dev/null 2>&1 || true; wait "$client_pid" || true
  echo 'migration_chain_precommit_probe_not_observed' >&2; exit 1;
 }
 docker exec "$container" psql -X -U postgres -d postgres -Atqc \
  "select pg_terminate_backend($backend_pid)" | grep -Fx t >/dev/null
 set +e
 wait "$client_pid"
 status=$?
 set -e
 [[ "$status" -ne 0 ]] || { echo 'migration_chain_precommit_probe_not_interrupted' >&2; exit 1; }
 state="$(docker exec "$container" psql -X -U postgres -d postgres -Atqc \
  "select (to_regclass('public.sabora_chain_atomicity_probe') is null)::int || '|' ||
          (select count(*) from sabora_migration_meta.applied_migrations where version='$version')")"
 [[ "$state" == '1|0' ]] || {
  echo "migration_chain_precommit_atomicity_failed:$state" >&2; exit 1;
 }
 echo 'sabora_migration_chain_precommit_atomicity_verified'
}

assert_precommit_interruption_atomic

run_chain(){
 local stop_after="${1:-}" name
 for name in "${migrations[@]}"; do
  apply_or_skip "$name" || return $?
  if [[ -n "$stop_after" && "${name:0:14}" == "$stop_after" ]]; then
   return 75
  fi
 done
}

midpoint_index=$(( ${#migrations[@]} / 2 ))
midpoint_name="${migrations[$midpoint_index]}"
midpoint_version="${midpoint_name:0:14}"
set +e
run_chain "$midpoint_version"
interrupted_status=$?
set -e
[[ "$interrupted_status" -eq 75 ]] || { echo 'migration_chain_post_commit_interruption_missing' >&2; exit 1; }
midpoint_applied_at="$(docker exec "$container" psql -X -U postgres -d postgres -Atqc "select applied_at from sabora_migration_meta.applied_migrations where version='$midpoint_version'")"
[[ -n "$midpoint_applied_at" ]] || { echo 'migration_chain_midpoint_not_confirmed' >&2; exit 1; }

# Resume the exact chain. Confirmed versions are checksum-validated and skipped.
run_chain
[[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atqc 'select count(*) from sabora_migration_meta.applied_migrations')" -eq "${#migrations[@]}" ]]
[[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atqc 'select coalesce(max(application_count),0) from sabora_migration_meta.applied_migrations')" -eq 1 ]]
[[ "$(docker exec "$container" psql -X -U postgres -d postgres -Atqc "select applied_at from sabora_migration_meta.applied_migrations where version='$midpoint_version'")" == "$midpoint_applied_at" ]]

# A confirmed version with a different expected checksum is rejected before SQL.
midpoint_checksum="$(sha256sum "supabase/migrations/$midpoint_name" | cut -d' ' -f1)"
tampered_checksum="${midpoint_checksum%?}0"
[[ "$tampered_checksum" != "$midpoint_checksum" ]] || tampered_checksum="${midpoint_checksum%?}1"
if ledger_status "$midpoint_version" "$midpoint_name" "$tampered_checksum" 2>/dev/null; then
 echo 'migration_chain_checksum_drift_not_rejected' >&2; exit 1
else
 drift_status=$?
 [[ "$drift_status" -eq 42 ]] || { echo 'migration_chain_checksum_probe_invalid' >&2; exit 1; }
fi

echo "sabora_real_migration_chain_resume_ok:${#migrations[@]}:$midpoint_version"
