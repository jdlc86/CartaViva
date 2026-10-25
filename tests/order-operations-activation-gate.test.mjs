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
  assert.match(preflight, /accessible_private_definer_routines\s*!==\s*0/);
  assert.match(preflight, /candidate_is_invoker\s*!==\s*true/);
  assert.match(preflight, /forced_rls_transition_requests\s*!==\s*1/);
});
