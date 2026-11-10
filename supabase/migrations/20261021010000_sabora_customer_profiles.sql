-- Customer profiles are private and not an authentication mechanism.
-- Disposable PostgreSQL CI only until operational migration is explicitly approved.
begin;
create table sabora.customer_profiles (
 id uuid primary key default gen_random_uuid(),
 public_id text not null unique
  check (public_id ~ '^SB-[2-9A-HJ-NP-Y]{12}$'),
 alias text not null
  check (length(btrim(alias)) between 1 and 80 and alias = btrim(alias)),
 company text
  check (company is null or (length(btrim(company)) between 1 and 160 and company = btrim(company))),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table sabora.customer_profiles enable row level security;
alter table sabora.customer_profiles force row level security;
revoke all on sabora.customer_profiles from public, anon, authenticated, sabora_admin_writer;
-- No policies or browser-facing grants: even knowing public_id never authenticates.
commit;
