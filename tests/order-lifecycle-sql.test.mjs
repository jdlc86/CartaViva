import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261020170000_sabora_order_lifecycle.sql', import.meta.url), 'utf8');

test('lifecycle is tenant-scoped, row-serialized and role-checked', () => {
 assert.match(sql, /o\.restaurant_id=p_restaurant_id and o\.id=p_order_id for update/);
 assert.match(sql, /m\.restaurant_id=p_restaurant_id and m\.user_id=p_actor_user_id/);
 assert.match(sql, /role_not_allowed_for_transition/);
 assert.match(sql, /Whole-order cancellation and delivery are deliberately unavailable/);
 assert.match(sql, /p_next_status not in \('preparing','ready'\)/);
 assert.doesNotMatch(sql, /p_next_status in \('preparing','ready','cancelled'\)/);
 assert.match(sql, /invalid_order_transition/);
});
test('audit is tenant-scoped, private and durable', () => {
 assert.match(sql, /create table sabora\.order_status_events/);
 assert.match(sql, /foreign key \(restaurant_id,table_id,session_id,order_id\)/);
 assert.match(sql, /force row level security/);
 assert.match(sql, /insert into sabora\.order_status_events/);
 assert.match(sql, /revoke all on function sabora\.transition_order_status/);
 assert.doesNotMatch(sql, /security definer|grant execute|fleetia|drop table/i);
});
test('lifecycle migration contains a single transaction', () => {
 assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
 assert.equal(sql.trimEnd().slice(-7), 'commit;');
});
