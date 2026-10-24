import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerOrderOperationsFromPools} from '../apps/api/src/order-operations-composition.mjs';

const pool = (user, connectionString) => ({
  options: {user, connectionString},
  query() {},
  connect() {},
});

test('operations composition rejects shared or indistinguishable SQL identities', () => {
  const staffPool = pool('sabora_staff_reader', 'postgres://staff');
  const operationPool = pool('sabora_operations', 'postgres://operations');
  const app = {get() {}, post() {}};
  const base = {staffPool, operationsPool: operationPool};
  assert.throws(() => registerOrderOperationsFromPools(app, {...base, operationsPool: staffPool}), /pool_isolation/);
  assert.throws(() => registerOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_staff_reader', 'postgres://operations')}), /pool_isolation/);
  assert.throws(() => registerOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_operations', 'postgres://staff')}), /pool_isolation/);
  assert.throws(() => registerOrderOperationsFromPools(app, {...base,
    operationsPool: {options: {}, connect: null}}), /pool_isolation/);
});

test('operations remain opt-in and never import into the production server', () => {
  const source = readFileSync(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /order-operations-composition|registerOrderOperationsFromPools|registerOrderOperationsHttp/);
  const composition = readFileSync(new URL('../apps/api/src/order-operations-composition.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(composition, /process\.env|new Pool\(|DATABASE_URL|SUPABASE_URL/);
});
