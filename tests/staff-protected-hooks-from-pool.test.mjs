import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createStaffProtectedHooksFromPool } from '../apps/api/src/staff-protected-hooks-from-pool.mjs';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = requireApi('fastify');
const userId = '00000000-0000-0000-0000-000000000101';

test('isolated HTTP route authorizes via pinned SQL and denies revocation', async t => {
  let state = 'active';
  const calls = [];
  const app = Fastify();
  t.after(() => app.close());
  const hooks = createStaffProtectedHooksFromPool({
    issuer: 'https://example.supabase.co/auth/v1',
    getTrustedKeys: async () => [],
    verify: () => ({ userId }),
    pool: { query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ role: 'waiter', state }] };
    } }
  });
  app.get('/test-only', { preHandler: hooks(['waiter']) }, async request => ({ actor: request.verifiedStaff.userId }));
  const req = () => app.inject({ method: 'GET', url: '/test-only', headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal((await req()).statusCode, 200);
  state = 'revoked';
  assert.equal((await req()).statusCode, 403);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.sql, 'select role, state from sabora.staff_members where user_id = $1');
    assert.deepEqual(call.params, [userId]);
  }
});

test('pool is mandatory and unavailable database fails closed', async t => {
  assert.throws(() => createStaffProtectedHooksFromPool({
    issuer: 'https://example.supabase.co/auth/v1', getTrustedKeys: async () => []
  }), /invalid_staff_reader_pool/);
  const app = Fastify();
  t.after(() => app.close());
  const hooks = createStaffProtectedHooksFromPool({
    issuer: 'https://example.supabase.co/auth/v1',
    getTrustedKeys: async () => [],
    verify: () => ({ userId }),
    pool: { query: async () => { throw new Error('offline'); } }
  });
  app.get('/test-only', { preHandler: hooks(['admin']) }, async () => ({ ok: true }));
  const response = await app.inject({ method: 'GET', url: '/test-only', headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'authorization_unavailable' });
});
