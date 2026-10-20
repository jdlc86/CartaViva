-- Prototype migration: ROOT uniqueness and single ADMIN writer.
-- Never apply to operational Supabase without explicit authorization.
begin;
alter table sabora.staff_members drop constraint staff_members_role_check;
alter table sabora.staff_members add constraint staff_members_role_check
 check (role in ('root','admin','waiter','kitchen'));

-- A partial unique index enforces at most one ROOT even for concurrent inserts.
create unique index sabora_one_root on sabora.staff_members ((true)) where role='root';

create table sabora.admin_write_ownership (
 singleton boolean primary key default true check (singleton),
 owner_user_id uuid references sabora.staff_members(user_id) on delete restrict,
 assigned_at timestamptz not null default now()
);
insert into sabora.admin_write_ownership(singleton) values (true);
alter table sabora.admin_write_ownership enable row level security;
alter table sabora.admin_write_ownership force row level security;
revoke all on sabora.admin_write_ownership from public,anon,authenticated;

-- Serialize owner changes and membership state changes through the same
-- singleton row. This is a prototype integrity boundary, not an HTTP API.
create function sabora.guard_staff_governance()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,sabora as $$
declare v_owner uuid;
begin
 perform 1 from sabora.admin_write_ownership where singleton for update;
 if tg_op='DELETE' then
  if old.role='root' then raise exception 'root_removal_forbidden' using errcode='42501'; end if;
  select owner_user_id into v_owner from sabora.admin_write_ownership where singleton;
  if old.user_id=v_owner then raise exception 'owner_removal_forbidden' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='UPDATE' then
  if old.role='root' and (new.role<>'root' or new.state<>'active' or new.user_id<>old.user_id) then
   raise exception 'root_change_forbidden' using errcode='42501';
  end if;
  select owner_user_id into v_owner from sabora.admin_write_ownership where singleton;
  if old.user_id=v_owner and (new.role<>'admin' or new.state<>'active' or new.user_id<>old.user_id) then
   raise exception 'owner_must_remain_active_admin' using errcode='42501';
  end if;
 end if;
 return new;
end;
$$;
create trigger sabora_staff_governance before update or delete on sabora.staff_members
 for each row execute function sabora.guard_staff_governance();

create function sabora.guard_admin_owner()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,sabora as $$
begin
 if new.owner_user_id is not null and not exists (
  select 1 from sabora.staff_members where user_id=new.owner_user_id
   and role='admin' and state='active'
 ) then raise exception 'owner_not_eligible' using errcode='42501'; end if;
 return new;
end;
$$;
create trigger sabora_admin_owner_eligibility before insert or update on sabora.admin_write_ownership
 for each row execute function sabora.guard_admin_owner();

revoke all on function sabora.guard_staff_governance() from public,anon,authenticated;
revoke all on function sabora.guard_admin_owner() from public,anon,authenticated;
commit;
