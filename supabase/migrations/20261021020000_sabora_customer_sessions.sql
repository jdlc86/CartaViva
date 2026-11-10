-- Customer sessions: opaque bearer tokens are never stored in plaintext.
-- No client grants or policies; no HTTP exposure. Run in disposable CI only.
begin;
create table sabora.customer_sessions (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references sabora.customer_profiles(id) on delete cascade,
 token_hash bytea not null unique check (octet_length(token_hash)=32),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 last_seen_at timestamptz,
 constraint customer_session_expiry_check check (expires_at > created_at),
 constraint customer_session_revocation_check check (revoked_at is null or revoked_at >= created_at)
);
create index customer_sessions_customer_id_idx on sabora.customer_sessions(customer_id);
alter table sabora.customer_sessions enable row level security;
alter table sabora.customer_sessions force row level security;
revoke all on sabora.customer_sessions from public, anon, authenticated, sabora_admin_writer;
commit;
