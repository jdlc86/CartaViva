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
# Exercise legacy/candidate identity compatibility and kitchen trigger in disposable PG17.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-order-identity-compatibility-smoke.sql
# Exercise the actual candidate order CTE, kitchen trigger and grouping.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-order-writer-sql-smoke.sql
# Exercise ledger constraints with disposable fixtures, rolled back in SQL.
docker exec -i "$container" psql -a -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-quote-ledger-smoke.sql
# Prove order and economic confirmation commit/rollback together in PG17.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-confirmation-atomicity-smoke.sql
# Validate candidate durable visit grants in disposable PostgreSQL.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-visit-ledger-smoke.sql
# Verify closed-by-default table state and timed pause constraints.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-table-ordering-lifecycle-smoke.sql
# Verify atomic occupancy boundary and revocation on close.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-table-occupancy-boundary-smoke.sql
# Prove candidate order writer's table FOR UPDATE serializes with staff close.
bash scripts/ci/catalog-order-writer-close-concurrency-smoke.sh "$container"
# Reverse race: staff closes first; a subsequent candidate writer must block then refuse.
bash scripts/ci/catalog-order-writer-close-first-concurrency-smoke.sh "$container"
# Prove locked customer identity serializes with a concurrent profile edit.
bash scripts/ci/catalog-profile-confirmation-concurrency-smoke.sh "$container"
# Verify staff lifecycle role gates without runtime grants.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-table-staff-transition-smoke.sql
# Verify staff close waits for a customer transaction's table lock.
bash scripts/ci/catalog-table-close-concurrency-smoke.sh "$container"
# Fail closed if any candidate staff transition or audit grant becomes public.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/staff-transition-activation-gate.sql
# Exercise transaction-scoped confirmation idempotency lock on real PG17 sessions.
bash scripts/ci/catalog-confirmation-idempotency-concurrency-smoke.sh "$container"
# Fail closed if economic ledgers or legacy order confirmation gain runtime access.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-confirmation-activation-gate.sql
# Prove the negative gate actually rejects deliberately unsafe schema mutations.
bash scripts/ci/catalog-confirmation-activation-gate-mutations.sh "$container"
# Verify append-only table transition audit on isolated PostgreSQL.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
 < scripts/ci/catalog-table-ordering-audit-smoke.sql
# Exercise two competing DB sessions and assert only the first request survives.
bash scripts/ci/catalog-quote-concurrency-smoke.sh "$container"
# Assert table close serializes with in-flight order authorization.
bash scripts/ci/catalog-table-close-order-lock-smoke.sh "$container"
# Differential SQL/JavaScript candidate validation: execute the same fixtures
# against the freshly migrated, network-isolated PostgreSQL instance.
node scripts/ci/catalog-economic-parity.mjs |
 docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$
declare v_count int; v_role text; v_table text;
begin
 select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='sabora' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;
 if v_count<>19 then raise exception 'Expected nineteen RLS protected single-restaurant tables, got %',v_count; end if;
 if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sabora' and c.relname='catalog_items' and c.relrowsecurity and c.relforcerowsecurity) then raise exception 'catalog RLS protection missing'; end if;
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
-- Candidate ledgers are private and require a future restricted writer.
do $quote_ledger$
declare v_role text; v_table text;
begin
 foreach v_table in array array['catalog_displayed_quotes','catalog_confirmation_attempts'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='sabora' and c.relname=v_table and c.relrowsecurity and c.relforcerowsecurity)
   then raise exception 'quote ledger RLS missing for %',v_table; end if;
  foreach v_role in array array['anon','authenticated','sabora_admin_writer','sabora_catalog_reader'] loop
   if has_table_privilege(v_role,format('sabora.%I',v_table),'SELECT')
    or has_table_privilege(v_role,format('sabora.%I',v_table),'INSERT')
    or has_table_privilege(v_role,format('sabora.%I',v_table),'UPDATE')
    or has_table_privilege(v_role,format('sabora.%I',v_table),'DELETE')
    then raise exception 'unexpected quote ledger grant % to %',v_table,v_role; end if;
  end loop;
 end loop;
 if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sabora' and c.relname in
   ('catalog_displayed_quotes','catalog_confirmation_attempts')
   and t.tgname in ('catalog_displayed_quotes_append_only','catalog_confirmation_attempts_append_only',
    'catalog_displayed_quotes_no_truncate','catalog_confirmation_attempts_no_truncate')
   and not t.tgisinternal and t.tgenabled='O')<>4
  then raise exception 'candidate ledger append-only triggers missing'; end if;
 if not exists(select 1 from pg_constraint
  where conname='catalog_confirmation_idempotency' and contype='u')
  then raise exception 'missing confirmation idempotency unique constraint'; end if;
 if not exists(select 1 from pg_constraint
  where conname='catalog_confirmation_quote_scope' and contype='f')
  then raise exception 'missing confirmation quote ownership foreign key'; end if;
 if not exists(select 1 from pg_constraint
  where conname='catalog_confirmation_order_scope' and contype='f')
  then raise exception 'missing confirmation table-session order foreign key'; end if;
 if not exists(select 1 from information_schema.columns
  where table_schema='sabora' and table_name='catalog_confirmation_attempts'
  and column_name='item_id' and data_type='uuid')
  then raise exception 'confirmation must bind item_id'; end if;
end $quote_ledger$;
-- Candidate validator is tested independently: it must not enable publication.
do $economic_candidate$
declare
 v_extra jsonb:='{"id":"cheese","name":"Queso","priceCents":150,"available":true,"allergens":["Leche"]}'::jsonb;
 v_option jsonb:='{"id":"size","name":"Tamaño","required":true,"maxSelections":1,"values":[{"id":"large","name":"Grande","priceCents":200,"available":true,"allergens":[]}]}'::jsonb;
 v_snapshot jsonb;
begin
 v_snapshot:=jsonb_build_object('name','Pizza','category','Segundos','priceCents',1000,
  'allergens','["Gluten"]'::jsonb,'extras',jsonb_build_array(v_extra),
  'options',jsonb_build_array(v_option),'discount','{"type":"percent","basisPoints":1000}'::jsonb);
 if sabora.validate_catalog_economic_modifiers(v_snapshot) IS DISTINCT FROM true then
  raise exception 'valid candidate economic modifiers rejected';
 end if;
 if sabora.validate_catalog_snapshot(v_snapshot) IS TRUE then
  raise exception 'candidate unexpectedly bypassed active publication guard';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||'{"discount":{"type":"percent","basisPoints":10001}}'::jsonb) IS TRUE then
  raise exception 'out-of-range discount accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('extras',jsonb_build_array(v_extra,v_extra))) IS TRUE then
  raise exception 'duplicate extras accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('extras',jsonb_build_array(v_extra||'{"priceCents":-1}'::jsonb))) IS TRUE then
  raise exception 'negative extra price accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('options',jsonb_build_array(v_option||'{"maxSelections":2}'::jsonb))) IS TRUE then
  raise exception 'invalid option selection limit accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers('{"extras":null}'::jsonb) IS TRUE then
  raise exception 'null extras accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('extras',jsonb_build_array(v_extra-'name'))) IS TRUE then
  raise exception 'missing extra name accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('extras',jsonb_build_array(v_extra||'{"name":null}'::jsonb))) IS TRUE then
  raise exception 'null extra name accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('extras',jsonb_build_array(v_extra||'{"id":123}'::jsonb))) IS TRUE then
  raise exception 'non-string extra id accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('options',jsonb_build_array(v_option-'name'))) IS TRUE then
  raise exception 'missing option name accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('options',jsonb_build_array(v_option||'{"required":null}'::jsonb))) IS TRUE then
  raise exception 'null required flag accepted';
 end if;
 if sabora.validate_catalog_economic_modifiers(v_snapshot||jsonb_build_object('options',jsonb_build_array(v_option||'{"values":[{"id":"large","name":"Grande","priceCents":200,"available":true,"allergens":[]},{"id":"large","name":"Duplicado","priceCents":100,"available":true,"allergens":[]}]}'::jsonb))) IS TRUE then
  raise exception 'duplicate option value accepted';
 end if;
 if has_function_privilege('anon','sabora.validate_catalog_economic_modifiers(jsonb)','EXECUTE')
  or has_function_privilege('authenticated','sabora.validate_catalog_economic_modifiers(jsonb)','EXECUTE')
  or has_function_privilege('sabora_catalog_reader','sabora.validate_catalog_economic_modifiers(jsonb)','EXECUTE') then
  raise exception 'candidate validator exposed to application roles';
 end if;
end;
$economic_candidate$;
-- Catalog draft is not exposed as a published version without an explicit publisher.
do $catalog_foundation$
declare v_item uuid;
begin
 insert into sabora.catalog_items(draft,draft_revision)
 values ('{"name":"Borrador","priceCents":1200}'::jsonb,1) returning id into v_item;
 if (select published_snapshot from sabora.catalog_items where id=v_item) is not null then
  raise exception 'draft unexpectedly published';
 end if;
 begin
  update sabora.catalog_items
  set published_revision=2,published_snapshot='{}'::jsonb,published_at=now()
  where id=v_item;
  raise exception 'future revision accepted';
 exception when check_violation then null;
 end;
 begin
  perform sabora.publish_catalog_item(v_item,1);
  raise exception 'invalid snapshot published';
 exception when raise_exception then
  -- The publisher must reject the incomplete draft.
  if SQLERRM <> 'invalid_catalog_snapshot' then raise; end if;
 end;
 update sabora.catalog_items set draft='{"name":"Sin alérgenos","category":"Bebidas","priceCents":1200}'::jsonb where id=v_item;
 if sabora.validate_catalog_snapshot((select draft from sabora.catalog_items where id=v_item)) IS TRUE then
  raise exception 'missing allergens validated';
 end if;
 begin
  perform sabora.publish_catalog_item(v_item,1);
  raise exception 'missing allergens published';
 exception when raise_exception then
  if SQLERRM <> 'invalid_catalog_snapshot' then raise; end if;
 end;
 if sabora.validate_catalog_snapshot('{"name":"Incompleto","category":"Bebidas","priceCents":1200,"allergens":[],"taxRate":20}'::jsonb) IS TRUE then
  raise exception 'unknown economic field accepted';
 end if;
 -- Unsupported nonempty economic rules must never silently publish.
 if sabora.validate_catalog_snapshot('{"name":"Extra","category":"Bebidas","priceCents":1200,"allergens":[],"extras":[{"name":"Extra","priceCents":100}]}'::jsonb) IS TRUE then
  raise exception 'unvalidated extras accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Oferta","category":"Bebidas","priceCents":1200,"allergens":[],"discount":{"type":"percent","value":20}}'::jsonb) IS TRUE then
  raise exception 'unvalidated discount accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Opciones","category":"Bebidas","priceCents":1200,"allergens":[],"options":[{"name":"Tamaño"}]}'::jsonb) IS TRUE then
  raise exception 'unvalidated options accepted';
 end if;
 -- Economic publication must reject malformed amounts and unsupported modifiers.
 if sabora.validate_catalog_snapshot('{"name":"Precio decimal","category":"Bebidas","priceCents":12.5,"allergens":[]}'::jsonb) IS TRUE then
  raise exception 'fractional cents accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Precio negativo","category":"Bebidas","priceCents":-1,"allergens":[]}'::jsonb) IS TRUE then
  raise exception 'negative cents accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Precio enorme","category":"Bebidas","priceCents":9999999999999999,"allergens":[]}'::jsonb) IS TRUE then
  raise exception 'oversized cents accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Extra vacío","category":"Bebidas","priceCents":1200,"allergens":[],"extras":[{}]}'::jsonb) IS TRUE then
  raise exception 'unvalidated extra object accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Descuento fijo","category":"Bebidas","priceCents":1200,"allergens":[],"discount":{"type":"fixed","amountCents":100}}'::jsonb) IS TRUE then
  raise exception 'unvalidated fixed discount accepted';
 end if;
 if sabora.validate_catalog_snapshot('{"name":"Alérgeno inválido","category":"Bebidas","priceCents":1200,"allergens":[null]}'::jsonb) IS TRUE then
  raise exception 'invalid allergen accepted';
 end if;
 update sabora.catalog_items set draft='{"name":"Borrador","category":"Bebidas","priceCents":1200,"allergens":[]}'::jsonb where id=v_item;
 if sabora.publish_catalog_item(v_item,1)<>1 then raise exception 'publish revision mismatch'; end if;
 begin
  perform sabora.publish_catalog_item(v_item,2);
  raise exception 'stale revision accepted';
 exception when raise_exception then
  if SQLERRM <> 'catalog_revision_conflict' then raise; end if;
 end;
 update sabora.catalog_items
 set draft='{"name":"Edición no publicada","priceCents":1500}'::jsonb,draft_revision=2
 where id=v_item;
 if (select published_snapshot->>'name' from sabora.catalog_items where id=v_item)<>'Borrador' then
  raise exception 'draft edit changed published snapshot';
 end if;
 update sabora.catalog_items set sold_out=true where id=v_item;
 if not (select sold_out from sabora.catalog_items where id=v_item) then
  raise exception 'sold-out state lost';
 end if;
 update sabora.catalog_items set withdrawn_at=now() where id=v_item;
 if (select withdrawn_at from sabora.catalog_items where id=v_item) is null then
  raise exception 'withdrawal not persisted';
 end if;
end;
$catalog_foundation$;
set role anon;
do $catalog_anon_denial$
begin
 begin
  perform count(*) from sabora.catalog_items;
  raise exception 'anon read catalog drafts';
 exception when insufficient_privilege then null;
 end;
end;
$catalog_anon_denial$;
reset role;

-- The dedicated catalog reader sees only published, non-withdrawn snapshots.
do $catalog_reader_acl$
begin
 if has_table_privilege('sabora_catalog_reader','sabora.catalog_items','SELECT') then
  raise exception 'catalog reader gained direct table access';
 end if;
 if has_function_privilege('anon','sabora.read_published_catalog()','EXECUTE')
    or has_function_privilege('authenticated','sabora.read_published_catalog()','EXECUTE')
    or has_function_privilege('sabora_admin_writer','sabora.read_published_catalog()','EXECUTE') then
  raise exception 'published catalog RPC exposed to browser/admin role';
 end if;
end;
$catalog_reader_acl$;
set role sabora_catalog_reader;
do $catalog_reader_empty$
declare v_count integer;
begin
 select count(*) into v_count from sabora.read_published_catalog();
 if v_count<>0 then raise exception 'unexpected published rows'; end if;
 begin
  perform count(*) from sabora.catalog_items;
  raise exception 'catalog reader accessed drafts directly';
 exception when insufficient_privilege then null;
 end;
end;
$catalog_reader_empty$;
reset role;
-- Test published, withdrawn and sold-out behavior using existing test rows.
do $catalog_reader_seed$
declare v_published uuid;v_withdrawn uuid;
begin
 insert into sabora.catalog_items(draft,draft_revision,published_snapshot,published_revision,published_at,sold_out)
 values ('{"name":"Agotado","category":"Bebidas","priceCents":200,"allergens":[]}'::jsonb,1,
 '{"name":"Agotado","category":"Bebidas","priceCents":200,"allergens":[]}'::jsonb,1,now(),true)
 returning id into v_published;
 insert into sabora.catalog_items(draft,draft_revision,published_snapshot,published_revision,published_at,withdrawn_at)
 values ('{"name":"Retirado","category":"Bebidas","priceCents":200,"allergens":[]}'::jsonb,1,
 '{"name":"Retirado","category":"Bebidas","priceCents":200,"allergens":[]}'::jsonb,1,now(),now())
 returning id into v_withdrawn;
end;
$catalog_reader_seed$;
set role sabora_catalog_reader;
do $catalog_reader_visibility$
declare v_count integer;
begin
 select count(*) into v_count from sabora.read_published_catalog();
 if v_count<>1 then raise exception 'published catalog visibility mismatch: %',v_count; end if;
 if not exists(select 1 from sabora.read_published_catalog() where sold_out=true) then
  raise exception 'sold-out item missing';
 end if;
 if exists(select 1 from sabora.read_published_catalog() where published_snapshot->>'name'='Retirado') then
  raise exception 'withdrawn item leaked';
 end if;
end;
$catalog_reader_visibility$;
reset role;

-- Customer IDs are unique and profiles remain private even if the public label is known.
do $customer_profiles$
declare v_customer uuid;
begin
 insert into sabora.customer_profiles(public_id,alias,company)
 values ('SB-222222222222','Ana',null) returning id into v_customer;
 if v_customer is null then raise exception 'customer UUID missing'; end if;
 begin
  insert into sabora.customer_profiles(public_id,alias)
  values ('SB-222222222222','Otra');
  raise exception 'duplicate customer public ID accepted';
 exception when unique_violation then null;
 end;
 begin
  insert into sabora.customer_profiles(public_id,alias)
  values ('SB-INVALID','Otra');
  raise exception 'malformed public ID accepted';
 exception when check_violation then null;
 end;
 begin
  insert into sabora.customer_profiles(public_id,alias)
  values ('SB-333333333333','   ');
  raise exception 'blank alias accepted';
 exception when check_violation then null;
 end;
end;
$customer_profiles$;
set role anon;
do $customer_anon_denial$
begin
 begin
  perform count(*) from sabora.customer_profiles;
  raise exception 'anon read customer profiles';
 exception when insufficient_privilege then null;
 end;
end;
$customer_anon_denial$;
reset role;

-- Sessions never persist plaintext bearer tokens and cannot outlive revocation.
do $customer_sessions$
declare v_customer uuid; v_session uuid;
begin
 select id into v_customer from sabora.customer_profiles limit 1;
 insert into sabora.customer_sessions(customer_id,token_hash,expires_at)
 values (v_customer,decode(repeat('ab',32),'hex'),now()+interval '1 day')
 returning id into v_session;
 if v_session is null then raise exception 'customer session missing'; end if;
 begin
  insert into sabora.customer_sessions(customer_id,token_hash,expires_at)
  values (v_customer,decode(repeat('ab',32),'hex'),now()+interval '1 day');
  raise exception 'duplicate session token hash accepted';
 exception when unique_violation then null;
 end;
 begin
  insert into sabora.customer_sessions(customer_id,token_hash,expires_at)
  values (v_customer,decode(repeat('cd',32),'hex'),now()-interval '1 day');
  raise exception 'expired-at-creation session accepted';
 exception when check_violation then null;
 end;
 update sabora.customer_sessions set revoked_at=now() where id=v_session;
 if (select revoked_at from sabora.customer_sessions where id=v_session) is null then
  raise exception 'session revocation not persisted';
 end if;
end;
$customer_sessions$;
set role authenticated;
do $customer_session_denial$
begin
 begin
  perform count(*) from sabora.customer_sessions;
  raise exception 'authenticated browser read sessions';
 exception when insufficient_privilege then null;
 end;
end;
$customer_session_denial$;
reset role;

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
-- A dormant SQL writer must not be able to inherit permissions from other
-- roles, nor be usable as a membership bridge to an elevated SQL principal.
do $writer_memberships$
declare membership record;
begin
 for membership in
  select granted.rolname as granted_role, member.rolname as member_role
  from pg_auth_members m
  join pg_roles granted on granted.oid=m.roleid
  join pg_roles member on member.oid=m.member
  where member.rolname='sabora_admin_writer'
     or granted.rolname='sabora_admin_writer'
 loop
  raise exception 'dormant writer unexpectedly participates in role membership: % -> %',
   membership.member_role,membership.granted_role;
 end loop;
end;
$writer_memberships$;
-- Exercise the dormant role as the active SQL principal, not just ACL metadata.
-- SQL privileges must be denied even if future migrations accidentally expose
-- an object to PUBLIC or add a direct grant.
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

-- Negative mutation probe: a deliberately unsafe future GRANT must be detected
-- by the same effective-privilege checks used above. All changes are rolled
-- back within this disposable PostgreSQL session.
begin;
grant usage on schema sabora to sabora_admin_writer;
grant select on sabora.staff_members to sabora_admin_writer;
do $negative_grant$
begin
 if not has_schema_privilege('sabora_admin_writer','sabora','USAGE')
    or not has_table_privilege('sabora_admin_writer','sabora.staff_members','SELECT') then
  raise exception 'negative grant probe failed to expose unsafe access';
 end if;
end;
$negative_grant$;
rollback;
do $negative_grant_cleanup$
begin
 if has_schema_privilege('sabora_admin_writer','sabora','USAGE')
    or has_table_privilege('sabora_admin_writer','sabora.staff_members','SELECT') then
  raise exception 'negative grant probe leaked after rollback';
 end if;
end;
$negative_grant_cleanup$;

-- The rollback must restore denial for the effective SQL principal too,
-- not merely remove the ACL bits reported by catalog helpers.
set role sabora_admin_writer;
do $negative_grant_role_denial$
begin
 begin
  perform count(*) from sabora.staff_members;
  raise exception 'rolled-back grant still permits staff read';
 exception when insufficient_privilege then null;
 end;
end;
$negative_grant_role_denial$;
reset role;

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
bash scripts/ci/customer-id-concurrency-smoke.sh "$container"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-verification.sql
echo 'Sabora single-restaurant schema, private RPCs, QR, idempotency, pickup and ownership concurrency smoke passed.'

# Fail fast on SQL fixture delimiter and RPC privilege regression.
bash scripts/ci/customer-session-sql-lint.sh

# Verify a new nonprivileged customer session role starts with zero table access.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-privileges-negative.sql

# Exercise narrowly scoped SECURITY DEFINER RPCs and forced-RLS in disposable CI.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-privileges-positive.sql

# Verify no browser/staff role inherited customer session RPCs or direct write rights.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-privileges-hardening.sql

# Fail fast on invalid concurrency harness syntax before opening workers.
bash scripts/ci/customer-session-concurrency-lint.sh
# Verify concurrent revocations have one winner and leave one revoked row.
bash scripts/ci/customer-session-concurrency-smoke.sh "$container"

# Verify concurrent revocation via restricted SECURITY DEFINER RPC, not table UPDATE.
bash -n scripts/ci/customer-session-rpc-concurrency-smoke.sh
bash scripts/ci/customer-session-rpc-concurrency-smoke.sh "$container"

# Validate versioned restricted RPC migration without granting a login identity.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-versioned-rpc-smoke.sql

# Verify the catalog reader login cannot inherit RPC access outside its transaction.
bash scripts/ci/catalog-reader-login-smoke.sh "$container"

# Authenticate a genuine NOINHERIT login over container-local TCP.
bash -n scripts/ci/customer-session-login-smoke.sh
bash scripts/ci/customer-session-login-smoke.sh "$container"

# Restricted RPC negative edge cases, rolled back in disposable PostgreSQL 17.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-rpc-edge-smoke.sql
