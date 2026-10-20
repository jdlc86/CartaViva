import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffPoolLifecycle } from '../apps/api/src/staff-pool-lifecycle.mjs';

const env = {
  SABORA_STAFF_DB_HOST: 'db.example.test',
  SABORA_STAFF_DB_NAME: 'postgres',
  SABORA_STAFF_DB_USER: 'sabora_staff_reader_login',
  SABORA_STAFF_DB_PASSWORD: 'test-only',
  SABORA_STAFF_DB_CA_PEM: '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'
};

test('opens once with strict TLS and closes once', async () => {
  let created = 0;
  let ended = 0;
  class Pool {
    constructor(config) {
      created++;
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.user, 'sabora_staff_reader_login');
    }
    async query() { return { rows: [] }; }
    async end() { ended++; }
  }
  const lifecycle = createStaffPoolLifecycle({ Pool, env });
  assert.equal(lifecycle.isOpen, false);
  const pool = lifecycle.open();
  assert.equal(lifecycle.open(), pool);
  assert.equal(created, 1);
  assert.equal(lifecycle.isOpen, true);
  await lifecycle.close();
  await lifecycle.close();
  assert.equal(ended, 1);
  assert.equal(lifecycle.isOpen, false);
  assert.throws(() => lifecycle.open(), /staff_pool_closing/);
});

test('concurrent close calls share a single shutdown', async () => {
  let ended = 0;
  class Pool {
    async query() {}
    async end() { ended++; await Promise.resolve(); }
  }
  const lifecycle = createStaffPoolLifecycle({ Pool, env });
  lifecycle.open();
  await Promise.all([lifecycle.close(), lifecycle.close()]);
  assert.equal(ended, 1);
});

test('invalid config or driver fails before opening', () => {
  assert.throws(() => createStaffPoolLifecycle({ env }), /invalid_staff_pool_driver/);
  assert.throws(() => createStaffPoolLifecycle({ Pool: class {}, env: {} }), /invalid_staff_pool_config/);
});
