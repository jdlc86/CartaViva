import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261020150000_sabora_order_transaction.sql',import.meta.url),'utf8');
test('single restaurant order confirmation is locked, idempotent and private',()=>{
 assert.match(sql,/where t\.id = p_table_id\s+for update/);
 assert.match(sql,/from sabora\.order_idempotency i/);
 assert.match(sql,/raise exception 'idempotency_conflict'/);
 assert.match(sql,/insert into sabora\.orders \(table_id/);
 assert.match(sql,/revoke all on function sabora\.confirm_order\(uuid,text,text,text,text,jsonb\)/);
 assert.doesNotMatch(sql,/restaurant_id|tenant|security definer|grant execute/i);
});
test('rejects malformed item quantities and commits once',()=>{
 assert.match(sql,/invalid_order_items/);
 assert.equal((sql.match(/^commit;$/gm)??[]).length,1);
});
