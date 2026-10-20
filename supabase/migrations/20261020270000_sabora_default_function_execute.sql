-- PostgreSQL built-in PUBLIC EXECUTE is a GLOBAL default privilege.
-- A per-schema REVOKE does not override it; revoke globally for the
-- migration-creating role, then retain schema-scoped restrictions.
-- This affects future functions created by this role in other schemas too:
-- review deployment role ownership before any operational application.
begin;
alter default privileges revoke execute on functions from public;
commit;
