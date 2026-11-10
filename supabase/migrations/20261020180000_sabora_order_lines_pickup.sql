-- Internal PoC: item-level kitchen readiness and waiter pickup.
-- Not a dispatch/payment authorization, no grants to API/client roles.
begin;
create table sabora.order_lines (
 id uuid primary key default gen_random_uuid(),
 table_id uuid not null,
 session_id uuid not null,
 order_id uuid not null,
 line_number integer not null check (line_number > 0),
 category text not null check (category in ('drink','starter','main','dessert')),
 name text not null check (length(btrim(name)) between 1 and 160),
 quantity integer not null check (quantity between 1 and 20),
 status text not null default 'confirmed' check (status in ('confirmed','preparing','ready','picked_up')),
 foreign key (table_id,session_id,order_id)
   references sabora.orders(table_id,session_id,id),
 unique (order_id,line_number),
 unique (order_id,id)
);
create index order_lines_by_order on sabora.order_lines(order_id,line_number);

-- Existing PoC orders retain their line identities; no rewrite of history.
insert into sabora.order_lines
 (table_id,session_id,order_id,line_number,category,name,quantity)
select o.table_id,o.session_id,o.id,item.ordinality,
       item.value->>'category',item.value->>'name',(item.value->>'quantity')::integer
from sabora.orders o
cross join lateral jsonb_array_elements(o.items) with ordinality as item(value,ordinality);

create table sabora.pickup_notifications (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null,
 order_line_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 acknowledged_at timestamptz,
 acknowledged_by uuid,
 foreign key (order_id,order_line_id)
   references sabora.order_lines(order_id,id),
 unique (order_line_id),
 check ((acknowledged_at is null) = (acknowledged_by is null))
);
create index pickup_notifications_pending on sabora.pickup_notifications(created_at,id)
 where acknowledged_at is null;

create table sabora.order_line_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null,
 order_line_id uuid not null,
 actor_user_id uuid not null,
 from_status text not null,
 to_status text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 foreign key (order_id,order_line_id)
   references sabora.order_lines(order_id,id)
);
create index order_line_events_history on sabora.order_line_events(order_line_id,occurred_at,id);

-- The PoC order confirmation function has not yet been integrated with
-- the production dispatch/revision flow. Synchronize newly confirmed
-- order JSON into immutable line identities in the same transaction.
create or replace function sabora.create_order_lines_on_insert()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, sabora
as $$
begin
 insert into sabora.order_lines
  (table_id,session_id,order_id,line_number,category,name,quantity)
 select new.table_id,new.session_id,new.id,item.ordinality,
        item.value->>'category',item.value->>'name',(item.value->>'quantity')::integer
 from jsonb_array_elements(new.items) with ordinality as item(value,ordinality);
 return new;
end;
$$;
create trigger sabora_order_lines_insert
 after insert on sabora.orders for each row
 execute function sabora.create_order_lines_on_insert();

create or replace function sabora.transition_order_line(
 p_order_line_id uuid,
 p_actor_user_id uuid,
 p_next_status text
)
returns table (updated_line_id uuid, previous_status text, current_status text)
language plpgsql security invoker
set search_path = pg_catalog, sabora
as $$
declare
 v_line sabora.order_lines%rowtype;
 v_role text;
begin
 if p_order_line_id is null or p_actor_user_id is null
    or p_next_status is null or p_next_status not in ('preparing','ready','picked_up') then
   raise exception 'invalid_line_transition_input' using errcode='22023';
 end if;
 select * into v_line from sabora.order_lines l
  where l.id=p_order_line_id for update;
 if not found then raise exception 'line_not_found' using errcode='P0002'; end if;
 select m.role into v_role from sabora.staff_members m
  where m.user_id=p_actor_user_id;
 if not found then raise exception 'actor_not_authorized' using errcode='42501'; end if;
 if not (
   (v_line.status='confirmed' and p_next_status='preparing')
   or (v_line.status='preparing' and p_next_status='ready')
   or (v_line.status='ready' and p_next_status='picked_up')
 ) then raise exception 'invalid_line_transition' using errcode='22023'; end if;
 if not (v_role='admin'
   or (v_role='kitchen' and p_next_status in ('preparing','ready'))
   or (v_role='waiter' and p_next_status='picked_up')) then
   raise exception 'role_not_allowed_for_line_transition' using errcode='42501';
 end if;
 update sabora.order_lines set status=p_next_status where id=v_line.id;
 if p_next_status='ready' then
   insert into sabora.pickup_notifications(order_id,order_line_id)
   values(v_line.order_id,v_line.id);
 elsif p_next_status='picked_up' then
   update sabora.pickup_notifications
     set acknowledged_at=clock_timestamp(),acknowledged_by=p_actor_user_id
     where order_line_id=v_line.id
       and acknowledged_at is null;
   if not found then raise exception 'pickup_notification_missing' using errcode='P0002'; end if;
 end if;
 insert into sabora.order_line_events
  (order_id,order_line_id,actor_user_id,from_status,to_status)
 values(v_line.order_id,v_line.id,p_actor_user_id,v_line.status,p_next_status);
 return query select v_line.id,v_line.status,p_next_status;
end;
$$;

alter table sabora.order_lines enable row level security;
alter table sabora.order_lines force row level security;
alter table sabora.pickup_notifications enable row level security;
alter table sabora.pickup_notifications force row level security;
alter table sabora.order_line_events enable row level security;
alter table sabora.order_line_events force row level security;
revoke all on sabora.order_lines,sabora.pickup_notifications,sabora.order_line_events from public,anon,authenticated;
revoke all on function sabora.create_order_lines_on_insert() from public,anon,authenticated;
revoke all on function sabora.transition_order_line(uuid,uuid,text) from public,anon,authenticated;
commit;
