-- Prototype-only additive migration. Not authorized for operational Supabase.
-- Existing staff records must not gain active access merely by migrating.
begin;
alter table sabora.staff_members
  add column state text not null default 'invited'
  check (state in ('invited','active','suspended','revoked'));
-- The default remains invited for future inserts; activation is explicit.
-- Never expose direct writes or membership management to anon/authenticated.
revoke all on sabora.staff_members from public,anon,authenticated;
alter table sabora.staff_members enable row level security;
alter table sabora.staff_members force row level security;

-- Preserve private RPCs; reject inactive actors within the SQL transaction.
create or replace function sabora.require_active_staff_role(p_actor_user_id uuid)
returns text language plpgsql security invoker
set search_path = pg_catalog, sabora
as $$
declare v_role text;
begin
 select m.role into v_role from sabora.staff_members m
 where m.user_id=p_actor_user_id and m.state='active';
 if not found then
  raise exception 'actor_not_authorized' using errcode='42501';
 end if;
 return v_role;
end;
$$;
revoke all on function sabora.require_active_staff_role(uuid)
 from public,anon,authenticated;

-- Enforce current active membership at the audit-event write boundary.
-- Both existing transition RPCs insert an event within the same transaction;
-- an exception rolls back the preceding order/line and notification changes.
create or replace function sabora.enforce_active_transition_actor()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, sabora
as $
begin
 perform sabora.require_active_staff_role(new.actor_user_id);
 return new;
end;
$;
create trigger sabora_order_status_active_actor
 before insert on sabora.order_status_events
 for each row execute function sabora.enforce_active_transition_actor();
create trigger sabora_order_line_active_actor
 before insert on sabora.order_line_events
 for each row execute function sabora.enforce_active_transition_actor();
revoke all on function sabora.enforce_active_transition_actor()
 from public,anon,authenticated;
commit;
