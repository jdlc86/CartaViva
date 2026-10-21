import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261021010000_sabora_customer_profiles.sql',import.meta.url),'utf8');
test('customer profiles require unique server-issued labels and UUID primary keys',()=>{
 assert.match(sql,/id uuid primary key default gen_random_uuid\(\)/);
 assert.match(sql,/public_id text not null unique/);
 assert.match(sql,/check \(public_id ~ /);
 assert.match(sql,/alias text not null/);
 assert.match(sql,/company text\s+check/);
});
test('customer profiles are RLS protected without public grants or policies',()=>{
 assert.match(sql,/alter table sabora\.customer_profiles enable row level security/);
 assert.match(sql,/alter table sabora\.customer_profiles force row level security/);
 assert.match(sql,/revoke all on sabora\.customer_profiles from public, anon, authenticated, sabora_admin_writer/);
 assert.doesNotMatch(sql,/create policy|grant\s+(select|insert|update|delete)/i);
});
