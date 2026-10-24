import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261020180000_sabora_order_lines_pickup.sql',import.meta.url),'utf8');
test('single restaurant item identity and pickup notification are distinct from order delivery',()=>{
 assert.match(sql,/unique \(order_id,line_number\)/);
 assert.match(sql,/create trigger sabora_order_lines_insert/);
 assert.match(sql,/insert into sabora\.pickup_notifications/);
 assert.match(sql,/acknowledged_at=clock_timestamp\(\)/);
 assert.match(sql,/from sabora\.staff_members m/);
 assert.match(sql,/revoke all on function sabora\.transition_order_line\(uuid,uuid,text\)/);
 assert.doesNotMatch(sql,/restaurant_id|restaurant_members|security definer|grant execute|update sabora\.orders set status='delivered'/i);
});
