import { createPublicKey, verify as verifySignature } from 'node:crypto';

// Offline verifier. Keys must come from the trusted Supabase Auth JWKS endpoint
// through a separately audited, bounded cache; never from JWT header URLs.
const decodeJson = (part) => {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid_token');
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); }
  catch { throw new Error('invalid_token'); }
};

export function verifySupabaseAccessToken(token, { issuer, audience = 'authenticated', keys, now = () => Date.now() } = {}) {
  if (typeof token !== 'string' || token.length > 16384) throw new Error('invalid_token');
  if (typeof issuer !== 'string' || !/^https:\/\/[^/]+\/auth\/v1$/.test(issuer)) throw new Error('invalid_verifier_config');
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('invalid_verifier_config');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('invalid_token');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!header || header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string' || !header.kid) throw new Error('invalid_token');
  const matching = keys.filter(key => key && key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
  if (matching.length !== 1) throw new Error('invalid_token');
  let valid = false;
  try {
    valid = verifySignature('RSA-SHA256', Buffer.from(headerPart + '.' + payloadPart), createPublicKey({ key: matching[0], format: 'jwk' }), Buffer.from(signaturePart, 'base64url'));
  } catch { throw new Error('invalid_token'); }
  if (!valid) throw new Error('invalid_token');
  const seconds = Math.floor(now() / 1000);
  if (!payload || payload.iss !== issuer || payload.aud !== audience ||
      typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub) ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= seconds ||
      !Number.isSafeInteger(payload.iat) || payload.iat > seconds ||
      (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > seconds)) ||
      payload.role !== 'authenticated') throw new Error('invalid_token');
  return Object.freeze({ userId: payload.sub });
}
