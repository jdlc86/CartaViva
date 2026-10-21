import { randomBytes, randomUUID } from 'node:crypto';
import { normalizeCustomerRegistration } from './customer-profile.mjs';

// Cryptographically random public identifier. Uniqueness must ALSO be enforced by a DB UNIQUE constraint.
// Public IDs are labels, never login secrets or authorization credentials.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXY';
const RADIX = ALPHABET.length;
const LIMIT = Math.floor(256 / RADIX) * RADIX;

export function generateCustomerPublicId(random = randomBytes) {
  if (typeof random !== 'function') throw new Error('invalid_random_source');
  let suffix = '';
  let attempts = 0;
  while (suffix.length < 12) {
    if (++attempts > 100) throw new Error('customer_id_random_source_failed');
    const bytes = random(24);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 24) throw new Error('invalid_random_bytes');
    for (const byte of bytes) {
      if (byte < LIMIT) suffix += ALPHABET[byte % RADIX];
      if (suffix.length === 12) break;
    }
  }
  return 'SB-' + suffix;
}

export function prepareCustomerRegistration(input, { uuid = randomUUID, random = randomBytes } = {}) {
  const profile = normalizeCustomerRegistration(input);
  if (profile.error) return profile;
  if (typeof uuid !== 'function') throw new Error('invalid_uuid_source');
  const internalId = uuid();
  if (typeof internalId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(internalId)) {
    throw new Error('invalid_generated_uuid');
  }
  return { internalId, publicId: generateCustomerPublicId(random), ...profile };
}
