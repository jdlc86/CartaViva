import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261020140000_sabora_order_core.sql', import.meta.url), 'utf8');

test('Sabora database objects are schema-scoped and have RLS default deny', () => {
 assert.match(sql, /create schema if not exists sabora;/i);
 for (const name of ['restaurants','restaurant_members','dining_tables','orders','order_idempotency']) {
  assert.match(sql, new RegExp('create table sabora\\.' + name + '\\s*\\(', 'i'));
  assert.match(sql, new RegExp('alter table sabora\\.' + name + ' enable row level security', 'i'));
  assert.match(sql, new RegExp('alter table sabora\\.' + name + ' force row level security', 'i'));
 }
 assert.match(sql, /revoke all on all tables in schema sabora from public, anon, authenticated/i);
 assert.doesNotMatch(sql, /create policy|grant\s+(?:all|select|insert|update|delete)/i);
});

test('table and order relationships cannot cross restaurant boundaries', () => {
 assert.match(sql, /unique \(restaurant_id, number\)/);
 assert.match(sql, /unique \(restaurant_id, id\)/);
 assert.match(sql, /foreign key \(restaurant_id, table_id\) references sabora\.dining_tables\(restaurant_id, id\)/);
 assert.match(sql, /primary key \(restaurant_id, table_id, session_id, customer_identity_hash, request_key\)/);
});

test('migration contains no operations targeting other applications', () => {
 assert.doesNotMatch(sql, /fleetia|docker|drop\s+(?:schema|database)|truncate\s+/i);
});
