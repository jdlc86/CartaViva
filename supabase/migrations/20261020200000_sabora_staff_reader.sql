-- Draft privilege contract only. Do not apply to operational Supabase.
-- This identity is a dedicated backend read-only role, not a browser/JWT role.
-- PostgreSQL FORCE RLS still applies: an explicit narrow SELECT policy is needed.
begin;
do $role$
begin
 if not exists (select 1 from pg_roles where rolname='sabora_staff_reader') then
  create role sabora_staff_reader nologin nobypassrls;
 end if;
end;
$role$;
grant usage on schema sabora to sabora_staff_reader;
grant select (user_id, role, state) on sabora.staff_members to sabora_staff_reader;
create policy sabora_staff_reader_select on sabora.staff_members
 for select to sabora_staff_reader using (true);
-- The only purpose of this policy is current membership resolution by the
-- backend. This role must never be granted to anon/authenticated/public.
revoke all on schema sabora from public,anon,authenticated;
revoke all on sabora.staff_members from public,anon,authenticated;
commit;
