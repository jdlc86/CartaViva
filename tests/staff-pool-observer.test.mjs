import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffPoolObserver } from '../apps/api/src/staff-pool-observer.mjs';
import { createStaffPoolLifecycle } from '../apps/api/src/staff-pool-lifecycle.mjs';
const env = {
  SABORA_STAFF_DB_HOST: 'db.example.test',
  SABORA_STAFF_DB_NAME: 'postgres',
  SABORA_STAFF_DB_USER: 'sabora_staff_reader_login',
  SABORA_STAFF_DB_PASSWORD: 'DO_NOT_LOG_THIS_SECRET',
  SABORA_STAFF_DB_CA_PEM: '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'
};

test('pool emits only bounded event names without secret details', async () => {
  const events = [];
  const observe = createStaffPoolObserver({ emit: event => events.push(event) });
  class Pool {
    async query() {}
    async end() {}
  }
  const lifecycle = createStaffPoolLifecycle({ Pool, env, observe });
  lifecycle.open();
  await lifecycle.close();
  assert.deepEqual(events, [
    { component: 'staff_reader_pool', event: 'staff_pool_opened' },
    { component: 'staff_reader_pool', event: 'staff_pool_closed' }
  ]);
  assert.equal(JSON.stringify(events).includes(env.SABORA_STAFF_DB_PASSWORD), false);
  assert.throws(() => observe('arbitrary-error-message'), /invalid_staff_pool_event/);
});

test('observer failure never prevents pool cleanup', async () => {
  let closed = 0;
  class Pool {
    async query() {}
    async end() { closed++; }
  }
  const lifecycle = createStaffPoolLifecycle({
    Pool, env,
    observe: () => { throw new Error('logging-down'); }
  });
  lifecycle.open();
  await lifecycle.close();
  assert.equal(closed, 1);
});

test('pool constructor and close failures emit safe event codes', async () => {
  const events = [];
  const observe = createStaffPoolObserver({ emit: event => events.push(event.event) });
  class BrokenConstructor { constructor() { throw new Error('password=PRIVATE'); } }
  const failed = createStaffPoolLifecycle({ Pool: BrokenConstructor, env, observe });
  assert.throws(() => failed.open(), /password=PRIVATE/);
  class BrokenClose {
    async query() {}
    async end() { throw new Error('connection-string=PRIVATE'); }
  }
  const closing = createStaffPoolLifecycle({ Pool: BrokenClose, env, observe });
  closing.open();
  await assert.rejects(closing.close(), /connection-string=PRIVATE/);
  assert.deepEqual(events, ['staff_pool_open_failed', 'staff_pool_opened', 'staff_pool_close_failed']);
  assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
});
