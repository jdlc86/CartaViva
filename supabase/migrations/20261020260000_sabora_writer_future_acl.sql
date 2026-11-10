-- Defense-in-depth: keep the dormant administrative writer inaccessible
-- to newly created objects owned by the migration executor.
-- PostgreSQL default privileges are per object-creating role; this is not
-- a substitute for auditing other object owners or explicit GRANT statements.
begin;
alter default privileges in schema sabora
 revoke all on tables from sabora_admin_writer;
alter default privileges in schema sabora
 revoke all on sequences from sabora_admin_writer;
alter default privileges in schema sabora
 revoke all on functions from sabora_admin_writer;
-- PUBLIC EXECUTE on new functions is a PostgreSQL default. This revocation
-- applies to objects created by the same migration role in this schema.
alter default privileges in schema sabora
 revoke execute on functions from public;
commit;
