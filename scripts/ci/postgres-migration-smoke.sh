#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL 17 only. Never connect to external DB hosts.
container="sabora-pg-migration-ci-${GITHUB_RUN_ID:-local}-$$"
cleanup() { docker rm -f -v "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD=ci_only_not_a_secret \
  if docker exec "$container" sh -c 'test "$(cat /proc/1/comm)" = postgres && psql -U postgres -d postgres -Atqc "select 1"' >/dev/null 2>&1; then break; fi

for attempt in $(seq 1 40); do
docker exec "$container" sh -c 'test "$(cat /proc/1/comm)" = postgres && psql -U postgres -d postgres -Atqc "select 1"' || { docker logs "$container"; exit 1; }
  sleep 1
done
docker exec "$container" psql -U postgres -d postgres -Atqc "select 1" || { docker logs "$container"; exit 1; }

# Supabase API roles exist in production, but not in vanilla PostgreSQL.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
SQL

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/20261020140000_sabora_order_core.sql

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/20261020150000_sabora_order_transaction.sql

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare actual int;
begin
  select count(*) into actual
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='sabora' and c.relname in
  ('restaurants','restaurant_members','dining_tables','orders','order_idempotency')
  and c.relrowsecurity and c.relforcerowsecurity;
  if actual <> 5 then raise exception 'RLS missing: %', actual; end if;
end $$;

-- Confirm composite FK refuses an order that references a table in another restaurant.
insert into sabora.restaurants(id,name) values
('00000000-0000-0000-0000-000000000001','A'),
('00000000-0000-0000-0000-000000000002','B');
insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
values ('00000000-0000-0000-0000-000000000001',1,4,decode(repeat('ab',32),'hex'));
do $$
declare t uuid;
begin
 select id into t from sabora.dining_tables limit 1;
 begin
   insert into sabora.orders(restaurant_id,table_id,session_id,company,employee_number,confirmed_at,grouping,items)
   values ('00000000-0000-0000-0000-000000000002',t,gen_random_uuid(),'Acme','42',now(),'first','[{"category":"main","name":"Rice","quantity":1}]');
   raise exception 'cross-tenant insert unexpectedly succeeded';
 exception when foreign_key_violation then
   raise notice 'cross-tenant foreign key rejected as expected';
 end;
end $$;
SQL

# Exercise the real transactional function as a controlled CI-only database owner.
# The function is intentionally not exposed to anon/authenticated in Supabase.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare
  v_table uuid;
  v_token text := repeat('x', 64);
  v_first record;
  v_repeat record;
  v_second record;
begin
  insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
  values ('00000000-0000-0000-0000-000000000001',2,4,sha256(convert_to(v_token,'UTF8')))
  returning id into v_table;

  select * into v_first from sabora.confirm_order(
    '00000000-0000-0000-0000-000000000001',v_table,v_token,'Acme','101',
    'request_0001','[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
  if v_first.order_grouping <> 'first' or v_first.repeated then
    raise exception 'first confirmation did not start grouping window';
  end if;

  select * into v_repeat from sabora.confirm_order(
    '00000000-0000-0000-0000-000000000001',v_table,v_token,'Acme','101',
    'request_0001','[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
  if not v_repeat.repeated or v_repeat.order_id <> v_first.order_id then
    raise exception 'idempotent replay created a new order';
  end if;

  select * into v_second from sabora.confirm_order(
    '00000000-0000-0000-0000-000000000001',v_table,v_token,'Acme','102',
    'request_0002','[{"category":"drink","name":"Water","quantity":1}]'::jsonb);
  if v_second.order_grouping <> 'grouped' then
    raise exception 'second confirmation did not join active window';
  end if;

  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,v_token,'Acme','101',
      'request_0001','[{"category":"main","name":"Soup","quantity":1}]'::jsonb);
    raise exception 'conflicting replay was accepted';
  exception when unique_violation then
    raise notice 'conflicting idempotency key rejected';
  end;

  if (select count(*) from sabora.orders where table_id=v_table) <> 2 then
    raise exception 'unexpected order count after replay';
  end if;
end $$;
SQL

echo 'Sabora isolated PostgreSQL 17 migration, tenant FK and transactional order checks passed.'
