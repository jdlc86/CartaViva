-- Disposable-test contract for a future dedicated backend LOGIN role.
-- Do NOT apply to operational Supabase: role creation and secret provisioning
-- require a separate reviewed procedure and provider privilege compatibility.
begin;
do $login$
begin
 if not exists (select 1 from pg_roles where rolname = 'sabora_staff_reader_login') then
  create role sabora_staff_reader_login login nobypassrls noinherit;
 end if;
end;
$login$;
-- NOINHERIT prevents ambient access; the application would have to SET ROLE,
-- which the current query-only adapter does not do. Therefore the runtime
-- connection design must be reconciled before any real provision.
grant sabora_staff_reader to sabora_staff_reader_login;
commit;
