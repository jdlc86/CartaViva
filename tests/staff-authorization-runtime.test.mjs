import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createStaffAuthorizationRuntime } from '../apps/api/src/staff-authorization-runtime.mjs';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = requireApi('fastify');
const userId = '00000000-0000-0000-0000-000000000101';
const env = {
  SABORA_STAFF_DB_HOST: 'db.example.test',
  SABORA_STAFF_DB_NAME: 'postgres',
  SABORA_STAFF_DB_USER: 'sabora_staff_reader_login',
  SABORA_STAFF_DB_PASSWORD: 'TEST_SECRET',
  SABORA_STAFF_DB_CA_PEM: '-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----'
};
const auth = {
  issuer: 'https://example.supabase.co/auth/v1',
  getTrustedKeys: async () => [],
  verify: () => ({ userId })
};

test('full runtime uses one pool, enforces current membership and shuts down once', async t => {
  let constructed = 0;
  let ended = 0;
  let state = 'active';
  const sqlCalls = [];
  const events = [];
  class Pool {
    constructor(config) {
      constructed++;
      assert.equal(config.ssl.rejectUnauthorized, true);
      assert.equal(config.user, 'sabora_staff_reader_login');
    }
    async query(sql, params) {
      sqlCalls.push({ sql, params });
      return { rows: [{ role: 'waiter', state }] };
    }
    async end() { ended++; }
  }
  const runtime = createStaffAuthorizationRuntime({
    Pool, env, ...auth, emit: event => events.push(event)
  });
  const hooks = await runtime.open();
  assert.equal(await runtime.open(), hooks);
  const app = Fastify({ logger: false });
  t.after(() => app.close());
  app.get('/offline-only', { preHandler: hooks(['waiter']) }, async () => ({ ok: true }));
  const request = () => app.inject({
    method: 'GET', url: '/offline-only',
    headers: { authorization: 'Bearer abc.def.ghi' }
  });
  assert.equal((await request()).statusCode, 200);
  state = 'revoked';
  assert.equal((await request()).statusCode, 403);
  assert.equal(constructed, 1);
  assert.equal(sqlCalls.length, 2);
  assert.ok(sqlCalls.every(({ sql }) => sql === 'select role, state from sabora.staff_members where user_id = $1'));
  await Promise.all([runtime.close(), runtime.close()]);
  assert.equal(ended, 1);
  assert.equal(runtime.isOpen, false);
  await assert.rejects(runtime.open(), /staff_pool_closing/);
  assert.deepEqual(events.map(x => x.event), ['staff_pool_opened', 'staff_pool_closed']);
});

test('invalid authorization composition closes pool before failing', async () => {
  let ended = 0;
  class Pool {
    async query() { return { rows: [] }; }
    async end() { ended++; }
  }
  const runtime = createStaffAuthorizationRuntime({ Pool, env, issuer: auth.issuer });
  await assert.rejects(runtime.open());
  assert.equal(ended, 1);
  assert.equal(runtime.isOpen, false);
  await assert.rejects(runtime.open(), /staff_pool_closing/);
});

test('query outage yields sanitized HTTP 503 and bounded diagnostic', async t => {
  const events = [];
  class Pool {
    async query() { throw new Error('postgres://user:PRIVATE_PASSWORD@db'); }
    async end() {}
  }
  const runtime = createStaffAuthorizationRuntime({
    Pool, env, ...auth, emit: event => events.push(event)
  });
  const hooks = await runtime.open();
  const app = Fastify({ logger: false });
  t.after(async () => { await app.close(); await runtime.close(); });
  app.get('/offline-only', { preHandler: hooks(['waiter']) }, async () => ({ ok: true }));
  const response = await app.inject({
    method: 'GET', url: '/offline-only',
    headers: { authorization: 'Bearer abc.def.ghi' }
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'authorization_unavailable' });
  assert.equal(response.body.includes('PRIVATE_PASSWORD'), false);
  assert.deepEqual(events.map(x => x.event), ['staff_pool_opened', 'staff_reader_query_failed']);
});
