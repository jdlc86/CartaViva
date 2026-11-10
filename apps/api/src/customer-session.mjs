import { createHash, randomBytes } from 'node:crypto';

// Server-only bearer secret. Never derive it from the public customer ID.
export function issueCustomerSession({ random = randomBytes, now = () => new Date(), lifetimeSeconds = 60 * 60 * 24 * 30 } = {}) {
  if (typeof random !== 'function' || typeof now !== 'function' ||
      !Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 60 || lifetimeSeconds > 60 * 60 * 24 * 90) {
    throw Error('invalid_session_configuration');
  }
  const secret = random(32);
  if (!Buffer.isBuffer(secret) || secret.length !== 32) throw Error('invalid_session_entropy');
  const createdAt = now();
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) throw Error('invalid_session_clock');
  const expiresAt = new Date(createdAt.getTime() + lifetimeSeconds * 1000);
  return {
    token: secret.toString('base64url'),
    tokenHash: createHash('sha256').update(secret).digest(),
    createdAt,
    expiresAt
  };
}

export function hashCustomerSessionToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const bytes = Buffer.from(token,'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== token) return null;
  return createHash('sha256').update(bytes).digest();
}
