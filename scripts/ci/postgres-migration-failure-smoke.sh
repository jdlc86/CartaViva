#!/usr/bin/env bash
set -euo pipefail
# A deterministic interrupted migration/resume exercise in the existing isolated CI PG17 container.
if [[ "${GITHUB_ACTIONS:-}" != true || -z "${RUNNER_TEMP:-}" || -z "${GITHUB_RUN_ID:-}" || "$#" -ne 1 ]]; then
 echo 'migration_failure_harness_required' >&2; exit 1
fi
container="$1"
case "$container" in "sabora-pg-single-ci-${GITHUB_RUN_ID}-"*) ;; *) echo 'migration_failure_foreign_container_denied' >&2; exit 1 ;; esac
# Only the harness-created container; no host database URL or exposed port.
docker exec "$container" psql -X -U postgres -d postgres -Atqc "select current_setting('server_version_num')::int / 10000" | grep -Fx 17
# Synthetic migration ledger, not a claim that all real migrations are retry-safe.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create schema sabora_p2_failure_fixture;
create table sabora_p2_failure_fixture.ledger(version text primary key, checksum text not null);
create table sabora_p2_failure_fixture.data(id integer primary key, payload text not null);
-- A committed migration and its ledger entry are atomic.
begin;
insert into sabora_p2_failure_fixture.data values (1,'committed');
insert into sabora_p2_failure_fixture.ledger values ('0001','sha256-fixture-one');
commit;
SQL
if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
begin;
insert into sabora_p2_failure_fixture.data values (2,'uncommitted');
do $do$ begin raise exception 'expected_migration_failure'; end $do$;
commit;
SQL
then
 echo 'migration_failure_not_detected' >&2; exit 1
fi
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $do$ begin
 if (select count(*) from sabora_p2_failure_fixture.data)<>1
 or (select count(*) from sabora_p2_failure_fixture.ledger)<>1 then
  raise exception 'migration_failure_left_partial_state';
 end if;
end $do$;
-- Resume with one atomic transaction, recording the checksum only on success.
begin;
insert into sabora_p2_failure_fixture.data values (2,'resumed');
insert into sabora_p2_failure_fixture.ledger values ('0002','sha256-fixture-two');
commit;
-- A repeated version with a different checksum must be rejected.
do $do$ begin
 if exists(select 1 from sabora_p2_failure_fixture.ledger where version='0002' and checksum<>'sha256-fixture-two') then
  raise exception 'checksum_drift';
 end if;
 if (select count(*) from sabora_p2_failure_fixture.data)<>2
 or (select count(*) from sabora_p2_failure_fixture.ledger)<>2 then
  raise exception 'resume_integrity_failure';
 end if;
end $do$;
SQL
if docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
insert into sabora_p2_failure_fixture.ledger values ('0002','tampered-checksum');
SQL
then
 echo 'migration_duplicate_version_not_rejected' >&2; exit 1
fi
docker exec "$container" psql -X -U postgres -d postgres -Atqc "select count(*) from sabora_p2_failure_fixture.ledger where version='0002' and checksum='sha256-fixture-two'" | grep -Fx 1
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'drop schema sabora_p2_failure_fixture cascade' >/dev/null
echo 'sabora_disposable_migration_failure_resume_fixture_ok'
