-- Draft persistence for administrative ownership proposals and append-only audit.
-- Isolated CI only; do not apply to operational Supabase without authorization.
begin;
create table sabora.admin_ownership_proposals (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('request','offer')),
 from_owner_id uuid not null references sabora.staff_members(user_id),
 to_owner_id uuid not null references sabora.staff_members(user_id),
 created_by uuid not null references sabora.staff_members(user_id),
 status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
 correlation_id uuid not null unique,
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 check (from_owner_id <> to_owner_id),
 check ((status='pending' and resolved_at is null) or
        (status<>'pending' and resolved_at is not null))
);
create index sabora_pending_ownership_proposals
 on sabora.admin_ownership_proposals(from_owner_id,created_at)
 where status='pending';

create table sabora.admin_ownership_audit (
 id bigint generated always as identity primary key,
 correlation_id uuid not null unique,
 actor_user_id uuid not null references sabora.staff_members(user_id),
 action text not null check (action in
  ('request','offer','accept','reject','cancel','force_transfer')),
 proposal_id uuid references sabora.admin_ownership_proposals(id),
 previous_owner_id uuid,
 next_owner_id uuid,
 reason text,
 occurred_at timestamptz not null default now()
);
create function sabora.reject_ownership_audit_mutation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,sabora as $audit_immutable$
begin
 raise exception 'ownership_audit_append_only' using errcode='42501';
end;
$audit_immutable$;
create trigger sabora_ownership_audit_immutable
 before update or delete on sabora.admin_ownership_audit
 for each row execute function sabora.reject_ownership_audit_mutation();
revoke all on function sabora.reject_ownership_audit_mutation() from public,anon,authenticated;

alter table sabora.admin_ownership_proposals enable row level security;
alter table sabora.admin_ownership_proposals force row level security;
alter table sabora.admin_ownership_audit enable row level security;
alter table sabora.admin_ownership_audit force row level security;
revoke all on sabora.admin_ownership_proposals from public,anon,authenticated;
revoke all on sabora.admin_ownership_audit from public,anon,authenticated;
commit;
