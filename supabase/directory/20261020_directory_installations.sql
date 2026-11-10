-- CartaViva central directory, independent from the Sabora operational database.
-- Private by default: no client grants, no public resolver until authentication and abuse controls are reviewed.
begin;
create schema if not exists cartaviva_directory;
create table cartaviva_directory.installations (
 id uuid primary key default gen_random_uuid(),
 restaurant_code text not null unique
   check (restaurant_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
 display_name text not null check (length(btrim(display_name)) between 1 and 160),
 pwa_origin text not null check (
   pwa_origin ~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{2,5})?$'
   and pwa_origin !~ '[?#@]'
 ),
 state text not null default 'pending' check (state in ('pending','active','suspended')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index installations_state_code on cartaviva_directory.installations(state,restaurant_code);
revoke all on schema cartaviva_directory from public,anon,authenticated;
revoke all on all tables in schema cartaviva_directory from public,anon,authenticated;
alter default privileges in schema cartaviva_directory revoke all on tables from public,anon,authenticated;
alter table cartaviva_directory.installations enable row level security;
alter table cartaviva_directory.installations force row level security;
commit;
