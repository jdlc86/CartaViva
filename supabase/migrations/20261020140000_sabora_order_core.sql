-- Sabora-only draft migration. Not applied to any database.
begin;

create schema if not exists sabora;

create table sabora.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table sabora.restaurant_members (
  restaurant_id uuid not null references sabora.restaurants(id),
  user_id uuid not null,
  role text not null check (role in ('admin', 'waiter', 'kitchen')),
  primary key (restaurant_id, user_id)
);

create table sabora.dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references sabora.restaurants(id),
  number integer not null check (number > 0),
  capacity integer not null check (capacity > 0),
  description text not null default '',
  qr_token_hash bytea not null check (octet_length(qr_token_hash) = 32),
  qr_version integer not null default 1 check (qr_version > 0),
  session_id uuid not null default gen_random_uuid(),
  first_confirmed_at timestamptz,
  grouping_window_seconds integer not null default 300 check (grouping_window_seconds between 60 and 3600),
  unique (restaurant_id, number),
  unique (restaurant_id, id)
);

create table sabora.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  session_id uuid not null,
  company text not null check (length(btrim(company)) between 1 and 160),
  employee_number text not null check (length(btrim(employee_number)) between 1 and 80),
  confirmed_at timestamptz not null,
  grouping text not null check (grouping in ('first', 'grouped', 'late')),
  status text not null default 'confirmed' check (status in ('confirmed', 'preparing', 'ready', 'cancelled', 'delivered')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  foreign key (restaurant_id, table_id) references sabora.dining_tables(restaurant_id, id)
);

create table sabora.order_idempotency (
  restaurant_id uuid not null,
  table_id uuid not null,
  session_id uuid not null,
  customer_identity_hash bytea not null check (octet_length(customer_identity_hash) = 32),
  request_key text not null check (length(request_key) between 8 and 128),
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  order_id uuid not null unique references sabora.orders(id),
  primary key (restaurant_id, table_id, session_id, customer_identity_hash, request_key),
  foreign key (restaurant_id, table_id) references sabora.dining_tables(restaurant_id, id)
);

create index orders_by_table_time on sabora.orders(restaurant_id, table_id, confirmed_at desc);

-- No client table privileges. Runtime access will be via narrowly scoped
-- SECURITY DEFINER RPCs after authorization and transaction review.
revoke all on schema sabora from public;
revoke all on all tables in schema sabora from public, anon, authenticated;
alter default privileges in schema sabora revoke all on tables from public, anon, authenticated;

alter table sabora.restaurants enable row level security;
alter table sabora.restaurant_members enable row level security;
alter table sabora.dining_tables enable row level security;
alter table sabora.orders enable row level security;
alter table sabora.order_idempotency enable row level security;

-- FORCE RLS for owners too; no policies means default-deny until reviewed.
alter table sabora.restaurants force row level security;
alter table sabora.restaurant_members force row level security;
alter table sabora.dining_tables force row level security;
alter table sabora.orders force row level security;
alter table sabora.order_idempotency force row level security;

commit;
