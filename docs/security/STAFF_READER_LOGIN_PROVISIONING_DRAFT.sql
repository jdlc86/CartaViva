-- Disposable-test contract for a future dedicated backend LOGIN role.
-- Do NOT apply to operational Supabase: role creation and secret provisioning
-- require a separate reviewed procedure and provider privilege compatibility.
begin;
do $login$
begin
 if not exists (select 1 from pg_roles where rolname = 'sabora_staff_reader_login') then
  create role sabora_staff_reader_login login nobypassrls inherit;
 end if;
end;
$login$;
-- Inheritance permits the pinned read-only lookup without SET ROLE.
-- This login must not receive other role memberships or privileges.
-- Password, TLS, network restrictions and role creation must be provisioned
-- out of band, never by application migrations.
grant sabora_staff_reader to sabora_staff_reader_login;
commit;
