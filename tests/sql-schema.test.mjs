import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261020140000_sabora_order_core.sql',import.meta.url),'utf8');
test('single restaurant schema has no multi-restaurant entities or routing',()=>{
 assert.match(sql,/create table sabora\.restaurant_settings/);
 assert.match(sql,/singleton boolean primary key/);
 assert.match(sql,/create table sabora\.staff_members/);
 assert.doesNotMatch(sql,/restaurant_id|create table sabora\.restaurants\b|restaurant_members|tenant/i);
 for(const name of ['restaurant_settings','staff_members','dining_tables','orders','order_idempotency']){
  assert.match(sql,new RegExp('create table sabora\\.'+name+'\\s*\\('));
  assert.match(sql,new RegExp('alter table sabora\\.'+name+' force row level security'));
 }
 assert.match(sql,/revoke all on all tables in schema sabora from public,anon,authenticated/);
});
test('order idempotency and table uniqueness preserve integrity',()=>{
 assert.match(sql,/number integer not null unique/);
 assert.match(sql,/primary key \(table_id,session_id,customer_identity_hash,request_key\)/);
 assert.match(sql,/foreign key \(table_id,session_id,order_id\)/);
});
