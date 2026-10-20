import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifySupabaseAccessToken } from '../apps/api/src/auth.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const issuer = 'https://example.supabase.co/auth/v1';
const time = 1_800_000_000;
const userId = '11111111-1111-4111-8111-111111111111';
const claims = { iss: issuer, aud: 'authenticated', sub: userId, role: 'authenticated', iat: time - 60, exp: time + 300 };
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const token = (payload = claims, header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' }) => {
  const data = encode(header) + '.' + encode(payload);
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
};
const verify = (jwt, overrides = {}) => verifySupabaseAccessToken(jwt, { issuer, keys: [key], now: () => time * 1000, ...overrides });

test('accepts a correctly signed Supabase access token and returns only verified identity', () => {
  assert.deepEqual(verify(token()), { userId });
});
test('rejects tampering, unknown signing keys and forbidden algorithms', () => {
  const good = token();
  assert.throws(() => verify(good.slice(0, -1) + (good.at(-1) === 'A' ? 'B' : 'A')), /invalid_token/);
  assert.throws(() => verify(good, { keys: [{ ...key, kid: 'other' }] }), /invalid_token/);
  assert.throws(() => verify(token(claims, { alg: 'none', typ: 'JWT', kid: 'test-key' })), /invalid_token/);
  assert.throws(() => verify(token(claims, { alg: 'HS256', typ: 'JWT', kid: 'test-key' })), /invalid_token/);
});
test('rejects wrong issuer, audience, role, expiration, future nbf or iat', () => {
  for (const patch of [
    { iss: 'https://other.supabase.co/auth/v1' },
    { aud: 'anon' },
    { role: 'service_role' },
    { exp: time },
    { nbf: time + 1 },
    { iat: time + 1 },
    { sub: 'not-a-uuid' }
  ]) assert.throws(() => verify(token({ ...claims, ...patch })), /invalid_token/);
});
test('rejects missing verifier configuration and malformed tokens', () => {
  assert.throws(() => verify('not-a-jwt'), /invalid_token/);
  assert.throws(() => verify(token(), { keys: [] }), /invalid_verifier_config/);
  assert.throws(() => verify(token(), { issuer: 'http://unsafe/auth/v1' }), /invalid_verifier_config/);
});
