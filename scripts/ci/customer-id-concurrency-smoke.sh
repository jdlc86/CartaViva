#!/usr/bin/env bash
set -euo pipefail
# Run ONLY against the disposable, network-isolated PostgreSQL CI container.
container="${1:?disposable PostgreSQL CI container required}"
first_id='00000000-0000-4000-8000-000000000101'
second_id='00000000-0000-4000-8000-000000000102'
public_id='SB-444444444444'
# Session A creates a profile and holds the UNIQUE index entry until commit.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
insert into sabora.customer_profiles(id,public_id,alias)
 values ('00000000-0000-4000-8000-000000000101','SB-444444444444','First');
select pg_sleep(2);
commit;
SQL
first=$!
sleep 0.3
# Session B must wait, then fail ONLY on the duplicate public ID. A savepoint
# lets it recover and insert a new generated ID without aborting its transaction.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
set local lock_timeout='8s';
savepoint customer_id_candidate;
do $customer_collision$
begin
 begin
  insert into sabora.customer_profiles(id,public_id,alias)
   values ('00000000-0000-4000-8000-000000000102','SB-444444444444','Second');
  raise exception 'concurrent duplicate public ID unexpectedly accepted';
 exception when unique_violation then
  if constraint_name is not null then null; end if;
 end;
end $customer_collision$;
rollback to savepoint customer_id_candidate;
insert into sabora.customer_profiles(id,public_id,alias)
 values ('00000000-0000-4000-8000-000000000102','SB-555555555555','Second');
commit;
SQL
second=$!
wait "$first"
wait "$second"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $customer_assert$
begin
 if (select count(*) from sabora.customer_profiles
     where id in ('00000000-0000-4000-8000-000000000101'::uuid,
                  '00000000-0000-4000-8000-000000000102'::uuid)) <> 2 then
  raise exception 'concurrent customer profiles not both committed';
 end if;
 if (select count(*) from sabora.customer_profiles
     where public_id='SB-444444444444') <> 1 then
  raise exception 'duplicate customer public ID committed';
 end if;
end $customer_assert$;
SQL
echo 'Two-session customer public ID uniqueness passed.'
