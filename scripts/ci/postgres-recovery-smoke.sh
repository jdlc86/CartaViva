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
P3_RECOVERY_ROWS=10000
P3_LOCK_TIMEOUT_MS=500
P3_CI_RTO_BUDGET_MS=180000
now_ms(){ date +%s%3N; }
recovery_started_ms="$(now_ms)"
# Disposable fixture: verify a failed subtransaction leaves no partial writes.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -v p3_recovery_rows="$P3_RECOVERY_ROWS" -U postgres -d postgres <<'SQL'
create table sabora.p2_recovery_fixture (id integer primary key, payload text not null unique);
insert into sabora.p2_recovery_fixture values (1,'committed');
create table sabora.p3_recovery_load_fixture (
 id integer primary key,
 payload text not null,
 constraint p3_recovery_load_payload_size check (octet_length(payload)=64)
);
insert into sabora.p3_recovery_load_fixture(id,payload)
select value,md5(value::text)||md5(('sabora:'||value)::text)
from generate_series(1,:p3_recovery_rows) value;
create index p3_recovery_load_payload_prefix_idx
 on sabora.p3_recovery_load_fixture ((left(payload,8)));
do $do$
begin
 begin
  insert into sabora.p2_recovery_fixture values (2,'rolled_back');
  insert into sabora.p2_recovery_fixture values (1,'duplicate');
 exception when unique_violation then null;
 end;
 if exists(select 1 from sabora.p2_recovery_fixture where id=2) then
  raise exception 'partial_write_survived';
 end if;
end $do$;
SQL

# Hold an ACCESS EXCLUSIVE lock in a concurrent real PostgreSQL session. The
# bounded probe must fail on lock_timeout; after release the same operation must
# succeed inside a rollback-only transaction. This is a CI rehearsal, not a
# production lock-duration claim.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL' &
begin;
set local statement_timeout='10s';
lock table sabora.p3_recovery_load_fixture in access exclusive mode;
select pg_sleep(2);
commit;
SQL
lock_holder_pid=$!
lock_seen=false
for attempt in $(seq 1 40); do
 if docker exec "$container" psql -X -U postgres -d postgres -Atqc "
  select exists(
   select 1 from pg_locks
   where relation='sabora.p3_recovery_load_fixture'::regclass
    and mode='AccessExclusiveLock' and granted
  )" | grep -Fx t >/dev/null; then lock_seen=true; break; fi
 sleep 0.1
done
[[ "$lock_seen" = true ]] || { wait "$lock_holder_pid" || true; echo 'p3_recovery_lock_not_observed' >&2; exit 1; }
lock_probe_started_ms="$(now_ms)"
set +e
lock_probe_error="$(docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
 "set lock_timeout='${P3_LOCK_TIMEOUT_MS}ms'; update sabora.p3_recovery_load_fixture set payload=payload where id=1" 2>&1)"
lock_probe_status=$?
set -e
lock_probe_ms=$(( $(now_ms) - lock_probe_started_ms ))
[[ "$lock_probe_status" -ne 0 && "$lock_probe_error" == *"lock timeout"* ]] || {
 wait "$lock_holder_pid" || true; echo 'p3_recovery_lock_timeout_not_enforced' >&2; exit 1;
}
wait "$lock_holder_pid"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c \
 "begin; set local lock_timeout='1s'; update sabora.p3_recovery_load_fixture set payload=payload where id=1; rollback" >/dev/null

# A consistent snapshot of the disposable database, including catalog and data.
dump_started_ms="$(now_ms)"
docker exec "$container" pg_dump -U postgres -d postgres -Fc -f /tmp/sabora-recovery.dump
# Separately exercise a Sabora-only archive in a second disposable database.
# This is an additive check; the full-db restore above remains the reference baseline.
docker exec "$container" pg_dump -U postgres -d postgres -Fc --schema=sabora -f /tmp/sabora-schema-only-recovery.dump
dump_ms=$(( $(now_ms) - dump_started_ms ))
restore_started_ms="$(now_ms)"
docker exec "$container" createdb -U postgres sabora_recovery_ci
docker exec "$container" pg_restore -U postgres -d sabora_recovery_ci --exit-on-error /tmp/sabora-recovery.dump

# A truncated archive must be rejected. Never resume an ambiguous restore into
# the same target: a pre-data-only target is discarded, recreated with a new
# database OID, and restored from the complete archive.
docker exec "$container" sh -c 'head -c 1024 /tmp/sabora-schema-only-recovery.dump > /tmp/sabora-corrupt-recovery.dump'
docker exec "$container" createdb -U postgres sabora_corrupt_recovery_ci
if docker exec "$container" pg_restore -U postgres -d sabora_corrupt_recovery_ci \
 --exit-on-error /tmp/sabora-corrupt-recovery.dump >/dev/null 2>&1; then
 echo 'p3_corrupt_recovery_archive_accepted' >&2; exit 1
fi
docker exec "$container" dropdb -U postgres sabora_corrupt_recovery_ci

docker exec "$container" createdb -U postgres sabora_interrupted_recovery_ci
interrupted_old_oid="$(docker exec "$container" psql -X -U postgres -d postgres -Atqc \
 "select oid from pg_database where datname='sabora_interrupted_recovery_ci'")"
docker exec "$container" pg_restore -U postgres -d sabora_interrupted_recovery_ci \
 --exit-on-error --section=pre-data /tmp/sabora-schema-only-recovery.dump
docker exec "$container" psql -X -U postgres -d sabora_interrupted_recovery_ci -Atqc \
 "select count(*) from sabora.p3_recovery_load_fixture" | grep -Fx 0
docker exec "$container" dropdb -U postgres sabora_interrupted_recovery_ci
docker exec "$container" createdb -U postgres sabora_interrupted_recovery_ci
interrupted_new_oid="$(docker exec "$container" psql -X -U postgres -d postgres -Atqc \
 "select oid from pg_database where datname='sabora_interrupted_recovery_ci'")"
[[ -n "$interrupted_old_oid" && -n "$interrupted_new_oid" && "$interrupted_old_oid" != "$interrupted_new_oid" ]] || {
 echo 'p3_interrupted_recovery_target_not_recreated' >&2; exit 1;
}
docker exec "$container" pg_restore -U postgres -d sabora_interrupted_recovery_ci \
 --exit-on-error /tmp/sabora-schema-only-recovery.dump

docker exec "$container" createdb -U postgres sabora_schema_recovery_ci
docker exec "$container" pg_restore -U postgres -d sabora_schema_recovery_ci --exit-on-error /tmp/sabora-schema-only-recovery.dump
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d sabora_schema_recovery_ci -Atqc "select case when count(*)=1 and min(payload)='committed' then 'ok' else 'bad' end from sabora.p2_recovery_fixture" | grep -Fx ok
restore_ms=$(( $(now_ms) - restore_started_ms ))
# Verify exact schema object inventory and forced-RLS table inventory.
for db in postgres sabora_recovery_ci sabora_schema_recovery_ci sabora_interrupted_recovery_ci; do
 docker exec "$container" psql -X -U postgres -d "$db" -Atqc "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relkind in ('r','p','v','m','S');"
 docker exec "$container" psql -X -U postgres -d "$db" -Atqc "
  select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;"
done > /tmp/sabora-recovery-counts-${GITHUB_RUN_ID}-$$
mapfile -t counts < /tmp/sabora-recovery-counts-${GITHUB_RUN_ID}-$$
[[ "${#counts[@]}" -eq 8 && "${counts[0]}" = "${counts[2]}" && "${counts[0]}" = "${counts[4]}" && "${counts[0]}" = "${counts[6]}" && "${counts[1]}" = "${counts[3]}" && "${counts[1]}" = "${counts[5]}" && "${counts[1]}" = "${counts[7]}" && "${counts[1]}" -gt 0 ]] || {
 echo 'recovery_schema_or_rls_mismatch' >&2; exit 1;
}
rm -f /tmp/sabora-recovery-counts-${GITHUB_RUN_ID}-$$
# Verify owners, ACLs, RLS policy definitions and grants, not only counts.
# Roles are cluster-wide in this isolated container and therefore present for both DBs.
for db in postgres sabora_recovery_ci sabora_schema_recovery_ci sabora_interrupted_recovery_ci; do
 docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -Atqc "
  select md5(coalesce(string_agg(
    n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' ||
    pg_get_userbyid(c.relowner) || ':' || coalesce((select string_agg(
      rol.rolname || ':' ||
      case when c.relkind='S' then
        has_sequence_privilege(rol.oid,c.oid,'USAGE')::text || ':' ||
        has_sequence_privilege(rol.oid,c.oid,'SELECT')::text || ':' ||
        has_sequence_privilege(rol.oid,c.oid,'UPDATE')::text
      else
        has_table_privilege(rol.oid,c.oid,'SELECT')::text || ':' ||
        has_table_privilege(rol.oid,c.oid,'INSERT')::text || ':' ||
        has_table_privilege(rol.oid,c.oid,'UPDATE')::text || ':' ||
        has_table_privilege(rol.oid,c.oid,'DELETE')::text || ':' ||
        has_table_privilege(rol.oid,c.oid,'REFERENCES')::text || ':' ||
        has_table_privilege(rol.oid,c.oid,'TRIGGER')::text
      end,',' order by rol.rolname)
      from pg_roles rol where c.relkind in ('r','p','v','m','S','f')
      and rol.rolname in ('postgres','anon','authenticated','sabora_h6_fn_owner')),'NONE') ||
    ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text,
    E'\\n' order by n.nspname,c.relname,c.relkind),'')) 
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora';"
 docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -Atqc "
  select md5(coalesce(string_agg(
    schemaname || '.' || tablename || ':' || policyname || ':' ||
    permissive || ':' || roles::text || ':' || cmd || ':' ||
    coalesce(qual,'NULL') || ':' || coalesce(with_check,'NULL'),
    E'\\n' order by schemaname,tablename,policyname),'')) 
  from pg_policies where schemaname='sabora';"
done > "${RUNNER_TEMP}/sabora-recovery-security-${GITHUB_RUN_ID}-$"
mapfile -t security < "${RUNNER_TEMP}/sabora-recovery-security-${GITHUB_RUN_ID}-$"
[[ "${#security[@]}" -eq 8 && "${security[0]}" = "${security[2]}" && "${security[0]}" = "${security[4]}" && "${security[0]}" = "${security[6]}" && "${security[1]}" = "${security[3]}" && "${security[1]}" = "${security[5]}" && "${security[1]}" = "${security[7]}" ]] || {
 printf 'recovery_security_fingerprints: %s\\n' "${security[*]}" >&2
 for db in postgres sabora_recovery_ci sabora_schema_recovery_ci sabora_interrupted_recovery_ci; do
  docker exec "$container" psql -X -U postgres -d "$db" -Atqc "select c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) || ':' || coalesce(c.relacl::text,'NULL') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sabora' order by c.relname,c.relkind" > "${RUNNER_TEMP}/sabora-objects-${db}-${GITHUB_RUN_ID}-$"
 done
 for restored_db in sabora_recovery_ci sabora_schema_recovery_ci sabora_interrupted_recovery_ci; do
  diff -u "${RUNNER_TEMP}/sabora-objects-postgres-${GITHUB_RUN_ID}-$" "${RUNNER_TEMP}/sabora-objects-${restored_db}-${GITHUB_RUN_ID}-$" >&2 || true
 done
 rm -f "${RUNNER_TEMP}/sabora-objects-postgres-${GITHUB_RUN_ID}-$" "${RUNNER_TEMP}/sabora-objects-sabora_recovery_ci-${GITHUB_RUN_ID}-$" "${RUNNER_TEMP}/sabora-objects-sabora_schema_recovery_ci-${GITHUB_RUN_ID}-$" "${RUNNER_TEMP}/sabora-objects-sabora_interrupted_recovery_ci-${GITHUB_RUN_ID}-$"
 echo 'recovery_owner_acl_or_policy_mismatch' >&2; exit 1;
}
rm -f "${RUNNER_TEMP}/sabora-recovery-security-${GITHUB_RUN_ID}-$"
# Check committed fixture, failed write absence and preserved uniqueness.
for db in postgres sabora_recovery_ci sabora_schema_recovery_ci sabora_interrupted_recovery_ci; do
 docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" -Atqc "select case when count(*)=1 and min(id)=1 and min(payload)='committed' then 'ok' else 'bad' end from sabora.p2_recovery_fixture" | grep -Fx ok
 docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" <<'SQL'
do $do$
begin
 begin
  insert into sabora.p2_recovery_fixture values (1,'duplicate_probe');
  raise exception 'unique_constraint_missing';
 exception when unique_violation then null;
 end;
end $do$;
SQL
done

p3_load_fingerprint(){
 local fingerprint_container="$1" fingerprint_db="$2"
 docker exec "$fingerprint_container" psql -X -U postgres -d "$fingerprint_db" -Atqc "
  select count(*)::text||':'||md5(string_agg(id::text||':'||payload,E'\\n' order by id))
  from sabora.p3_recovery_load_fixture"
}
source_load_fingerprint="$(p3_load_fingerprint "$container" postgres)"
[[ "$source_load_fingerprint" == "${P3_RECOVERY_ROWS}:"* ]] || {
 echo 'p3_recovery_source_load_mismatch' >&2; exit 1;
}
for db in sabora_recovery_ci sabora_schema_recovery_ci sabora_interrupted_recovery_ci; do
 [[ "$(p3_load_fingerprint "$container" "$db")" = "$source_load_fingerprint" ]] || {
  echo "p3_recovery_load_fingerprint_mismatch:${db}" >&2; exit 1;
 }
done

# Restore the Sabora-only archive into a second, network-isolated PostgreSQL 17
# cluster. This proves global roles are reconstructed rather than accidentally
# shared with the source databases above.
clean_container="sabora-pg-recovery-ci-${GITHUB_RUN_ID}-$$"
host_archive="${RUNNER_TEMP}/sabora-schema-recovery-${GITHUB_RUN_ID}-$.dump"
host_roles="${RUNNER_TEMP}/sabora-roles-recovery-${GITHUB_RUN_ID}-$.sql"
cleanup_clean_recovery(){
 docker rm -f -v "$clean_container" >/dev/null 2>&1 || true
 rm -f "$host_archive" "$host_roles"
}
trap cleanup_clean_recovery EXIT

# Export only explicit Sabora/browser roles. Password material is deliberately
# excluded; operational password rotation/provisioning is a separate approval.
docker exec -i "$container" psql -X -qAt -U postgres -d postgres > "$host_roles" <<'SQL'
select format(
 'create role %I with %s %s %s %s %s %s %s connection limit %s;',
 rolname,
 case when rolsuper then 'superuser' else 'nosuperuser' end,
 case when rolinherit then 'inherit' else 'noinherit' end,
 case when rolcreaterole then 'createrole' else 'nocreaterole' end,
 case when rolcreatedb then 'createdb' else 'nocreatedb' end,
 case when rolcanlogin then 'login' else 'nologin' end,
 case when rolreplication then 'replication' else 'noreplication' end,
 case when rolbypassrls then 'bypassrls' else 'nobypassrls' end,
 rolconnlimit)
from pg_roles
where rolname in ('anon','authenticated') or rolname like 'sabora\_%' escape '\'
order by rolname;
select format('grant %I to %I%s;',parent.rolname,member.rolname,
 case when membership.admin_option then ' with admin option' else '' end)
from pg_auth_members membership
join pg_roles parent on parent.oid=membership.roleid
join pg_roles member on member.oid=membership.member
where (parent.rolname in ('anon','authenticated') or parent.rolname like 'sabora\_%' escape '\')
  and (member.rolname in ('anon','authenticated') or member.rolname like 'sabora\_%' escape '\')
order by parent.rolname,member.rolname;
SQL
grep -q '^create role sabora_staff_reader ' "$host_roles"
docker cp "$container:/tmp/sabora-schema-only-recovery.dump" "$host_archive" >/dev/null

docker run -d --name "$clean_container" --network none \
 -e POSTGRES_PASSWORD=ci_only_not_a_secret postgres:17-alpine >/dev/null
for attempt in $(seq 1 40); do
 if docker exec "$clean_container" sh -c 'test "$(cat /proc/1/comm)" = postgres && psql -U postgres -d postgres -Atqc "select 1"' >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$clean_container" psql -X -U postgres -d postgres -Atqc "select current_setting('server_version_num')::int / 10000" | grep -Fx 17
docker exec -i "$clean_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < "$host_roles"
docker exec "$clean_container" createdb -U postgres sabora_clean_recovery_ci
docker exec -i "$clean_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d sabora_clean_recovery_ci <<'SQL'
create schema extensions;
create extension pgcrypto with schema extensions;
SQL
docker cp "$host_archive" "$clean_container:/tmp/sabora-schema-only-recovery.dump" >/dev/null
clean_restore_started_ms="$(now_ms)"
docker exec "$clean_container" pg_restore -U postgres -d sabora_clean_recovery_ci \
 --exit-on-error /tmp/sabora-schema-only-recovery.dump
clean_restore_ms=$(( $(now_ms) - clean_restore_started_ms ))

recovery_fingerprint(){
 local fingerprint_container="$1" fingerprint_db="$2"
 docker exec -i "$fingerprint_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$fingerprint_db" <<'SQL'
select 'roles:'||md5(coalesce(string_agg(
 rolname||':'||rolsuper||':'||rolinherit||':'||rolcreaterole||':'||rolcreatedb||':'||rolcanlogin||':'||rolreplication||':'||rolbypassrls||':'||rolconnlimit,
 E'\n' order by rolname),''))
from pg_roles where rolname in ('anon','authenticated') or rolname like 'sabora\_%' escape '\';
select 'memberships:'||md5(coalesce(string_agg(parent.rolname||':'||member.rolname||':'||membership.admin_option,
 E'\n' order by parent.rolname,member.rolname),''))
from pg_auth_members membership
join pg_roles parent on parent.oid=membership.roleid
join pg_roles member on member.oid=membership.member
where (parent.rolname in ('anon','authenticated') or parent.rolname like 'sabora\_%' escape '\')
  and (member.rolname in ('anon','authenticated') or member.rolname like 'sabora\_%' escape '\');
select 'extensions:'||md5(coalesce(string_agg(e.extname||':'||e.extversion||':'||n.nspname,
 E'\n' order by e.extname),''))
from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
select 'schema:'||md5(coalesce(string_agg(
 n.nspname||':'||pg_get_userbyid(n.nspowner)||':'||r.rolname||':'||has_schema_privilege(r.oid,n.oid,'USAGE')||':'||has_schema_privilege(r.oid,n.oid,'CREATE'),
 E'\n' order by n.nspname,r.rolname),''))
from pg_namespace n cross join pg_roles r
where n.nspname='sabora' and (r.rolname='postgres' or r.rolname in ('anon','authenticated') or r.rolname like 'sabora\_%' escape '\');
select 'relations:'||md5(coalesce(string_agg(
 c.relname||':'||c.relkind::text||':'||pg_get_userbyid(c.relowner)||':'||c.relrowsecurity||':'||c.relforcerowsecurity||':'||r.rolname||':'||
 case when c.relkind='S' then has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')::text
 else has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER')::text end,
 E'\n' order by c.relname,c.relkind,r.rolname),''))
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r
where n.nspname='sabora' and c.relkind in ('r','p','v','m','S','f')
 and (r.rolname='postgres' or r.rolname in ('anon','authenticated') or r.rolname like 'sabora\_%' escape '\');
select 'policies:'||md5(coalesce(string_agg(
 tablename||':'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||coalesce(qual,'NULL')||':'||coalesce(with_check,'NULL'),
 E'\n' order by tablename,policyname),'')) from pg_policies where schemaname='sabora';
select 'functions:'||md5(coalesce(string_agg(
 p.proname||':'||pg_get_function_identity_arguments(p.oid)||':'||pg_get_userbyid(p.proowner)||':'||p.prosecdef||':'||p.provolatile::text||':'||
 coalesce(array_to_string(p.proconfig,','),'NULL')||':'||md5(pg_get_functiondef(p.oid))||':'||r.rolname||':'||has_function_privilege(r.oid,p.oid,'EXECUTE'),
 E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid),r.rolname),''))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='sabora'
 and (r.rolname='postgres' or r.rolname in ('anon','authenticated') or r.rolname like 'sabora\_%' escape '\');
select 'constraints:'||md5(coalesce(string_agg(
 c.conname||':'||c.contype::text||':'||c.convalidated||':'||pg_get_constraintdef(c.oid,true),
 E'\n' order by c.conname),''))
from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='sabora';
select 'indexes:'||md5(coalesce(string_agg(indexname||':'||indexdef,E'\n' order by indexname),''))
from pg_indexes where schemaname='sabora';
select 'triggers:'||md5(coalesce(string_agg(
 c.relname||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid,true),E'\n' order by c.relname,t.tgname),''))
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='sabora' and not t.tgisinternal;
create temporary table p2_counts(name text primary key,row_count bigint not null);
do $do$ declare item record; total bigint; begin
 for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='sabora' and c.relkind in ('r','p') order by c.relname loop
  execute format('select count(*) from sabora.%I',item.relname) into total;
  insert into p2_counts values(item.relname,total);
 end loop;
end $do$;
select 'data-counts:'||md5(coalesce(string_agg(name||':'||row_count,E'\n' order by name),'')) from p2_counts;
SQL
}

source_fingerprint="$(recovery_fingerprint "$container" postgres)"
clean_fingerprint="$(recovery_fingerprint "$clean_container" sabora_clean_recovery_ci)"
if [[ "$source_fingerprint" != "$clean_fingerprint" ]]; then
 diff -u <(printf '%s\n' "$source_fingerprint") <(printf '%s\n' "$clean_fingerprint") >&2 || true
 echo 'clean_cluster_recovery_fingerprint_mismatch' >&2
 exit 1
fi
[[ "$(p3_load_fingerprint "$clean_container" sabora_clean_recovery_ci)" = "$source_load_fingerprint" ]] || {
 echo 'p3_clean_cluster_load_fingerprint_mismatch' >&2; exit 1;
}

# Acceptance uses a genuine LOGIN with no direct grants. It can assume only the
# restored least-privilege reader role and cannot escape that boundary.
docker exec -i "$clean_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d sabora_clean_recovery_ci <<'SQL'
create role sabora_p2_restore_probe login password 'ci_only_not_a_secret'
 nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant sabora_staff_reader to sabora_p2_restore_probe;
SQL
docker exec -e PGPASSWORD=ci_only_not_a_secret "$clean_container" \
 psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U sabora_p2_restore_probe -d sabora_clean_recovery_ci -Atqc \
 "set role sabora_staff_reader; select count(*) >= 0 from sabora.staff_members" | grep -Fx t
if docker exec -e PGPASSWORD=ci_only_not_a_secret "$clean_container" \
 psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U sabora_p2_restore_probe -d sabora_clean_recovery_ci -Atqc \
 "set role sabora_staff_reader; select count(*) from sabora.orders" >/dev/null 2>&1; then
 echo 'clean_cluster_restore_reader_privilege_escalation' >&2; exit 1
fi
if docker exec -e PGPASSWORD=ci_only_not_a_secret "$clean_container" \
 psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U sabora_p2_restore_probe -d sabora_clean_recovery_ci -Atqc \
 "set role postgres" >/dev/null 2>&1; then
 echo 'clean_cluster_restore_set_role_escalation' >&2; exit 1
fi

# No destructive rollback. Both clusters and host artifacts are disposable and
# removed by traps; the source schema remains untouched for subsequent checks.
recovery_total_ms=$(( $(now_ms) - recovery_started_ms ))
(( lock_probe_ms > 0 && lock_probe_ms <= 5000 )) || {
 echo 'p3_lock_detection_budget_exceeded' >&2; exit 1;
}
(( recovery_total_ms <= P3_CI_RTO_BUDGET_MS )) || {
 echo "p3_ci_recovery_budget_exceeded:${recovery_total_ms}" >&2; exit 1;
}
echo "sabora_p3_recovery_metrics:rows=${P3_RECOVERY_ROWS}:lock_timeout_ms=${P3_LOCK_TIMEOUT_MS}:lock_observed_ms=${lock_probe_ms}:dump_ms=${dump_ms}:restore_ms=${restore_ms}:clean_restore_ms=${clean_restore_ms}:total_ms=${recovery_total_ms}:budget_ms=${P3_CI_RTO_BUDGET_MS}"
echo 'sabora_disposable_backup_restore_clean_cluster_ok'
