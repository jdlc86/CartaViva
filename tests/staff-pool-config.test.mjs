import test from 'node:test';
import assert from 'node:assert/strict';
import { readStaffPoolConfig } from '../apps/api/src/staff-pool-config.mjs';
const env = {
  SABORA_STAFF_DB_HOST: 'db.example.test',
  SABORA_STAFF_DB_PORT: '5432',
  SABORA_STAFF_DB_NAME: 'postgres',
  SABORA_STAFF_DB_USER: 'sabora_staff_reader_login',
  SABORA_STAFF_DB_PASSWORD: 'local-fixture-secret',
  SABORA_STAFF_DB_CA_PEM: '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'
};

test('accepts explicit reader identity and verified TLS settings', () => {
  const config = readStaffPoolConfig(env);
  assert.equal(config.user, 'sabora_staff_reader_login');
  assert.equal(config.port, 5432);
  assert.deepEqual(config.ssl, { ca: env.SABORA_STAFF_DB_CA_PEM, rejectUnauthorized: true });
  assert.equal(config.max, 3);
});
test('rejects missing CA, invalid port, wrong role and URL-shaped host', () => {
  for (const patch of [
    { SABORA_STAFF_DB_CA_PEM: '' },
    { SABORA_STAFF_DB_PORT: '65536' },
    { SABORA_STAFF_DB_PORT: 'not-a-port' },
    { SABORA_STAFF_DB_USER: 'postgres' },
    { SABORA_STAFF_DB_HOST: 'postgres://host' }
  ]) {
    assert.throws(() => readStaffPoolConfig({ ...env, ...patch }), /invalid_staff_pool_config/);
  }
});
test('never includes a connection string or allows insecure TLS fallback', () => {
  const config = readStaffPoolConfig(env);
  assert.equal('connectionString' in config, false);
  assert.equal(config.ssl.rejectUnauthorized, true);
});
