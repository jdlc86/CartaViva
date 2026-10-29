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
 local name="$1" path="supabase/migrations/$1" version checksum
 version="${name:0:14}"
 checksum="$(sha256sum "$path" | cut -d' ' -f1)"
 [[ "$version" =~ ^[0-9]{14}$ && "$checksum" =~ ^[a-f0-9]{64}$ && "$name" =~ ^[0-9]{14}_[A-Za-z0-9_-]+\.sql$ ]] || {
  echo 'migration_chain_invalid_manifest_entry' >&2; exit 1;
 }
 if ledger_status "$version" "$name" "$checksum"; then
  return 0
 else
  local status=$?
  [[ "$status" -eq 1 ]] || return "$status"
 fi
 docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$path"
 docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
insert into sabora_migration_meta.applied_migrations(version,name,sha256)
values ('$version','$name','$checksum');
SQL
}

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
