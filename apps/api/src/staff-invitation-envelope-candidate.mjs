// Candidate-only authenticated encryption for ephemeral invitation delivery.
// Key management, operational persistence and worker grants remain unapproved.
import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9_-]{8,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,512}$/;
const ALGORITHM = 'aes-256-gcm';
const CONTEXT = 'sabora.staff-invitation-delivery.v1';

function context({enrollmentId, inviteVersion, tokenHashHex}) {
  if (!UUID.test(enrollmentId ?? '') ||
      !Number.isSafeInteger(inviteVersion) || inviteVersion < 1 ||
      !HASH.test(tokenHashHex ?? '')) throw Error('invalid_staff_delivery_envelope_context');
  return Buffer.from([CONTEXT,enrollmentId.toLowerCase(),String(inviteVersion),tokenHashHex].join('\n'),'utf8');
}
function keyBytes(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('invalid_staff_delivery_encryption_key');
  return key;
}
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every(k => Object.hasOwn(value,k) && Object.getOwnPropertyDescriptor(value,k)?.enumerable &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'));
}
function decode(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('invalid_staff_delivery_envelope');
  const bytes = Buffer.from(value,'base64url');
  if (bytes.length !== size || bytes.toString('base64url') !== value) throw Error('invalid_staff_delivery_envelope');
  return bytes;
}
export function sealStaffInvitationToken({token, enrollmentId, inviteVersion, tokenHashHex, keyId, key, nonce = randomBytes(12)} = {}) {
  if (typeof token !== 'string' || !TOKEN.test(token) || !KEY_ID.test(keyId ?? '') ||
      !Buffer.isBuffer(nonce) || nonce.length !== 12) throw Error('invalid_staff_delivery_encryption_input');
  const aad=context({enrollmentId,inviteVersion,tokenHashHex});
  const digest=createHash('sha256').update(token,'utf8').digest();
  if (!timingSafeEqual(digest,Buffer.from(tokenHashHex,'hex'))) throw Error('staff_delivery_token_hash_mismatch');
  const cipher=createCipheriv(ALGORITHM,keyBytes(key),nonce);
  cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return Object.freeze({
    version:1, keyId, nonce:nonce.toString('base64url'),
    ciphertext:ciphertext.toString('base64url'), tag:cipher.getAuthTag().toString('base64url'),
  });
}
export function openStaffInvitationToken({envelope,enrollmentId,inviteVersion,tokenHashHex,key} = {}) {
  const aad=context({enrollmentId,inviteVersion,tokenHashHex});
  if (!exact(envelope,['version','keyId','nonce','ciphertext','tag']) ||
      envelope.version !== 1 || !KEY_ID.test(envelope.keyId ?? '') ||
      typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 1024) {
    throw Error('invalid_staff_delivery_envelope');
  }
  const nonce=decode(envelope.nonce,12);
  const tag=decode(envelope.tag,16);
  const ciphertext=decode(envelope.ciphertext,Buffer.from(envelope.ciphertext,'base64url').length);
  try {
    const decipher=createDecipheriv(ALGORITHM,keyBytes(key),nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const token=Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
    if (!TOKEN.test(token) ||
        !timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(tokenHashHex,'hex'))) {
      throw Error('staff_delivery_token_integrity_failure');
    }
    return token;
  } catch {
    throw Error('staff_delivery_decryption_denied');
  }
}
