#!/usr/bin/env bash
set -euo pipefail
# Invoked after the migration smoke against the SAME disposable PostgreSQL container.
# Two independent psql sessions exercise lock ordering. Never connect to VPS/Supabase.
container="${1:?disposable container name required}"
root='00000000-0000-0000-0000-000000000201'
owner='00000000-0000-0000-0000-000000000203'
next='00000000-0000-0000-0000-000000000202'
# CI smoke has already seeded the ROOT and two active ADMINs.
# Session A holds the singleton, while B attempts to suspend the owner.
# The second session must wait until A commits; afterwards it must fail closed.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
update sabora.admin_write_ownership set owner_user_id='$owner' where singleton;
SQL
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
update sabora.admin_write_ownership
 set owner_user_id='00000000-0000-0000-0000-000000000202' where singleton;
select pg_sleep(2);
commit;
SQL
first=$!
sleep 0.3
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
set local lock_timeout='8s';
update sabora.staff_members set state='suspended'
 where user_id='00000000-0000-0000-0000-000000000203';
commit;
SQL
second=$!
wait "$first"
wait "$second"
# The previous owner may be suspended only AFTER the ownership transfer.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
begin
 if (select owner_user_id from sabora.admin_write_ownership where singleton)
 <> '00000000-0000-0000-0000-000000000202'::uuid then
  raise exception 'ownership was not transferred';
 end if;
 if (select state from sabora.staff_members where user_id='00000000-0000-0000-0000-000000000203')
 <> 'suspended' then
  raise exception 'former owner was not suspended after transfer';
 end if;
end $$;
SQL
echo 'Two-session ownership/staff lock ordering passed.'
# Competing compare-and-swap transfers must not both claim the same owner.
# Restore both ADMINs to active before the two-session race.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
update sabora.staff_members set state='active'
 where user_id='00000000-0000-0000-0000-000000000203';
SQL
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
set local lock_timeout='8s';
update sabora.admin_write_ownership
 set owner_user_id='00000000-0000-0000-0000-000000000203'
 where singleton and owner_user_id='00000000-0000-0000-0000-000000000202';
do $
begin
 if (select owner_user_id from sabora.admin_write_ownership where singleton)
 <> '00000000-0000-0000-0000-000000000203'::uuid then
  raise exception 'first contender did not transfer ownership';
 end if;
end $;
select pg_sleep(2);
commit;
SQL
first=$!
sleep 0.3
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
set local lock_timeout='8s';
do $
declare updated_count integer;
begin
 update sabora.admin_write_ownership
  set owner_user_id='00000000-0000-0000-0000-000000000203'
  where singleton and owner_user_id='00000000-0000-0000-0000-000000000202';
 get diagnostics updated_count = row_count;
 if updated_count <> 0 then
  raise exception 'stale contender unexpectedly changed ownership';
 end if;
end $;
commit;
SQL
second=$!
wait "$first"
wait "$second"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $
begin
 if (select owner_user_id from sabora.admin_write_ownership where singleton)
 <> '00000000-0000-0000-0000-000000000203'::uuid then
  raise exception 'concurrent transfer ended with unexpected owner';
 end if;
end $;
SQL
echo 'Two-session stale-owner compare-and-swap rejection passed.'

