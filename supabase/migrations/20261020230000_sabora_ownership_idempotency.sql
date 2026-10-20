-- Idempotency binds a correlation identifier to the complete operation.
-- Run only in disposable CI PostgreSQL until explicitly approved.
begin;
alter table sabora.admin_ownership_audit
 add column request_payload jsonb;
-- Historical rows predate strict request binding and must not be replayed.
comment on column sabora.admin_ownership_audit.request_payload is
 'Canonical request payload for strict correlation replay; NULL disables replay of legacy rows';
commit;
