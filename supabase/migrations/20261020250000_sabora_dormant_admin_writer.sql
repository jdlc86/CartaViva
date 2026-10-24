-- Disposable-test contract for a future technical administrative writer.
-- This NOLOGIN role deliberately has zero data grants. Never provision
-- operational credentials or expose it to browser/JWT roles.
begin;
do $writer_role$
begin
 if not exists (select 1 from pg_roles where rolname='sabora_admin_writer') then
  create role sabora_admin_writer nologin noinherit nobypassrls
   nocreatedb nocreaterole noreplication;
 end if;
end;
$writer_role$;
revoke all on schema sabora from sabora_admin_writer;
revoke all on all tables in schema sabora from sabora_admin_writer;
revoke all on all sequences in schema sabora from sabora_admin_writer;
revoke all on all functions in schema sabora from sabora_admin_writer;
comment on role sabora_admin_writer is
 'Dormant NOLOGIN role. No operational SQL privileges until a reviewed per-resource RLS contract exists.';
commit;
