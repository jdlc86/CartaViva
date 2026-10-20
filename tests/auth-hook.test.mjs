import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticationHook } from '../apps/api/src/auth-hook.mjs';

const issuer = 'https://example.supabase.co/auth/v1';
const token = 'abc.def.ghi';
const request = authorization => ({ headers: authorization === undefined ? {} : { authorization } });
const reply = () => ({
  status: null, body: null,
  code(status) { this.status = status; return this; },
  send(body) { this.body = body; return this; }
});

test('rejects absent, malformed and spoofed authorization headers before JWKS fetch', async () => {
  let calls = 0;
  const authenticate = createAuthenticationHook({ issuer, getTrustedKeys: async () => { calls++; return []; } });
  for (const header of [undefined, '', 'Basic abc', 'bearer ' + token, 'Bearer ' + token + ' extra', 'Bearer fake']) {
    const req = request(header), res = reply();
    await authenticate(req, res);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
    assert.equal(req.verifiedIdentity, undefined);
  }
  assert.equal(calls, 0);
});
test('verified identity is assigned exclusively from cryptographic verifier result', async () => {
  const req = request('Bearer ' + token);
  req.actorUserId = 'attacker';
  const res = reply();
  const authenticate = createAuthenticationHook({
    issuer,
    getTrustedKeys: async () => ['trusted'],
    verify: (jwt, config) => {
      assert.equal(jwt, token);
      assert.deepEqual(config, { issuer, keys: ['trusted'] });
      return Object.freeze({ userId: 'verified-user' });
    }
  });
  await authenticate(req, res);
  assert.equal(res.status, null);
  assert.equal(req.verifiedIdentity.userId, 'verified-user');
});
test('invalid tokens and unavailable keys fail closed without leaking details', async () => {
  for (const failure of ['keys', 'verify']) {
    const req = request('Bearer ' + token), res = reply();
    const authenticate = createAuthenticationHook({
      issuer,
      getTrustedKeys: async () => { if (failure === 'keys') throw new Error('private-network-detail'); return []; },
      verify: () => { throw new Error('private-signature-detail'); }
    });
    await authenticate(req, res);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
    assert.equal(req.verifiedIdentity, undefined);
  }
});
