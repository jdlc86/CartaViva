import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261020150000_sabora_order_transaction.sql', import.meta.url), 'utf8');

test('order confirmation serializes table changes before reading idempotency', () => {
 const lock = sql.indexOf('for update;');
 const prior = sql.indexOf('from sabora.order_idempotency i');
 const insert = sql.indexOf('insert into sabora.orders');
 assert.ok(lock > 0 && prior > lock && insert > prior);
 assert.match(sql, /t\.id = p_table_id and t\.restaurant_id = p_restaurant_id/);
 assert.match(sql, /v_table\.qr_token_hash <> sha256\(convert_to\(p_qr_token, 'UTF8'\)\)/);
});

test('idempotency is durable, session-scoped, and rejects mismatched retries', () => {
 assert.match(sql, /i\.session_id = v_table\.session_id/);
 assert.match(sql, /i\.customer_identity_hash = v_identity_hash and i\.request_key = p_request_key/);
 assert.match(sql, /v_previous\.payload_hash <> v_payload_hash/);
 assert.match(sql, /raise exception 'idempotency_conflict'/);
 assert.match(sql, /insert into sabora\.order_idempotency/);
});

test('RPC remains private until backend authorization is implemented', () => {
 assert.match(sql, /security invoker/i);
 assert.match(sql, /revoke all on function sabora\.confirm_order[\s\S]*from public, anon, authenticated/i);
 assert.doesNotMatch(sql, /security definer|grant execute|fleetia|docker/i);
});

test('quantity parsing and customer identity are safe against malformed JSON and delimiter collisions', () => {
 assert.match(sql, /coalesce\(item->>'quantity', ''\) ~ '\^\[0-9\]\{1,2\}\$'/);
 assert.match(sql, /then \(item->>'quantity'\)::integer not between 1 and 20/);
 assert.match(sql, /else true end/);
 assert.match(sql, /length\(btrim\(p_company\)\)::text/);
 assert.match(sql, /length\(btrim\(p_employee_number\)\)::text/);
});
