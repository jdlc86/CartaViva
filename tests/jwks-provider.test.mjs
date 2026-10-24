import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseJwksProvider } from '../apps/api/src/jwks.mjs';

const issuer = 'https://example.supabase.co/auth/v1';
const jwks = { keys: [{ kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'k1', n: 'AQAB', e: 'AQAB' }] };
const response = (data = jwks) => ({ ok: true, headers: { get: () => null }, text: async () => JSON.stringify(data) });

test('JWKS provider uses only pinned issuer endpoint, caches and refreshes on expiry', async () => {
  const urls = [];
  let time = 0;
  const getKeys = createSupabaseJwksProvider({
    issuer, now: () => time, ttlMs: 1000,
    fetchImpl: async (url, options) => {
      urls.push(url);
      assert.equal(options.redirect, 'error');
      return response();
    }
  });
  assert.equal((await getKeys())[0].kid, 'k1');
  assert.equal((await getKeys())[0].kid, 'k1');
  assert.equal(urls.length, 1);
  time = 1001;
  await getKeys();
  assert.deepEqual(urls, [issuer + '/.well-known/jwks.json', issuer + '/.well-known/jwks.json']);
});
test('JWKS provider coalesces simultaneous fetches', async () => {
  let calls = 0;
  const getKeys = createSupabaseJwksProvider({ issuer, fetchImpl: async () => { calls++; await Promise.resolve(); return response(); } });
  const [a, b] = await Promise.all([getKeys(), getKeys()]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});
test('JWKS provider rejects bad keys, failures and invalid configuration', async () => {
  assert.throws(() => createSupabaseJwksProvider({ issuer: 'http://localhost/auth/v1' }), /invalid_jwks_config/);
  for (const data of [{ keys: [] }, { keys: [{ kty: 'oct', kid: 'k1' }] }]) {
    const getKeys = createSupabaseJwksProvider({ issuer, fetchImpl: async () => response(data) });
    await assert.rejects(getKeys(), /jwks_invalid/);
  }
  const getKeys = createSupabaseJwksProvider({ issuer, fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(getKeys(), /offline/);
});
