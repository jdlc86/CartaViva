import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVerifiedOrderOperationsCandidate} from '../apps/api/src/order-operations-candidate-app.mjs';

test('candidate factory fails closed on missing dependencies without connecting SQL', async () => {
  await assert.rejects(createVerifiedOrderOperationsCandidate(),
    /invalid_order_operations_pool_isolation/);
});

test('candidate factory never connects to SQL when cryptographic wiring is invalid', async () => {
  const seen = [];
  const pool = user => ({
    options: {user, connectionString: 'postgres://' + user},
    query() { seen.push('query'); throw Error('unexpected_sql'); },
    async connect() { seen.push('connect'); throw Error('unexpected_sql'); },
  });
  const base = {
    staffPool: pool('sabora_staff_reader'),
    operationsPool: pool('sabora_operations'),
    staffRole: 'sabora_staff_reader',
    operationsRole: 'sabora_operations',
    issueTransitionCapability() {},
    issueReadCapability() {},
    issuer: 'https://issuer.example.test',
    getTrustedKeys: async () => [],
  };
  for (const override of [
    {issuer: ''},
    {getTrustedKeys: null},
    {issueTransitionCapability: null},
    {issueReadCapability: null},
    {staffRole: 'sabora_operations'},
  ]) {
    await assert.rejects(createVerifiedOrderOperationsCandidate({...base, ...override}),
      /invalid_order_operations_auth_config|invalid_order_operation_capability_issuer|invalid_order_operations_pool_isolation/);
    assert.deepEqual(seen, []);
  }
});

test('candidate is not imported by default production server', () => {
  const server = readFileSync(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  const factory = readFileSync(new URL('../apps/api/src/order-operations-candidate-app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /order-operations-candidate-app/);
  assert.doesNotMatch(factory, /listen\(|process\.env|new Pool\(|DATABASE_URL|SUPABASE_URL/);
});
