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
for migration in supabase/migrations/*.sql; do
 test -f "$migration"
 docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
done
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare v_count int; v_role text; v_table text;
begin
 select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='sabora' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;
 if v_count<>12 then raise exception 'Expected twelve RLS protected single-restaurant tables, got %',v_count; end if;
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
-- Ownership persistence and audit are private, append-only and reject invalid rows.
do $ownership_schema$
declare v_admin uuid := '00000000-0000-0000-0000-000000000902';
declare v_other uuid := '00000000-0000-0000-0000-000000000903';
declare v_proposal uuid;
begin
 insert into sabora.staff_members(user_id,role,state) values
  (v_admin,'admin','active'),(v_other,'admin','active');
 update sabora.admin_write_ownership set owner_user_id=v_admin where singleton;
 insert into sabora.admin_ownership_proposals(kind,from_owner_id,to_owner_id,created_by,correlation_id)
 values ('request',v_admin,v_other,v_other,'00000000-0000-0000-0000-000000000904')
 returning id into v_proposal;
 insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id)
 values ('00000000-0000-0000-0000-000000000905',v_other,'request',v_proposal,v_admin,v_admin);
 begin
  update sabora.admin_ownership_audit set action='offer' where proposal_id=v_proposal;
  raise exception 'audit update unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from sabora.admin_ownership_audit where proposal_id=v_proposal;
  raise exception 'audit delete unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  truncate sabora.admin_ownership_audit;
  raise exception 'audit truncate unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into sabora.admin_ownership_proposals(kind,from_owner_id,to_owner_id,created_by,correlation_id)
  values ('offer',v_admin,v_admin,v_admin,'00000000-0000-0000-0000-000000000906');
  raise exception 'self-transfer unexpectedly allowed';
 exception when check_violation then null;
 end;
end;
$ownership_schema$;
-- The dormant writer must have no data access, even when exercised as a role.
do $writer_acl$
declare v_role record; v_table text;
begin
 select rolcanlogin,rolbypassrls,rolinherit,rolcreatedb,rolcreaterole,rolreplication
 into v_role from pg_roles where rolname='sabora_admin_writer';
 if not found or v_role.rolcanlogin or v_role.rolbypassrls or v_role.rolinherit
    or v_role.rolcreatedb or v_role.rolcreaterole or v_role.rolreplication then
  raise exception 'admin writer has unsafe role attributes';
 end if;
 if has_schema_privilege('sabora_admin_writer','sabora','USAGE') then
  raise exception 'dormant writer has schema usage';
 end if;
 for v_table in select tablename from pg_tables where schemaname='sabora' loop
  if has_table_privilege('sabora_admin_writer',format('sabora.%I',v_table),'SELECT')
     or has_table_privilege('sabora_admin_writer',format('sabora.%I',v_table),'INSERT')
     or has_table_privilege('sabora_admin_writer',format('sabora.%I',v_table),'UPDATE')
     or has_table_privilege('sabora_admin_writer',format('sabora.%I',v_table),'DELETE') then
   raise exception 'dormant writer can access table %',v_table;
  end if;
 end loop;
end;
$writer_acl$;
set role sabora_admin_writer;
do $writer_denials$
begin
 begin
  perform count(*) from sabora.staff_members;
  raise exception 'dormant writer read staff';
 exception when insufficient_privilege then null;
 end;
 begin
  update sabora.admin_write_ownership set owner_user_id=null;
  raise exception 'dormant writer modified ownership';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action)
   values ('00000000-0000-0000-0000-000000000999','00000000-0000-0000-0000-000000000902','request');
  raise exception 'dormant writer inserted audit';
 exception when insufficient_privilege then null;
 end;
end;
$writer_denials$;
reset role;

-- A newly created test table/function must not become visible to the dormant
-- writer through inherited or default privileges.
create table sabora.writer_future_acl_probe(id bigint primary key);
create function sabora.writer_future_acl_probe_fn()
 returns integer language sql as $probe$select 1$probe$;
do $future_acl$
begin
 if has_table_privilege('sabora_admin_writer','sabora.writer_future_acl_probe','SELECT')
    or has_table_privilege('sabora_admin_writer','sabora.writer_future_acl_probe','INSERT')
    or has_function_privilege('sabora_admin_writer','sabora.writer_future_acl_probe_fn()','EXECUTE')
    or has_function_privilege('public','sabora.writer_future_acl_probe_fn()','EXECUTE') then
  raise exception 'future object ACL exposed to dormant writer or PUBLIC';
 end if;
end;
$future_acl$;
drop function sabora.writer_future_acl_probe_fn();
drop table sabora.writer_future_acl_probe;

-- Enumerate every function in the private schema. PUBLIC and browser roles
-- must not inherit EXECUTE on any existing routine, not just known RPC names.
do $function_acl$
declare fn record;
begin
 for fn in
  select p.oid, p.oid::regprocedure as signature
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='sabora'
 loop
  if has_function_privilege('public',fn.oid,'EXECUTE')
     or has_function_privilege('anon',fn.oid,'EXECUTE')
     or has_function_privilege('authenticated',fn.oid,'EXECUTE')
     or has_function_privilege('sabora_admin_writer',fn.oid,'EXECUTE') then
   raise exception 'private function unexpectedly executable: %',fn.signature;
  end if;
 end loop;
end;
$function_acl$;

-- Enumerate all private tables and sequences, including objects introduced by
-- future migrations. Browser roles and dormant writer must have no access.
do $private_object_acl$
declare obj record; principal text; privilege text;
begin
 for obj in
  select c.oid, c.relname, c.relkind
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relkind in ('r','p','v','m','f','S')
 loop
  -- Effective privileges for these roles include any grants to PUBLIC.
  foreach principal in array array['anon','authenticated','sabora_admin_writer'] loop
   if obj.relkind='S' then
    foreach privilege in array array['USAGE','SELECT','UPDATE'] loop
     if has_sequence_privilege(principal,obj.oid,privilege) then
      raise exception 'private sequence % grants % to %',obj.relname,privilege,principal;
     end if;
    end loop;
   else
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
     if has_table_privilege(principal,obj.oid,privilege) then
      raise exception 'private relation % grants % to %',obj.relname,privilege,principal;
     end if;
    end loop;
   end if;
  end loop;
 end loop;
end;
$private_object_acl$;

-- Reader must be strictly read-only and subject to RLS.
do $reader$
begin
 if not has_schema_privilege('sabora_staff_reader','sabora','USAGE') then
  raise exception 'staff reader missing schema usage';
 end if;
 if not has_column_privilege('sabora_staff_reader','sabora.staff_members','state','SELECT') then
  raise exception 'staff reader missing membership state access';
 end if;
 if has_table_privilege('sabora_staff_reader','sabora.staff_members','INSERT')
    or has_table_privilege('sabora_staff_reader','sabora.staff_members','UPDATE')
    or has_table_privilege('sabora_staff_reader','sabora.staff_members','DELETE') then
  raise exception 'staff reader gained write access';
 end if;
end;
$reader$;
-- Execute actual statements as the non-bypass RLS reader, not merely ACL metadata.
set role sabora_staff_reader;
select count(*) from sabora.staff_members;
do $reader_denials$
begin
 begin
  perform count(*) from sabora.orders;
  raise exception 'reader accessed orders';
 exception when insufficient_privilege then null;
 end;
 begin
  update sabora.staff_members set state='active';
  raise exception 'reader updated staff';
 exception when insufficient_privilege then null;
 end;
end;
$reader_denials$;
reset role;
-- Exercise the future backend LOGIN in disposable PostgreSQL only.
-- This role has no password and no network access in CI.
create role sabora_staff_reader_login login inherit nobypassrls;
grant sabora_staff_reader to sabora_staff_reader_login;
do $login_acl$
begin
 if (select rolbypassrls from pg_roles where rolname='sabora_staff_reader_login') then
  raise exception 'reader login bypasses RLS';
 end if;
 if exists (
  select 1 from pg_auth_members m
  join pg_roles member on member.oid=m.member
  join pg_roles granted on granted.oid=m.roleid
  where member.rolname='sabora_staff_reader_login'
   and granted.rolname<>'sabora_staff_reader'
 ) then
  raise exception 'reader login has unexpected role membership';
 end if;
end;
$login_acl$;
set role sabora_staff_reader_login;
select count(*) from sabora.staff_members;
do $login_denials$
begin
 begin
  perform count(*) from sabora.orders;
  raise exception 'reader login accessed orders';
 exception when insufficient_privilege then null;
 end;
 begin
  update sabora.staff_members set state='active';
  raise exception 'reader login updated staff';
 exception when insufficient_privilege then null;
 end;
end;
$login_denials$;
reset role;
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
-- ROOT and ownership integrity tests, disposable database only.
insert into sabora.staff_members(user_id,role,state) values
 ('00000000-0000-0000-0000-000000000201','root','active'),
 ('00000000-0000-0000-0000-000000000202','admin','active'),
 ('00000000-0000-0000-0000-000000000203','admin','active');
do $governance$
begin
 begin
  insert into sabora.staff_members(user_id,role,state)
   values ('00000000-0000-0000-0000-000000000205','root','invited');
  raise exception 'inactive ROOT accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into sabora.staff_members(user_id,role,state)
   values ('00000000-0000-0000-0000-000000000204','root','active');
  raise exception 'second ROOT accepted';
 exception when unique_violation then null;
 end;
 begin
  update sabora.staff_members set state='revoked'
   where user_id='00000000-0000-0000-0000-000000000201';
  raise exception 'ROOT revocation accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from sabora.staff_members
   where user_id='00000000-0000-0000-0000-000000000201';
  raise exception 'ROOT deletion accepted';
 exception when insufficient_privilege then null;
 end;
 update sabora.admin_write_ownership
  set owner_user_id='00000000-0000-0000-0000-000000000202' where singleton;
 begin
  update sabora.staff_members set state='suspended'
   where user_id='00000000-0000-0000-0000-000000000202';
  raise exception 'owner suspension accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  update sabora.admin_write_ownership
   set owner_user_id='00000000-0000-0000-0000-000000000201' where singleton;
  raise exception 'ROOT assigned as ADMIN owner';
 exception when insufficient_privilege then null;
 end;
 update sabora.admin_write_ownership
  set owner_user_id='00000000-0000-0000-0000-000000000203' where singleton;
 if (select owner_user_id from sabora.admin_write_ownership where singleton)
  <>'00000000-0000-0000-0000-000000000203'::uuid then
  raise exception 'ownership transfer failed';
 end if;
end;
$governance$;
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
 insert into sabora.staff_members(user_id,role) values
  ('00000000-0000-0000-0000-000000000104','kitchen');
 if (select state from sabora.staff_members where user_id='00000000-0000-0000-0000-000000000104')<>'invited' then
  raise exception 'new staff auto-activated';
 end if;
 -- An invited employee must not transition a valid order line.
 begin
  perform * from sabora.transition_order_line(
   (select l.id from sabora.order_lines l join sabora.orders o on o.id=l.order_id
    where o.employee_number='101' and l.status='confirmed' limit 1),
   '00000000-0000-0000-0000-000000000104','preparing');
  raise exception 'invited kitchen actor accepted';
 exception when insufficient_privilege then null;
 end;
 update sabora.staff_members set state='revoked' where user_id='00000000-0000-0000-0000-000000000101';
 begin
  perform * from sabora.transition_order_line(
   (select l.id from sabora.order_lines l join sabora.orders o on o.id=l.order_id
    where o.employee_number='101' and l.status='confirmed' limit 1),
   '00000000-0000-0000-0000-000000000101','preparing');
  raise exception 'revoked kitchen actor accepted';
 exception when invalid_parameter_value then null;
          when insufficient_privilege then null;
 end;
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
bash scripts/ci/admin-ownership-lifecycle-smoke.sh "$container"
bash scripts/ci/admin-ownership-concurrency-smoke.sh "$container"
echo 'Sabora single-restaurant schema, private RPCs, QR, idempotency, pickup and ownership concurrency smoke passed.'
