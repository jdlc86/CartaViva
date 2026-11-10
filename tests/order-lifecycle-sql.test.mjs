import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261020170000_sabora_order_lifecycle.sql',import.meta.url),'utf8');
test('single restaurant staff lifecycle is private and cancellation gated',()=>{
 assert.match(sql,/from sabora\.staff_members m/);
 assert.match(sql,/p_next_status not in \('preparing','ready'\)/);
 assert.match(sql,/revoke all on function sabora\.transition_order_status\(uuid,uuid,text,text\)/);
 assert.match(sql,/force row level security/);
 assert.doesNotMatch(sql,/restaurant_id|restaurant_members|security definer|grant execute/i);
});
