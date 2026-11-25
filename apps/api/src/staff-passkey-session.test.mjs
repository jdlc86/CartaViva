import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import test from 'node:test';
import Fastify from 'fastify';
import {createStaffPasskeySession} from './staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from './staff-protected-hooks-from-pool.mjs';

const origin = 'https://gestion-sabora.example.test:8443';
const issuer = 'https://project.supabase.co/auth/v1';
const auth = '/api/v1/staff/auth';
const userId = 'a38a0e12-552b-4427-b943-52bbc9d19b9e';
const sessionId = '223bd64c-a282-4f77-81e5-b667f75fb66e';
const challengeId = 'efdc8696-9e80-457d-ac4f-3c5ec20ef0d2';
const features = {tableChange: true, waiterCalls: true, management: true, ownership: false};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...publicKey.export({format: 'jwk'}), alg: 'RS256', use: 'sig', kid: 'fixture'};
const header = encode({alg: 'RS256', typ: 'JWT', kid: jwk.kid});

function assertion({uv = true, clientOrigin = origin} = {}) {
  const authData = Buffer.alloc(37);
  authData[32] = uv ? 5 : 1;
  return {type: 'public-key', id: 'abc', rawId: 'abc', response: {
    clientDataJSON: encode({origin: clientOrigin, type: 'webauthn.get'}),
    authenticatorData: authData.toString('base64url'),
    signature: 'fixture', userHandle: 'fixture'
  }};
}

function fixture(t) {
  let current = 1_800_000_000;
  let method = 'passkey';
  let member = 'active';
  let consumed = false;
  let hasSession = true;
  let attempts = 0;
  let unavailable = false;
  const now = () => current * 1000;
  const token = () => {
    const claims = encode({iss: issuer, aud: 'authenticated', role: 'authenticated',
      sub: userId, is_anonymous: false, session_id: sessionId,
      exp: current + 120, iat: current, amr: [{method, timestamp: current}]});
    const signed = header + '.' + claims;
    return signed + '.' + sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url');
  };
  const provider = {
    options: async () => {
      consumed = false;
      return {challenge_id: challengeId, expires_at: current + 120,
        options: {rpId: new URL(origin).hostname, challenge: 'fixture'}};
    },
    verify: async id => {
      attempts++;
      assert.equal(id, challengeId);
      if (consumed) return null;
      consumed = true;
      return {access_token: token(), refresh_token: 'never-forward-this'};
    },
    user: async () => hasSession ? {id: userId} : null,
    logout: async () => {
      if (unavailable) throw Error('fixture_transport_error');
      hasSession = false;
      return true;
    }
  };
  const app = Fastify();
  t.after(() => app.close());
  const getTrustedKeys = async () => [jwk];
  const staff = createStaffPasskeySession({origin, issuer, now, provider, getTrustedKeys,
    secret: Buffer.alloc(32, 7)});
  const forRoles = createStaffProtectedHooksFromPool({issuer, getTrustedKeys,
    authenticate: staff.authenticate, pool: {query: async (_sql, args) => {
      assert.deepEqual(args, [userId]);
      return {rows: [{role: 'waiter', state: member}]};
    }}
  });
  staff.register(app, {forRoles, features});
  app.post('/api/v1/operations/fixture', {preHandler: forRoles(['waiter'])}, async () => ({ok: true}));
  const request = (path, {method: httpMethod = 'GET', cookie, payload, headers = {}} = {}) =>
    app.inject({method: httpMethod, url: path, payload, headers: {
      host: new URL(origin).host, ...(httpMethod === 'POST' ? {origin} : {}),
      ...(cookie ? {cookie} : {}), ...headers
    }});
  const begin = async () => {
    const challenge = await request(auth + '/options', {method: 'POST'});
    assert.equal(challenge.statusCode, 200);
    assert.equal(challenge.json().options.userVerification, 'required');
    assert.equal(challenge.json().challenge_id, undefined);
    assert.match(challenge.headers['set-cookie'], /Secure; HttpOnly; SameSite=Strict/);
    return challenge.headers['set-cookie'].split(';')[0];
  };
  const complete = (cookie, credential = assertion()) => request(auth + '/verify', {
    method: 'POST', cookie, payload: {credential}
  });
  const login = async () => {
    const result = await complete(await begin());
    assert.equal(result.statusCode, 200, result.body);
    assert.deepEqual(result.json(), {role: 'waiter', sessionId, expiresAt: current + 120, features});
    const cookies = result.headers['set-cookie'];
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], /^__Host-sabora-staff-challenge=;.*Max-Age=0/);
    assert.match(cookies[1], /^__Host-sabora-staff=[^;]+; Path=\/; Max-Age=120; Secure; HttpOnly; SameSite=Strict/);
    assert.ok(!JSON.stringify(cookies).includes('never-forward-this'));
    return cookies[1].split(';')[0];
  };
  return {request, begin, complete, login, token, advance: seconds => {current += seconds;},
    suspend: () => {member = 'suspended';}, revoke: () => {hasSession = false;},
    failLogout: value => {unavailable = value;}, setMethod: value => {method = value;},
    attempts: () => attempts};
}

test('staff passkey session connects auth, current membership and operation on the same session', async t => {
  const app = fixture(t);
  const cookie = await app.login();
  const restored = await app.request(auth + '/session', {cookie});
  assert.equal(restored.json().role, 'waiter');
  assert.equal(restored.headers['cache-control'], 'no-store');
  const path = '/api/v1/operations/fixture';
  const headers = {'x-sabora-staff-session': sessionId};
  assert.equal((await app.request(path, {method: 'POST', cookie, headers})).statusCode, 200);
  assert.equal((await app.request(path, {method: 'POST', cookie})).statusCode, 401);
  assert.equal((await app.request(path, {method: 'POST', cookie,
    headers: {...headers, origin: 'https://wrong.example.test'}})).statusCode, 401);
  assert.equal((await app.request(auth + '/session', {cookie,
    headers: {host: 'client.example.test:8443'}})).statusCode, 401);
  assert.equal((await app.request(auth + '/session',
    {headers: {authorization: 'Bearer ' + app.token()}})).statusCode, 401);
  app.suspend();
  assert.equal((await app.request(path, {method: 'POST', cookie, headers})).statusCode, 403);
  assert.equal((await app.request(auth + '/session', {cookie})).statusCode, 403);
  app.revoke();
  assert.equal((await app.request(auth + '/session', {cookie})).statusCode, 401);
});

test('staff passkey login denies invalid, replayed and expired ceremonies and alternate login methods', async t => {
  const app = fixture(t);
  const challenge = await app.begin();
  assert.equal((await app.complete(challenge, assertion({uv: false}))).statusCode, 401);
  assert.equal((await app.complete(challenge, assertion({clientOrigin: issuer}))).statusCode, 401);
  assert.equal((await app.complete(challenge + 'x')).statusCode, 401);
  assert.equal(app.attempts(), 0);
  assert.equal((await app.complete(challenge)).statusCode, 200);
  assert.equal((await app.complete(challenge)).statusCode, 401);
  for (const method of ['password', 'otp', 'magiclink']) {
    app.setMethod(method);
    const result = await app.complete(await app.begin());
    assert.equal(result.statusCode, 401);
    assert.match(result.headers['set-cookie'], /^__Host-sabora-staff-challenge=;/);
  }
  app.setMethod('passkey');
  const expiring = await app.begin();
  app.advance(120);
  assert.equal((await app.complete(expiring)).statusCode, 401);
  app.suspend();
  assert.equal((await app.complete(await app.begin())).statusCode, 403);
});

test('staff logout revokes only the selected session and expiry ends browser admission', async t => {
  const app = fixture(t);
  const cookie = await app.login();
  const logout = id => app.request(auth + '/logout', {method: 'POST', cookie,
    headers: {'x-sabora-staff-session': id}});
  assert.equal((await logout('other')).statusCode, 409);
  app.failLogout(true);
  assert.equal((await logout(sessionId)).statusCode, 503);
  assert.equal((await app.request(auth + '/session', {cookie})).statusCode, 200);
  app.failLogout(false);
  const result = await logout(sessionId);
  assert.equal(result.statusCode, 204);
  assert.match(result.headers['set-cookie'][0], /^__Host-sabora-staff=;.*Max-Age=0/);
  assert.equal((await app.request(auth + '/session', {cookie})).statusCode, 401);
  const expiring = await app.login();
  app.advance(120);
  assert.equal((await app.request(auth + '/session', {cookie: expiring})).statusCode, 401);
});
