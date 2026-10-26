import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/migrations/20261026120000_sabora_order_operations_read_capability_candidate.sql',
  import.meta.url,
), 'utf8');
const driverHarness = readFileSync(new URL(
  '../scripts/ci/catalog-postgres17-node-driver-smoke.sh', import.meta.url,
), 'utf8');

test('read migration binds SQL login, actor, role, operation and exact scope', () => {
  assert.match(sql, /p_database_role <> session_user::text/i);
  assert.match(sql, /sabora\.order-operations-read\.v1/);
  assert.match(sql, /p_staff_role[\s\S]*p_operation[\s\S]*p_scope[\s\S]*p_issued_at_ms[\s\S]*p_expires_at_ms/);
  assert.match(sql, /from sabora\.order_operation_signing_keys[\s\S]*for share/i);
  assert.match(sql, /from sabora\.staff_members[\s\S]*state = 'active'[\s\S]*for share/i);
  assert.match(sql, /p_expires_at_ms <= v_now_ms[\s\S]*v_key_expires_at <= v_now/i);
  assert.match(sql, /get_byte\(v_expected_signature[\s\S]*get_byte\(v_provided_signature/i);
});

test('read projections are role-scoped, bounded and dormant by default', () => {
  assert.match(sql, /read_order_operations_board_authorized_candidate/);
  assert.match(sql, /read_order_operations_history_authorized_candidate/);
  assert.match(sql, /p_staff_role = 'kitchen'[\s\S]*confirmed','preparing','ready'/i);
  assert.match(sql, /p_staff_role = 'waiter'[\s\S]*ready','picked_up'/i);
  assert.match(sql, /limit p_limit \+ 1/i);
  assert.match(sql, /Do not turn history into an order UUID oracle/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION sabora\.read_order_operations_board/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION sabora\.read_order_operations_history/i);
  assert.doesNotMatch(sql, /CREATE ROLE [^\n]+ LOGIN/i);
  assert.doesNotMatch(sql, /INSERT INTO sabora\.order_operation_signing_keys/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]*TO [a-z0-9_]+\s*;/i);
  assert.match(driverHarness, /node --test scripts\/ci\/order-operations-read-postgres17\.test\.mjs/);
});
