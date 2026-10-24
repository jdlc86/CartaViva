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
  const base = {staffPool, operationsPool: operationPool,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations'};
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base, operationsPool: staffPool}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_staff_reader', 'postgres://operations')}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_operations', 'postgres://staff')}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: {options: {}, connect: null}}), /pool_isolation/);
});

test('pool isolation rejects before inspecting either SQL login or mounting routes', async () => {
  const events = [];
  const shared = {
    options: {user: 'sabora_staff_reader', connectionString: 'postgres://shared'},
    query() { events.push('staff.query'); },
    async connect() { events.push('pool.connect'); throw Error('unexpected_connection'); },
  };
  const app = {
    get() { events.push('app.get'); },
    post() { events.push('app.post'); },
  };
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool: shared, operationsPool: shared,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
  }), /pool_isolation/);
  assert.deepEqual(events, []);
});

test('verified composition rejects equal declared SQL roles before querying', async () => {
  const events = [];
  const makePool = (user, connectionString) => ({
    options: {user, connectionString},
    query() { events.push('query'); },
    async connect() { events.push('connect'); throw Error('unexpected_connection'); },
  });
  await assert.rejects(registerVerifiedOrderOperationsFromPools({
    get() { events.push('get'); }, post() { events.push('post'); },
  }, {
    staffPool: makePool('sabora_staff_reader', 'postgres://staff'),
    operationsPool: makePool('sabora_operations', 'postgres://operations'),
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_staff_reader',
    issueTransitionCapability() {},
  }), /pool_isolation/);
  assert.deepEqual(events, []);
});

test('all malformed pool configurations fail before connections and route registration', async () => {
  const events = [];
  const makePool = (user, connectionString) => ({
    options: {user, connectionString},
    query() { events.push('query'); },
    async connect() { events.push('connect'); throw Error('unexpected_connection'); },
  });
  const staffPool = makePool('sabora_staff_reader', 'postgres://staff');
  const operationsPool = makePool('sabora_operations', 'postgres://operations');
  const app = {
    get() { events.push('get'); },
    post() { events.push('post'); },
  };
  const base = {staffPool, operationsPool,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations'};
  for (const override of [
    {staffPool: null},
    {operationsPool: null},
    {staffPool: {options: {}, query: null}},
    {operationsPool: {options: {}, connect: null}},
    {operationsPool: makePool('sabora_staff_reader', 'postgres://operations')},
    {operationsPool: makePool('sabora_operations', 'postgres://staff')},
  ]) {
    await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
      ...base, ...override,
    }), /invalid_order_operations_pool_isolation/);
    assert.deepEqual(events, [], 'a rejected pool must have no SQL or HTTP side effects');
  }
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
    issueTransitionCapability() {},
  }), /invalid_order_operations_sql_client/);
  assert.equal(registrations.length, 0);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool, operationsPool, staffRole: 'postgres', operationsRole: 'sabora_operations',
    issueTransitionCapability() {},
  }), /invalid_order_operations_sql_identity/);
  assert.equal(registrations.length, 0);
});

test('verified composition rejects a missing capability issuer before SQL or routes', async () => {
  const events = [];
  const app = {get() { events.push('get'); }, post() { events.push('post'); }};
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool: pool('sabora_staff_reader', 'postgres://staff'),
    operationsPool: pool('sabora_operations', 'postgres://operations'),
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
  }), /invalid_order_operation_capability_issuer/);
  assert.deepEqual(events, []);
});
