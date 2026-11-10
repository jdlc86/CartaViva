-- Draft only: privileged backend authorization must precede all calls.
-- No API/client grants; preserves all existing order history.
begin;

create table sabora.order_status_events (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null,
  session_id uuid not null,
  order_id uuid not null,
  from_status text not null check (from_status in ('confirmed','preparing','ready','cancelled','delivered')),
  to_status text not null check (to_status in ('confirmed','preparing','ready','cancelled','delivered')),
  actor_user_id uuid not null,
  reason text,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (table_id,session_id,order_id)
    references sabora.orders(table_id,session_id,id),
  check (reason is null or length(btrim(reason)) between 1 and 500)
);
create index order_status_events_history
  on sabora.order_status_events(order_id,occurred_at,id);

alter table sabora.order_status_events enable row level security;
alter table sabora.order_status_events force row level security;
revoke all on sabora.order_status_events from public, anon, authenticated;

create or replace function sabora.transition_order_status(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_next_status text,
  p_reason text default null
)
returns table (updated_order_id uuid, previous_status text, current_status text)
language plpgsql
security invoker
set search_path = pg_catalog, sabora
as $$
declare
  v_order sabora.orders%rowtype;
  v_role text;
  v_reason text;
begin
  if p_order_id is null or p_actor_user_id is null
    or p_next_status is null
    or p_next_status not in ('preparing','ready')
    or (p_reason is not null and length(btrim(p_reason)) not between 1 and 500)
  then
    raise exception 'invalid_transition_input' using errcode = '22023';
  end if;
  v_reason := nullif(btrim(p_reason), '');

  -- Serialize status changes; verify tenant and membership inside the same transaction.
  select * into v_order from sabora.orders o
    where o.id=p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select m.role into v_role from sabora.staff_members m
    where m.user_id=p_actor_user_id;
  if not found then
    raise exception 'actor_not_authorized' using errcode = '42501';
  end if;

  if not (
    (v_order.status='confirmed' and p_next_status='preparing')
    or (v_order.status='preparing' and p_next_status='ready')
  ) then
    raise exception 'invalid_order_transition' using errcode = '22023';
  end if;
  if not (
    v_role='admin'
    or (v_role='kitchen' and p_next_status in ('preparing','ready'))
  ) then
    raise exception 'role_not_allowed_for_transition' using errcode = '42501';
  end if;
  -- Whole-order cancellation and delivery are deliberately unavailable.
  -- Kitchen incidents require administrative arbitration and per-item adjustment;
  -- waiter pickup requires per-item acknowledgement, not order-level delivery.

  update sabora.orders set status=p_next_status where id=v_order.id;
  insert into sabora.order_status_events
    (table_id,session_id,order_id,from_status,to_status,actor_user_id,reason)
  values
    (v_order.table_id,v_order.session_id,v_order.id,
     v_order.status,p_next_status,p_actor_user_id,v_reason);
  return query select v_order.id,v_order.status,p_next_status;
end;
$$;
revoke all on function sabora.transition_order_status(uuid,uuid,text,text)
  from public, anon, authenticated;
commit;
