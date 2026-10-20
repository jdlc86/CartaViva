#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL 17 only. Never connect to external DB hosts.
container="sabora-pg-migration-ci-${GITHUB_RUN_ID:-local}-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD=ci_only_not_a_secret \
  --tmpfs /var/lib/postgresql/data:rw,size=256m \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 40); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres

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
do $
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

echo 'Sabora isolated PostgreSQL 17 migration and tenant FK validation passed.'
