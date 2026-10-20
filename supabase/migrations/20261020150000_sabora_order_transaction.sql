-- Draft, not deployed. Executed by a future restricted backend DB role only.
begin;

create or replace function sabora.confirm_order(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_qr_token text,
  p_company text,
  p_employee_number text,
  p_request_key text,
  p_items jsonb
)
returns table (order_id uuid, order_grouping text, grouping_deadline timestamptz, repeated boolean)
language plpgsql
security invoker
set search_path = pg_catalog, sabora
as $$
declare
  v_table sabora.dining_tables%rowtype;
  v_now timestamptz;
  v_identity_hash bytea;
  v_payload_hash bytea;
  v_previous record;
  v_order_id uuid;
  v_grouping text;
begin
  if p_restaurant_id is null or p_table_id is null or p_qr_token is null
    or length(p_qr_token) not between 32 and 512 or p_company is null or length(btrim(p_company)) not between 1 and 160
    or p_employee_number is null or length(btrim(p_employee_number)) not between 1 and 80
    or p_request_key is null or p_request_key !~ '^[a-zA-Z0-9_-]{8,128}$'
    or p_items is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 50
  then
    raise exception 'invalid_order_input' using errcode = '22023';
  end if;

  -- Match the in-memory domain contract before any table lock or write.
  -- Reject malformed items rather than storing untrusted arbitrary JSON.
  if exists (
    select 1 from jsonb_array_elements(p_items) as entry(item)
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'category', '') not in ('drink', 'starter', 'main', 'dessert')
      or coalesce(length(btrim(item->>'name')), 0) not between 1 and 160
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or coalesce(item->>'quantity', '') !~ '^[0-9]+$'
      or length(item->>'quantity') > 2
      or (item->>'quantity')::integer not between 1 and 20
  ) then
    raise exception 'invalid_order_items' using errcode = '22023';
  end if;

  -- Serialize every confirmation for this table. No external table can enter
  -- this transaction because of the tenant-scoped predicate.
  select * into v_table
    from sabora.dining_tables t
    where t.id = p_table_id and t.restaurant_id = p_restaurant_id
    for update;
  if not found then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;
  if v_table.qr_token_hash <> sha256(convert_to(p_qr_token, 'UTF8')) then
    raise exception 'invalid_qr' using errcode = '28000';
  end if;

  v_identity_hash := sha256(convert_to(btrim(p_company) || ':' || length(btrim(p_employee_number))::text || ':' || btrim(p_employee_number), 'UTF8'));
  v_payload_hash := sha256(convert_to(
    jsonb_build_object('company', btrim(p_company), 'employee', btrim(p_employee_number), 'items', p_items)::text,
    'UTF8'
  ));
  select i.payload_hash, i.order_id into v_previous
    from sabora.order_idempotency i
    where i.restaurant_id = p_restaurant_id and i.table_id = p_table_id
      and i.session_id = v_table.session_id
      and i.customer_identity_hash = v_identity_hash and i.request_key = p_request_key;
  if found then
    if v_previous.payload_hash <> v_payload_hash then
      raise exception 'idempotency_conflict' using errcode = '23505';
    end if;
    return query select o.id, o.grouping,
      v_table.first_confirmed_at + make_interval(secs => v_table.grouping_window_seconds), true
      from sabora.orders o where o.id = v_previous.order_id;
    return;
  end if;

  -- Read the clock after acquiring the table lock and handling replay.
  v_now := clock_timestamp();
  if v_table.first_confirmed_at is null then
    v_grouping := 'first';
    update sabora.dining_tables t set first_confirmed_at = v_now where t.id = v_table.id;
  elsif v_now < v_table.first_confirmed_at + make_interval(secs => v_table.grouping_window_seconds) then
    v_grouping := 'grouped';
  else
    v_grouping := 'late';
  end if;

  insert into sabora.orders (restaurant_id, table_id, session_id, company, employee_number, confirmed_at, grouping, items)
    values (p_restaurant_id, p_table_id, v_table.session_id, btrim(p_company), btrim(p_employee_number), v_now, v_grouping, p_items)
    returning id into v_order_id;

  insert into sabora.order_idempotency
    (restaurant_id, table_id, session_id, customer_identity_hash, request_key, payload_hash, order_id)
    values (p_restaurant_id, p_table_id, v_table.session_id, v_identity_hash, p_request_key, v_payload_hash, v_order_id);

  return query select v_order_id, v_grouping,
    coalesce(v_table.first_confirmed_at, v_now) + make_interval(secs => v_table.grouping_window_seconds), false;
end;
$$;

-- Intentionally NO EXECUTE grants to anon, authenticated or public.
revoke all on function sabora.confirm_order(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;

commit;
