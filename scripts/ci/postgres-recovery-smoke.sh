#!/usr/bin/env bash
set -euo pipefail
# Only called with a container owned by the isolated migration CI harness.
if [[ "${GITHUB_ACTIONS:-}" != true || -z "${RUNNER_TEMP:-}" || -z "${GITHUB_RUN_ID:-}" || "$#" -ne 1 ]]; then
 echo 'recovery_harness_required' >&2; exit 1
fi
container="$1"
case "$container" in
 "sabora-pg-single-ci-${GITHUB_RUN_ID}-"*) ;;
 *) echo 'recovery_foreign_container_denied' >&2; exit 1 ;;
esac
# Never contact a host port, VPS or Supabase. All commands are docker exec into
# the exact disposable container created by postgres-migration-smoke.sh.
docker exec "$container" psql -X -U postgres -d postgres -Atqc "select current_setting('server_version_num')::int / 10000" | grep -Fx 17
docker exec "$container" psql -X -U postgres -d postgres -Atqc "select 1 from pg_namespace where nspname='sabora'" | grep -Fx 1
# Disposable fixture: verify a failed subtransaction leaves no partial writes.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create table sabora.p2_recovery_fixture (id integer primary key, payload text not null unique);
insert into sabora.p2_recovery_fixture values (1,'committed');
do $
begin
 begin
  insert into sabora.p2_recovery_fixture values (2,'rolled_back');
  insert into sabora.p2_recovery_fixture values (1,'duplicate');
 exception when unique_violation then null;
 end;
 if exists(select 1 from sabora.p2_recovery_fixture where id=2) then
  raise exception 'partial_write_survived';
 end if;
end $;
SQL
# A consistent snapshot of the disposable database, including catalog and data.
docker exec "$container" pg_dump -U postgres -d postgres -Fc -f /tmp/sabora-recovery.dump
docker exec "$container" createdb -U postgres sabora_recovery_ci
docker exec "$container" pg_restore -U postgres -d sabora_recovery_ci --no-owner --no-acl --exit-on-error /tmp/sabora-recovery.dump
# Verify exact schema object inventory and forced-RLS table inventory.
for db in postgres sabora_recovery_ci; do
 docker exec "$container" psql -X -U postgres -d "$db" -Atqc "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relkind in ('r','p','v','m','S');"
 docker exec "$container" psql -X -U postgres -d "$db" -Atqc "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;"
done > /tmp/sabora-recovery-counts-${GITHUB_RUN_ID}-$$
mapfile -t counts < /tmp/sabora-recovery-counts-${GITHUB_RUN_ID}-$$
[[ "${#counts[@]}" -eq 4 && "${counts[0]}" = "${counts[2]}" && "${counts[1]}" = "${counts[3]}" && "${counts[1]}" -gt 0 ]] || {
 echo 'recovery_schema_or_rls_mismatch' >&2; exit 1;
}
rm -f /tmp/sabora-recovery-counts-${GITHUB_RUN_ID}-$$
# Check committed fixture, failed write absence and preserved uniqueness.
for db in postgres sabora_recovery_ci; do
 docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -Atqc "select case when count(*)=1 and min(id)=1 and min(payload)='committed' then 'ok' else 'bad' end from sabora.p2_recovery_fixture" | grep -Fx ok
 docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" <<'SQL'
do $
begin
 begin
  insert into sabora.p2_recovery_fixture values (1,'duplicate_probe');
  raise exception 'unique_constraint_missing';
 exception when unique_violation then null;
 end;
end $;
SQL
done
# No destructive rollback. The restored DB exists only in the disposable container.
echo 'sabora_disposable_backup_restore_ok'
