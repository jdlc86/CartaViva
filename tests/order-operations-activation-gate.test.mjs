import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = async path => readFile(new URL(path, root), 'utf8');

test('production API bootstrap does not import or mount candidate operations', async () => {
  const server = await source('apps/api/src/server.mjs');
  assert.doesNotMatch(server, /order-operations-(?:composition|http|coordinator|repository)/);
  assert.doesNotMatch(server, /register(?:Verified)?OrderOperations/);
  assert.doesNotMatch(server, /\/api\/v1\/operations\//);
  assert.match(server, /trustProxy:\s*false/);
});

test('candidate transition RPC retains an untrusted actor argument and cannot be treated as activated', async () => {
  const migration = await source('supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION sabora\.transition_order_line_idempotent_candidate\s*\(/i);
  assert.match(migration, /p_actor_user_id\s+uuid/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION sabora\.transition_order_line_idempotent_candidate\(uuid,uuid,text,text\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /ALTER TABLE sabora\.order_line_transition_requests ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /ALTER TABLE sabora\.order_line_transition_requests FORCE ROW LEVEL SECURITY/i);
});

test('authorized transition candidate binds actor and operation to a sealed SQL capability', async () => {
  const migration = await source('supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql');
  assert.match(migration, /CREATE TABLE sabora\.order_operation_signing_keys/i);
  assert.match(migration, /ALTER TABLE sabora\.order_operation_signing_keys FORCE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE FUNCTION sabora\.transition_order_line_authorized_candidate/i);
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, pg_temp/i);
  assert.match(migration, /p_database_role <> session_user::text/i);
  assert.match(migration, /extensions\.hmac/i);
  const signedMessage = migration.slice(
    migration.indexOf("v_message := 'sabora.order-line-transition.v1'"),
    migration.indexOf('v_expected_signature := extensions.hmac')
  );
  for (const field of [
    'p_key_id', 'p_database_role', 'p_actor_user_id', 'p_order_line_id',
    'p_next_status', 'p_correlation_id', 'p_issued_at_ms', 'p_expires_at_ms',
  ]) assert.match(signedMessage, new RegExp(field));
  assert.match(migration, /ALTER FUNCTION sabora\.transition_order_line_authorized_candidate\([\s\S]*OWNER TO sabora_order_operations_fn_owner/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION sabora\.transition_order_line_authorized_candidate\([\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION sabora\.transition_order_line_authorized_candidate/i);
  const membershipLock = migration.indexOf('FROM sabora.staff_members member');
  const secondClock = migration.indexOf('v_now := clock_timestamp();', membershipLock);
  const replayRead = migration.indexOf('FROM sabora.order_line_transition_requests request', membershipLock);
  assert.ok(membershipLock !== -1 && secondClock > membershipLock && replayRead > secondClock,
    'expiry must be rechecked after locks and before replay disclosure');
});

test('verified composition must preflight before mounting routes', async () => {
  const composition = await source('apps/api/src/order-operations-composition.mjs');
  const gate = composition.indexOf('await preflightOrderOperationsIdentities(');
  const registration = composition.indexOf('return registerOrderOperationsFromPools(app, options)');
  assert.ok(gate !== -1 && registration > gate);
  assert.match(composition, /export async function registerVerifiedOrderOperationsFromPools/);
  assert.doesNotMatch(composition, /export\s+(?:async\s+)?function\s+registerOrderOperationsFromPools\s*\(/);
});

test('identity preflight rejects grants on actor RPC and private relations', async () => {
  const preflight = await source('apps/api/src/order-operations-identity-preflight.mjs');
  assert.match(preflight, /candidate_rpc_execute\s*!==\s*false/);
  assert.match(preflight, /accessible_private_tables\s*!==\s*0/);
  assert.match(preflight, /accessible_private_sequences\s*!==\s*0/);
  assert.match(preflight, /accessible_private_definer_routines\s*!==\s*\(allowAuthorizedTransition \? 1 : 0\)/);
  assert.match(preflight, /candidate_is_invoker\s*!==\s*true/);
  assert.match(preflight, /forced_rls_transition_requests\s*!==\s*1/);
  assert.match(preflight, /authorized_rpc_execute\s*!==\s*allowAuthorizedTransition/);
  assert.match(preflight, /unsafe_actor_rpc_execute\s*!==\s*0/);
  assert.match(preflight, /authorized_owner\s*!==\s*'sabora_order_operations_fn_owner'/);
  assert.match(preflight, /forced_rls_signing_keys\s*!==\s*1/);
});
