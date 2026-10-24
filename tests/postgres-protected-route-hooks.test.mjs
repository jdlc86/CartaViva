import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPostgresProtectedRouteHooks } from '../apps/api/src/postgres-protected-route-hooks.mjs';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = requireApi('fastify');
const userId = '00000000-0000-0000-0000-000000000101';

test('HTTP authorization reads current PostgreSQL membership on every request', async t => {
  const app = Fastify();
  t.after(() => app.close());
  let state = 'active';
  let role = 'kitchen';
  let calls = 0;
  const hooks = createPostgresProtectedRouteHooks({
    issuer: 'https://example.supabase.co/auth/v1',
    getTrustedKeys: async () => [],
    verify: () => ({ userId }),
    query: async (sql, values) => {
      assert.equal(sql, 'select role, state from sabora.staff_members where user_id = $1');
      assert.deepEqual(values, [userId]);
      calls++;
      return { rows: [{ role, state }] };
    }
  });
  app.get('/test-only', { preHandler: hooks(['kitchen']) }, async request => ({
    actor: request.verifiedStaff.userId,
    role: request.verifiedStaff.role
  }));
  const request = () => app.inject({ method: 'GET', url: '/test-only', headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.deepEqual((await request()).json(), { actor: userId, role: 'kitchen' });
  state = 'suspended';
  assert.equal((await request()).statusCode, 403);
  state = 'revoked';
  assert.equal((await request()).statusCode, 403);
  state = 'active';
  role = 'waiter';
  assert.equal((await request()).statusCode, 403);
  assert.equal(calls, 4);
});

test('HTTP authorization rejects database failures without leaking details', async t => {
  const app = Fastify();
  t.after(() => app.close());
  const hooks = createPostgresProtectedRouteHooks({
    issuer: 'https://example.supabase.co/auth/v1',
    getTrustedKeys: async () => [],
    verify: () => ({ userId }),
    query: async () => { throw new Error('private database failure'); }
  });
  app.get('/test-only', { preHandler: hooks(['admin']) }, async () => ({ ok: true }));
  const response = await app.inject({ method: 'GET', url: '/test-only', headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'authorization_unavailable' });
});
