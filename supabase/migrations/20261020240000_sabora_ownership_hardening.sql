-- Harden the draft administrative ownership boundary.
-- Run only in disposable CI PostgreSQL until explicitly approved.
begin;

alter table sabora.admin_ownership_audit
 add column result text not null default 'succeeded'
  check (result in ('succeeded')),
 add column result_payload jsonb,
 add constraint admin_ownership_audit_request_object
  check (request_payload is null or jsonb_typeof(request_payload)='object'),
 add constraint admin_ownership_audit_result_object
  check (result_payload is null or jsonb_typeof(result_payload)='object'),
 add constraint admin_ownership_audit_reason_length
  check (reason is null or length(reason)<=1000) not valid;

-- Unlike a trigger alone, this validates any ROOT row created by an earlier
-- draft migration before the invariant existed and protects all future rows.
alter table sabora.staff_members
 add constraint staff_members_root_must_be_active
  check (role<>'root' or state='active') not valid;
alter table sabora.staff_members validate constraint staff_members_root_must_be_active;

comment on column sabora.admin_ownership_audit.result_payload is
 'Exact successful result returned by strict correlation replay; NULL disables replay of legacy rows';

create trigger sabora_ownership_audit_no_truncate
 before truncate on sabora.admin_ownership_audit
 for each statement execute function sabora.reject_ownership_audit_mutation();

create function sabora.guard_root_membership()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,sabora as $root_membership$
begin
 if new.role='root' and new.state<>'active' then
  raise exception 'root_must_be_active' using errcode='42501';
 end if;
 if tg_op='UPDATE' and old.role<>'root' and new.role='root' then
  raise exception 'root_promotion_requires_recovery_path' using errcode='42501';
 end if;
 return new;
end;
$root_membership$;

create trigger sabora_root_membership_eligibility
 before insert or update on sabora.staff_members
 for each row execute function sabora.guard_root_membership();

revoke all on function sabora.guard_root_membership() from public,anon,authenticated;
alter default privileges in schema sabora revoke execute on functions from public;

commit;
