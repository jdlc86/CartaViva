import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = requireApi('fastify');
import { createProtectedRouteHooks } from '../apps/api/src/protected-route-hooks.mjs';

const issuer = 'https://example.supabase.co/auth/v1';
const token = 'abc.def.ghi';

test('Fastify route rejects missing JWT, invalid JWT, inactive staff and wrong role', async t => {
  let state = 'active';
  let role = 'kitchen';
  let lookups = 0;
  const app = Fastify();
  t.after(() => app.close());
  const forRoles = createProtectedRouteHooks({
    issuer, getTrustedKeys: async () => ['key'],
    verify: jwt => {
      if (jwt !== token) throw new Error('bad_signature');
      return { userId: 'verified' };
    },
    lookupStaff: async userId => {
      assert.equal(userId, 'verified');
      lookups++;
      return { state, role };
    }
  });
  app.get('/test-only', { preHandler: forRoles(['kitchen']) }, async req => ({ actor: req.verifiedStaff.userId }));
  const send = authorization => app.inject({ method: 'GET', url: '/test-only', headers: authorization ? { authorization } : {} });
  assert.equal((await send()).statusCode, 401);
  assert.equal((await send('Bearer xyz.abc.sig')).statusCode, 401);
  assert.equal(lookups, 0);
  assert.deepEqual((await send('Bearer ' + token)).json(), { actor: 'verified' });
  state = 'revoked';
  assert.equal((await send('Bearer ' + token)).statusCode, 403);
  state = 'active';
  role = 'waiter';
  assert.equal((await send('Bearer ' + token)).statusCode, 403);
  assert.equal(lookups, 3);
});

test('Fastify route fails closed on membership database outage', async t => {
  const app = Fastify();
  t.after(() => app.close());
  const forRoles = createProtectedRouteHooks({
    issuer, getTrustedKeys: async () => [],
    verify: () => ({ userId: 'verified' }),
    lookupStaff: async () => { throw new Error('db-down'); }
  });
  app.get('/test-only', { preHandler: forRoles(['admin']) }, async () => ({ shouldNeverAppear: true }));
  const response = await app.inject({ method: 'GET', url: '/test-only', headers: { authorization: 'Bearer ' + token } });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: 'authorization_unavailable' });
});
