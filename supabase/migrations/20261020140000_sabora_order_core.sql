-- Sabora: single-restaurant prototype schema. Never applied to production.
begin;
create schema if not exists sabora;
create table sabora.restaurant_settings (
 singleton boolean primary key default true check (singleton),
 name text not null check (length(btrim(name)) between 1 and 160),
 created_at timestamptz not null default now()
);
create table sabora.staff_members (
 user_id uuid primary key,
 role text not null check (role in ('admin','waiter','kitchen'))
);
create table sabora.dining_tables (
 id uuid primary key default gen_random_uuid(),
 number integer not null unique check (number > 0),
 capacity integer not null check (capacity > 0),
 description text not null default '',
 qr_token_hash bytea not null check (octet_length(qr_token_hash)=32),
 qr_version integer not null default 1 check (qr_version > 0),
 session_id uuid not null default gen_random_uuid(),
 first_confirmed_at timestamptz,
 grouping_window_seconds integer not null default 300 check (grouping_window_seconds between 60 and 3600)
);
create table sabora.orders (
 id uuid primary key default gen_random_uuid(),
 table_id uuid not null references sabora.dining_tables(id),
 session_id uuid not null,
 company text not null check (length(btrim(company)) between 1 and 160),
 employee_number text not null check (length(btrim(employee_number)) between 1 and 80),
 confirmed_at timestamptz not null,
 grouping text not null check (grouping in ('first','grouped','late')),
 status text not null default 'confirmed' check (status in ('confirmed','preparing','ready','cancelled','delivered')),
 items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 50),
 unique (table_id,session_id,id)
);
create table sabora.order_idempotency (
 table_id uuid not null references sabora.dining_tables(id),
 session_id uuid not null,
 customer_identity_hash bytea not null check (octet_length(customer_identity_hash)=32),
 request_key text not null check (length(request_key) between 8 and 128 and translate(request_key,'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-','')=''),
 payload_hash bytea not null check (octet_length(payload_hash)=32),
 order_id uuid not null unique,
 primary key (table_id,session_id,customer_identity_hash,request_key),
 foreign key (table_id,session_id,order_id) references sabora.orders(table_id,session_id,id)
);
create index orders_by_table_time on sabora.orders(table_id,confirmed_at desc);
revoke all on schema sabora from public;
revoke all on all tables in schema sabora from public,anon,authenticated;
alter default privileges in schema sabora revoke all on tables from public,anon,authenticated;
alter table sabora.restaurant_settings enable row level security;
alter table sabora.staff_members enable row level security;
alter table sabora.dining_tables enable row level security;
alter table sabora.orders enable row level security;
alter table sabora.order_idempotency enable row level security;
alter table sabora.restaurant_settings force row level security;
alter table sabora.staff_members force row level security;
alter table sabora.dining_tables force row level security;
alter table sabora.orders force row level security;
alter table sabora.order_idempotency force row level security;
commit;
