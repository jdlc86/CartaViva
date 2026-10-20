#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL 17 only. Never connect to external DB hosts.
container="sabora-pg-migration-ci-${GITHUB_RUN_ID:-local}-$$"
cleanup() { docker rm -f -v "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$container" --network none \
  -e POSTGRES_PASSWORD=ci_only_not_a_secret \
  postgres:17-alpine >/dev/null

# The image starts a temporary server during initdb. Wait for the final PID 1.
for attempt in $(seq 1 40); do
  if docker exec "$container" sh -c 'test "$(cat /proc/1/comm)" = postgres && psql -U postgres -d postgres -Atqc "select 1"' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" sh -c 'test "$(cat /proc/1/comm)" = postgres && psql -U postgres -d postgres -Atqc "select 1"' || { docker logs "$container"; exit 1; }

# Supabase API roles exist in production, but not in vanilla PostgreSQL.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
SQL

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/20261020140000_sabora_order_core.sql

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/20261020150000_sabora_order_transaction.sql

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/migrations/20261020160000_sabora_qr_rotation.sql

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

-- Assert every Sabora table and RPC remains inaccessible to client roles.
do $$
declare
  v_role text;
  v_table text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if has_schema_privilege(v_role, 'sabora', 'USAGE') then
      raise exception 'client role % has unauthorized schema usage', v_role;
    end if;
    foreach v_table in array array[
      'restaurants','restaurant_members','dining_tables','orders','order_idempotency'
    ] loop
      if has_table_privilege(v_role, format('sabora.%I',v_table), 'SELECT')
         or has_table_privilege(v_role, format('sabora.%I',v_table), 'INSERT')
         or has_table_privilege(v_role, format('sabora.%I',v_table), 'UPDATE')
         or has_table_privilege(v_role, format('sabora.%I',v_table), 'DELETE') then
        raise exception 'client role % has unauthorized table privilege on %', v_role, v_table;
      end if;
    end loop;
    if has_function_privilege(v_role, 'sabora.confirm_order(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE')
       or has_function_privilege(v_role, 'sabora.rotate_table_qr(uuid,uuid,text)', 'EXECUTE') then
      raise exception 'client role % has unauthorized RPC execution', v_role;
    end if;
  end loop;
end $$;

-- Confirm composite FK refuses an order that references a table in another restaurant.
insert into sabora.restaurants(id,name) values
('00000000-0000-0000-0000-000000000001','A'),
('00000000-0000-0000-0000-000000000002','B');
insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
values ('00000000-0000-0000-0000-000000000001',1,4,decode(repeat('ab',32),'hex'));
-- Table numbers are unique per restaurant, not globally.
insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
values ('00000000-0000-0000-0000-000000000002',1,2,decode(repeat('cd',32),'hex'));
-- Both inclusive grouping-window boundaries must remain valid.
insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash,grouping_window_seconds)
values
('00000000-0000-0000-0000-000000000001',12,4,decode(repeat('ab',32),'hex'),60),
('00000000-0000-0000-0000-000000000001',13,4,decode(repeat('ab',32),'hex'),3600);
-- Invalid table configuration is rejected at the database boundary.
do $$
begin
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
    values ('00000000-0000-0000-0000-000000000001',15,4,decode(repeat('ab',33),'hex'));
    raise exception 'oversized QR hash accepted';
  exception when check_violation then
    raise notice 'oversized QR hash rejected';
  end;
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
    values ('00000000-0000-0000-0000-000000000001',14,4,decode('ab','hex'));
    raise exception 'invalid QR hash length accepted';
  exception when check_violation then
    raise notice 'invalid QR hash length rejected';
  end;
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
    values ('00000000-0000-0000-0000-000000000001',0,4,decode(repeat('ab',32),'hex'));
    raise exception 'zero table number accepted';
  exception when check_violation then
    raise notice 'zero table number rejected';
  end;
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
    values ('00000000-0000-0000-0000-000000000001',1,6,decode(repeat('ab',32),'hex'));
    raise exception 'duplicate table number accepted';
  exception when unique_violation then
    raise notice 'duplicate table number rejected';
  end;
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash,grouping_window_seconds)
    values ('00000000-0000-0000-0000-000000000001',10,4,decode(repeat('ab',32),'hex'),59);
    raise exception 'grouping window below minimum accepted';
  exception when check_violation then
    raise notice 'grouping window below minimum rejected';
  end;
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash,grouping_window_seconds)
    values ('00000000-0000-0000-0000-000000000001',11,4,decode(repeat('ab',32),'hex'),3601);
    raise exception 'grouping window above maximum accepted';
  exception when check_violation then
    raise notice 'grouping window above maximum rejected';
  end;
  begin
    insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
    values ('00000000-0000-0000-0000-000000000001',9,0,decode(repeat('ab',32),'hex'));
    raise exception 'zero capacity accepted';
  exception when check_violation then
    raise notice 'zero capacity rejected';
  end;
end $$;

-- Invalid order states must be rejected even for privileged database writers.
do $$
declare
  t record;
begin
  select id,session_id into strict t from sabora.dining_tables
  where restaurant_id = '00000000-0000-0000-0000-000000000001' and number = 1;
  begin
    insert into sabora.orders(restaurant_id,table_id,session_id,company,employee_number,confirmed_at,grouping,status,items)
    values ('00000000-0000-0000-0000-000000000001',t.id,t.session_id,'Acme','42',now(),'first','unknown',
      '[{"category":"main","name":"Rice","quantity":1}]');
    raise exception 'invalid order status accepted';
  exception when check_violation then
    raise notice 'invalid order status rejected';
  end;
  begin
    insert into sabora.orders(restaurant_id,table_id,session_id,company,employee_number,confirmed_at,grouping,status,items)
    values ('00000000-0000-0000-0000-000000000001',t.id,t.session_id,'Acme','42',now(),'unknown','confirmed',
      '[{"category":"main","name":"Rice","quantity":1}]');
    raise exception 'invalid order grouping accepted';
  exception when check_violation then
    raise notice 'invalid order grouping rejected';
  end;
end $$;
do $$
declare t uuid;
begin
 select id into t from sabora.dining_tables where restaurant_id = '00000000-0000-0000-0000-000000000001' limit 1;
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

  -- The key format is enforced by PostgreSQL, even for privileged writes.
  begin
    update sabora.order_idempotency
       set request_key = 'invalid key with spaces'
     where order_id = v_first.order_id;
    raise exception 'invalid idempotency key accepted';
  exception when check_violation then
    raise notice 'invalid idempotency key rejected by constraint';
  end;
  -- Reject control characters in keys even when a privileged writer bypasses RPC.
  begin
    update sabora.order_idempotency
       set request_key = 'invalid' || chr(10) || 'key'
     where order_id = v_first.order_id;
    raise exception 'control character in idempotency key accepted';
  exception when check_violation then
    raise notice 'control character rejected by key constraint';
  end;
  -- The idempotency record cannot point to a different table session.
  begin
    update sabora.order_idempotency
       set session_id = gen_random_uuid()
     where order_id = v_first.order_id;
    raise exception 'cross-session idempotency link accepted';
  exception when foreign_key_violation then
    raise notice 'cross-session idempotency link rejected';
  end;
  -- Nor can the same idempotency record be assigned to another tenant.
  begin
    update sabora.order_idempotency
       set restaurant_id = '00000000-0000-0000-0000-000000000002'
     where order_id = v_first.order_id;
    raise exception 'cross-tenant idempotency link accepted';
  exception when foreign_key_violation then
    raise notice 'cross-tenant idempotency link rejected';
  end;

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

  -- The table's five-minute grouping window is half-open: exactly at
  -- the deadline a new confirmation is late, not grouped.
  update sabora.dining_tables
     set first_confirmed_at = clock_timestamp() - interval '6 minutes'
   where id = v_table;
  if (select order_grouping from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,v_token,'Acme','103',
      'request_late_01','[{"category":"dessert","name":"Cake","quantity":1}]'::jsonb)) <> 'late' then
    raise exception 'expired grouping window accepted a grouped order';
  end if;

  -- Reject oversized QR input before hashing or attempting any write.
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('x',513),
      'Acme','101','oversized_qr_01','[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
    raise exception 'oversized QR unexpectedly accepted';
  exception when invalid_parameter_value then
    raise notice 'oversized QR rejected';
  end;

  -- A valid table and QR from restaurant A must not work under restaurant B.
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000002',v_table,v_token,'Acme','101',
      'cross_tenant_01','[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
    raise exception 'cross-tenant confirmation unexpectedly succeeded';
  exception when no_data_found then
    raise notice 'cross-tenant confirmation rejected';
  end;

  -- QR management must also require the matching restaurant ID.
  begin
    perform * from sabora.rotate_table_qr(
      '00000000-0000-0000-0000-000000000002',v_table,repeat('z',64));
    raise exception 'cross-tenant QR rotation unexpectedly succeeded';
  exception when no_data_found then
    raise notice 'cross-tenant QR rotation rejected';
  end;

  if (select count(*) from sabora.orders where table_id=v_table) <> 3 then
    raise exception 'unexpected order count after replay';
  end if;
end $$;
SQL

# Deterministic two-session lock regression: the second order must wait for the
# first transaction to commit and then join its newly opened grouping window.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
insert into sabora.dining_tables(restaurant_id,number,capacity,qr_token_hash)
values ('00000000-0000-0000-0000-000000000001',3,4,sha256(convert_to(repeat('z',64),'UTF8')));
SQL
table_id="$(docker exec "$container" psql -U postgres -d postgres -Atqc "select id from sabora.dining_tables where number=3 and restaurant_id='00000000-0000-0000-0000-000000000001'")"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres > /tmp/sabora-first-$.log 2>&1 <<SQL &
begin;
select order_grouping from sabora.confirm_order(
 '00000000-0000-0000-0000-000000000001','$table_id',repeat('z',64),
 'Acme','201','concurrent_01','[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
select pg_sleep(3);
commit;
SQL
first_pid=$!
sleep 1
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres > /tmp/sabora-second-$.log 2>&1 <<SQL &
select order_grouping from sabora.confirm_order(
 '00000000-0000-0000-0000-000000000001','$table_id',repeat('z',64),
 'Acme','202','concurrent_02','[{"category":"drink","name":"Water","quantity":1}]'::jsonb);
SQL
second_pid=$!
wait "$first_pid" || { cat /tmp/sabora-first-$.log; exit 1; }
wait "$second_pid" || { cat /tmp/sabora-second-$.log; exit 1; }
grep -q 'first' /tmp/sabora-first-$.log || { cat /tmp/sabora-first-$.log; exit 1; }
grep -q 'grouped' /tmp/sabora-second-$.log || { cat /tmp/sabora-second-$.log; exit 1; }
docker exec "$container" psql -U postgres -d postgres -Atqc "select count(*) from sabora.orders where table_id='$table_id'" | grep -qx 2
rm -f /tmp/sabora-first-$.log /tmp/sabora-second-$.log

# QR rotation must invalidate the old token, reset the window and preserve history.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare
  v_table uuid;
  v_old_session uuid;
  v_new_session uuid;
  v_version integer;
  v_order_count integer;
begin
  select id, session_id into v_table, v_old_session
    from sabora.dining_tables
    where restaurant_id='00000000-0000-0000-0000-000000000001' and number=2;
  select count(*) into v_order_count from sabora.orders where table_id=v_table;
  select new_qr_version, new_session_id into v_version, v_new_session
    from sabora.rotate_table_qr(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64));
  if v_version <> 2 or v_new_session = v_old_session then
    raise exception 'QR rotation did not increment version or reset session';
  end if;
  if (select first_confirmed_at is not null from sabora.dining_tables where id=v_table) then
    raise exception 'QR rotation failed to reset grouping';
  end if;
  -- A malformed item must not create an order, even with a valid QR.
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_01','[{"name":"Rice","quantity":1}]'::jsonb);
    raise exception 'missing category accepted';
  exception when invalid_parameter_value then
    raise notice 'missing category rejected';
  end;
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_03',
      jsonb_build_array(jsonb_build_object('category','main','name',repeat('X',161),'quantity',1)));
    raise exception 'oversized item name accepted';
  exception when invalid_parameter_value then
    raise notice 'oversized item name rejected';
  end;
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_02','[{"category":"main","name":"Rice","quantity":0}]'::jsonb);
    raise exception 'invalid quantity accepted';
  exception when invalid_parameter_value then
    raise notice 'invalid quantity rejected';
  end;
  -- JSON null and fractional quantities are invalid and must not write orders.
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_04','[{"category":"main","name":"Rice","quantity":null}]'::jsonb);
    raise exception 'null quantity accepted';
  exception when invalid_parameter_value then
    raise notice 'null quantity rejected';
  end;
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_05','[{"category":"main","name":"Rice","quantity":1.5}]'::jsonb);
    raise exception 'fractional quantity accepted';
  exception when invalid_parameter_value then
    raise notice 'fractional quantity rejected';
  end;
  -- Reject missing quantity, unknown category and blank item names.
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_06','[{"category":"main","name":"Rice"}]'::jsonb);
    raise exception 'missing quantity accepted';
  exception when invalid_parameter_value then
    raise notice 'missing quantity rejected';
  end;
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_07','[{"category":"side","name":"Rice","quantity":1}]'::jsonb);
    raise exception 'unknown category accepted';
  exception when invalid_parameter_value then
    raise notice 'unknown category rejected';
  end;
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','bad_items_08','[{"category":"main","name":"  ","quantity":1}]'::jsonb);
    raise exception 'blank item name accepted';
  exception when invalid_parameter_value then
    raise notice 'blank item name rejected';
  end;
  -- Invalid QR rotations must not change the session or token.
  declare
    v_before_session uuid;
    v_before_version integer;
  begin
    select session_id, qr_version into v_before_session, v_before_version
      from sabora.dining_tables where id = v_table;
    begin
      perform * from sabora.rotate_table_qr(
        '00000000-0000-0000-0000-000000000001',v_table,'short');
      raise exception 'short QR rotation accepted';
    exception when invalid_parameter_value then
      raise notice 'short QR rotation rejected';
    end;
    begin
      perform * from sabora.rotate_table_qr(
        '00000000-0000-0000-0000-000000000001',v_table,repeat('x',513));
      raise exception 'oversized QR rotation accepted';
    exception when invalid_parameter_value then
      raise notice 'oversized QR rotation rejected';
    end;
    begin
      perform * from sabora.rotate_table_qr(
        '00000000-0000-0000-0000-000000000002',v_table,repeat('z',64));
      raise exception 'cross-tenant QR rotation accepted';
    exception when no_data_found then
      raise notice 'cross-tenant QR rotation rejected';
    end;
    -- A nonexistent table must not mutate any existing table session.
    begin
      perform * from sabora.rotate_table_qr(
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000ffff',repeat('z',64));
      raise exception 'nonexistent table QR rotation accepted';
    exception when no_data_found then
      raise notice 'nonexistent table QR rotation rejected';
    end;
    if exists (select 1 from sabora.dining_tables
               where id = v_table
                 and (session_id is distinct from v_before_session
                      or qr_version is distinct from v_before_version)) then
      raise exception 'invalid QR rotation modified session';
    end if;
  end;
  if (select count(*) from sabora.orders where table_id=v_table) <> v_order_count then
    raise exception 'QR rotation erased order history';
  end if;
  begin
    perform * from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('x',64),
      'Acme','101','after_rotate_old','[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
    raise exception 'old QR remained valid';
  exception when invalid_authorization_specification then
    raise notice 'old QR rejected';
  end;
  if (select order_grouping from sabora.confirm_order(
      '00000000-0000-0000-0000-000000000001',v_table,repeat('n',64),
      'Acme','101','after_rotate_new','[{"category":"main","name":"Rice","quantity":1}]'::jsonb)) <> 'first' then
    raise exception 'new QR did not start a fresh grouping window';
  end if;
end $$;
SQL

echo 'Sabora PostgreSQL migration, tenant isolation, concurrent orders, idempotency and QR rotation passed.'
