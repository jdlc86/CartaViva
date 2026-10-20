import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261020180000_sabora_order_lines_pickup.sql', import.meta.url), 'utf8');

test('each order item has a stable line identity and history', () => {
 assert.match(sql, /create table sabora\.order_lines/);
 assert.match(sql, /unique \(restaurant_id,order_id,line_number\)/);
 assert.match(sql, /create table sabora\.order_line_events/);
 assert.match(sql, /create trigger sabora_order_lines_insert/);
 assert.match(sql, /jsonb_array_elements\(new\.items\) with ordinality/);
});
test('ready creates a pickup notification, pickup acknowledges rather than delivers', () => {
 assert.match(sql, /p_next_status='ready'/);
 assert.match(sql, /p_next_status='picked_up'/);
 assert.match(sql, /insert into sabora\.pickup_notifications/);
 assert.match(sql, /acknowledged_at=clock_timestamp\(\),acknowledged_by=p_actor_user_id/);
 assert.match(sql, /v_role='waiter' and p_next_status='picked_up'/);
 assert.doesNotMatch(sql, /update sabora\.orders set status='delivered'/);
 assert.doesNotMatch(sql, /p_next_status='cancelled'/);
});
test('line-level RPC remains private, row locked, tenant scoped and RLS default-deny', () => {
 assert.match(sql, /l\.restaurant_id=p_restaurant_id and l\.id=p_order_line_id for update/);
 assert.match(sql, /m\.restaurant_id=p_restaurant_id and m\.user_id=p_actor_user_id/);
 for (const name of ['order_lines','pickup_notifications','order_line_events']) {
  assert.match(sql, new RegExp('alter table sabora\\.'+name+' force row level security'));
 }
 assert.match(sql, /revoke all on function sabora\.transition_order_line/);
 assert.doesNotMatch(sql, /security definer|grant execute|fleetia|drop table/i);
 assert.equal((sql.match(/^commit;$/gm)??[]).length,1);
});
