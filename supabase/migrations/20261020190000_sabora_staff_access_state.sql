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

-- Replace the two internal functions' role lookup using a versioned migration.
-- Their existing locking, status transitions, and audit semantics stay unchanged.
-- A source-level replacement is applied in the prior migration definitions,
-- with this migration providing the active-state column and function.
commit;
