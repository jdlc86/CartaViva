#!/usr/bin/env bash
set -euo pipefail
# Disposable, network-isolated PostgreSQL 17. No Supabase or VPS connections.
container="sabora-pg-single-ci-${GITHUB_RUN_ID:-local}-$$"
cleanup() { docker rm -f -v "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$container" --network none -e POSTGRES_PASSWORD=ci_only_not_a_secret postgres:17-alpine >/dev/null
for attempt in $(seq 1 40); do
 if docker exec "$container" sh -c 'test "$(cat /proc/1/comm)" = postgres && psql -U postgres -d postgres -Atqc "select 1"' >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$container" psql -U postgres -d postgres -Atqc 'select 1' >/dev/null
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
SQL
for migration in supabase/migrations/202610201{4,5,6,7,8,9}0000_sabora_*.sql; do
 test -f "$migration"
 docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
done
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare v_count int; v_role text; v_table text;
begin
 select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='sabora' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;
 if v_count<>9 then raise exception 'Expected nine RLS protected single-restaurant tables, got %',v_count; end if;
 if exists(select 1 from information_schema.columns where table_schema='sabora' and column_name='restaurant_id') then
  raise exception 'Multi-restaurant column remains';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relname in ('restaurants','restaurant_members')) then
  raise exception 'Multi-restaurant entities remain';
 end if;
 foreach v_role in array array['anon','authenticated'] loop
  if has_schema_privilege(v_role,'sabora','USAGE') then raise exception 'client schema access'; end if;
  for v_table in select tablename from pg_tables where schemaname='sabora' loop
   if has_table_privilege(v_role,format('sabora.%I',v_table),'SELECT')
    or has_table_privilege(v_role,format('sabora.%I',v_table),'INSERT')
    or has_table_privilege(v_role,format('sabora.%I',v_table),'UPDATE')
    or has_table_privilege(v_role,format('sabora.%I',v_table),'DELETE') then
    raise exception 'client access to %',v_table;
   end if;
  end loop;
  if has_function_privilege(v_role,'sabora.confirm_order(uuid,text,text,text,text,jsonb)','EXECUTE')
   or has_function_privilege(v_role,'sabora.rotate_table_qr(uuid,text)','EXECUTE')
   or has_function_privilege(v_role,'sabora.transition_order_status(uuid,uuid,text,text)','EXECUTE')
   or has_function_privilege(v_role,'sabora.transition_order_line(uuid,uuid,text)','EXECUTE') then
    raise exception 'client RPC access';
  end if;
 end loop;
end $$;
insert into sabora.restaurant_settings(name) values ('Sabora');
insert into sabora.staff_members(user_id,role) values
 ('00000000-0000-0000-0000-000000000101','kitchen'),
 ('00000000-0000-0000-0000-000000000102','waiter'),
 ('00000000-0000-0000-0000-000000000103','admin');
-- Test identities must be explicitly activated; migration defaults deny access.
update sabora.staff_members set state='active' where user_id in (
 '00000000-0000-0000-0000-000000000101',
 '00000000-0000-0000-0000-000000000102',
 '00000000-0000-0000-0000-000000000103');
insert into sabora.dining_tables(number,capacity,qr_token_hash)
values (1,4,sha256(convert_to(repeat('a',64),'UTF8')));
do $$
declare v_table uuid; v_order uuid; v_line uuid; v_session uuid; v_deadline timestamptz;
begin
 select id,session_id into strict v_table,v_session from sabora.dining_tables where number=1;
 select order_id into v_order from sabora.confirm_order(v_table,repeat('a',64),'Acme','100','request_0001',
  '[{"category":"main","name":"Rice","quantity":1}]'::jsonb);
 if (select count(*) from sabora.order_lines where order_id=v_order)<>1 then raise exception 'missing line'; end if;
 if (select count(*) from sabora.confirm_order(v_table,repeat('a',64),'Acme','100','request_0001',
  '[{"category":"main","name":"Rice","quantity":1}]'::jsonb) where repeated)<>1 then raise exception 'idempotency failure'; end if;
 begin
  perform * from sabora.confirm_order(v_table,repeat('a',64),'Acme','100','request_0001',
   '[{"category":"main","name":"Tea","quantity":1}]'::jsonb);
  raise exception 'conflicting replay accepted';
 exception when unique_violation then null;
 end;
 perform * from sabora.rotate_table_qr(v_table,repeat('b',64));
 if (select session_id from sabora.dining_tables where id=v_table)<>v_session then
  raise exception 'QR rotation changed visit';
 end if;
 begin
  perform * from sabora.confirm_order(v_table,repeat('a',64),'Acme','101','request_0002',
   '[{"category":"drink","name":"Water","quantity":1}]'::jsonb);
  raise exception 'old QR accepted';
 exception when invalid_authorization_specification then null;
 end;
 if (select order_grouping from sabora.confirm_order(v_table,repeat('b',64),'Acme','101','request_0003',
  '[{"category":"drink","name":"Water","quantity":1}]'::jsonb))<>'grouped' then
  raise exception 'QR rotation restarted grouping';
 end if;
 select id into strict v_line from sabora.order_lines where order_id=v_order;
 perform * from sabora.transition_order_line(v_line,'00000000-0000-0000-0000-000000000101','preparing');
 perform * from sabora.transition_order_line(v_line,'00000000-0000-0000-0000-000000000101','ready');
 if (select count(*) from sabora.pickup_notifications where order_line_id=v_line and acknowledged_at is null)<>1 then
  raise exception 'ready notification missing';
 end if;
 begin
  perform * from sabora.transition_order_line(v_line,'00000000-0000-0000-0000-000000000101','picked_up');
  raise exception 'kitchen pickup accepted';
 exception when insufficient_privilege then null;
 end;
 perform * from sabora.transition_order_line(v_line,'00000000-0000-0000-0000-000000000102','picked_up');
 if (select count(*) from sabora.order_line_events where order_line_id=v_line)<>3 then
  raise exception 'pickup audit missing';
 end if;
 -- Revocation must abort transitions and their audit writes atomically.
 update sabora.staff_members set state='revoked' where user_id='00000000-0000-0000-0000-000000000103';
 begin
  perform * from sabora.transition_order_status(v_order,'00000000-0000-0000-0000-000000000103','preparing',null);
  raise exception 'revoked actor accepted';
 exception when insufficient_privilege then null;
 end;
 if (select status from sabora.orders where id=v_order)<>'confirmed' then
  raise exception 'revoked actor changed order status';
 end if;
 begin
  perform * from sabora.transition_order_status(v_order,'00000000-0000-0000-0000-000000000103','cancelled','bad');
  raise exception 'whole-order cancellation accepted';
 exception when invalid_parameter_value then null;
 end;
end $$;
SQL
echo 'Sabora single-restaurant schema, private RPCs, QR, idempotency and pickup smoke passed.'
