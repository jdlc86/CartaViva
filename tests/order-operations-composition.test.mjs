import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerVerifiedOrderOperationsFromPools} from '../apps/api/src/order-operations-composition.mjs';

const pool = (user, connectionString) => ({
  options: {user, connectionString},
  query() {},
  connect() {},
});

test('operations composition rejects shared or indistinguishable SQL identities', async () => {
  const staffPool = pool('sabora_staff_reader', 'postgres://staff');
  const operationPool = pool('sabora_operations', 'postgres://operations');
  const app = {get() {}, post() {}};
  const base = {staffPool, operationsPool: operationPool};
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base, operationsPool: staffPool}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_staff_reader', 'postgres://operations')}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_operations', 'postgres://staff')}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: {options: {}, connect: null}}), /pool_isolation/);
});

test('operations remain opt-in and never import into the production server', () => {
  const source = readFileSync(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /order-operations-composition|registerOrderOperationsFromPools|registerOrderOperationsHttp/);
  const composition = readFileSync(new URL('../apps/api/src/order-operations-composition.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(composition, /process\.env|new Pool\(|DATABASE_URL|SUPABASE_URL/);
  assert.doesNotMatch(composition, /export function registerOrderOperationsFromPools/);
});


test('verified composition refuses route registration before SQL identity preflight', async () => {
  const registrations = [];
  const app = {
    get(...args) { registrations.push(['get', ...args]); },
    post(...args) { registrations.push(['post', ...args]); },
  };
  const staffPool = pool('sabora_staff_reader', 'postgres://staff');
  const operationsPool = pool('sabora_operations', 'postgres://operations');
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool, operationsPool,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
  }), /invalid_order_operations_sql_client/);
  assert.equal(registrations.length, 0);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool, operationsPool, staffRole: 'postgres', operationsRole: 'sabora_operations',
  }), /invalid_order_operations_sql_identity/);
  assert.equal(registrations.length, 0);
});
