import {createHash, createHmac} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const HEX_32 = /^[0-9a-f]{64}$/;
const ACTIONS = new Set(['invite', 'accept', 'register', 'activate', 'resend', 'suspend', 'revoke']);
const STAFF_ROLES = new Set(['admin', 'waiter', 'kitchen']);
const AUDIENCE = 'sabora.staff-identity.v1';
const MAX_TTL_MS = 30_000;

function exactDataRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length) return false;
  const allowed = new Set(keys);
  return ownKeys.every((key) => {
    if (typeof key !== 'string' || !allowed.has(key) ||
        !Object.prototype.propertyIsEnumerable.call(value, key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
}

function nullable(value, predicate) {
  return value === null || predicate(value);
}

function validShape(input) {
  const base = UUID.test(input.actorId) && UUID.test(input.enrollmentId) &&
    ACTIONS.has(input.action) && CORRELATION.test(input.correlationId) &&
    nullable(input.subjectUserId, (value) => UUID.test(value)) &&
    nullable(input.requestedRole, (value) => STAFF_ROLES.has(value)) &&
    nullable(input.inviteeEmailHashHex, (value) => HEX_32.test(value)) &&
    nullable(input.inviteTokenHashHex, (value) => HEX_32.test(value)) &&
    nullable(input.credentialEvidenceHashHex, (value) => HEX_32.test(value)) &&
    nullable(input.givenName, (value) => validStaffName(value, 80)) &&
    nullable(input.familyName, (value) => validStaffName(value, 160)) &&
    nullable(input.reason, (value) => typeof value === 'string' &&
      value === value.trim() && value.length >= 1 && value.length <= 500);
  if (!base) return false;
  if (input.action === 'invite') return input.subjectUserId === null &&
    STAFF_ROLES.has(input.requestedRole) && input.inviteeEmailHashHex !== null &&
    input.inviteTokenHashHex !== null && input.credentialEvidenceHashHex === null &&
    input.reason === null && input.givenName !== null && input.familyName !== null;
  if (input.action === 'accept') return input.subjectUserId?.toLowerCase() === input.actorId.toLowerCase() &&
    input.requestedRole === null && input.inviteeEmailHashHex === null &&
    input.inviteTokenHashHex !== null && input.credentialEvidenceHashHex === null &&
    input.reason === null && input.givenName === null && input.familyName === null;
  if (input.action === 'register') return input.subjectUserId?.toLowerCase() === input.actorId.toLowerCase() &&
    input.requestedRole === null && input.inviteeEmailHashHex === null &&
    input.inviteTokenHashHex === null && input.credentialEvidenceHashHex !== null &&
    input.reason === null && input.givenName === null && input.familyName === null;
  if (input.action === 'activate') return input.subjectUserId !== null &&
    input.requestedRole === null && input.inviteeEmailHashHex === null &&
    input.inviteTokenHashHex === null && input.credentialEvidenceHashHex === null &&
    input.reason === null && input.givenName === null && input.familyName === null;
  if (input.action === 'resend') return input.subjectUserId === null &&
    input.requestedRole === null && input.inviteeEmailHashHex === null &&
    input.inviteTokenHashHex !== null && input.credentialEvidenceHashHex === null &&
    input.reason === null && input.givenName === null && input.familyName === null;
  return input.requestedRole === null && input.inviteeEmailHashHex === null &&
    input.inviteTokenHashHex === null && input.credentialEvidenceHashHex === null &&
    input.reason !== null && input.givenName === null && input.familyName === null;
}

function validStaffName(value, maxLength) {
  return typeof value === 'string' && value === value.trim() &&
    value.length >= 1 && value.length <= maxLength && !/[\p{Cc}\p{Cf}]/u.test(value);
}

function fieldHash(value) {
  return value === null ? '-' : createHash('sha256').update(value, 'utf8').digest('hex');
}

function reasonHash(reason) {
  return reason === null ? '-' : createHash('sha256').update(reason, 'utf8').digest('hex');
}

function signingInput(input) {
  return [
    AUDIENCE,
    input.keyId,
    input.databaseRole,
    input.actorId.toLowerCase(),
    input.action,
    input.enrollmentId.toLowerCase(),
    input.subjectUserId?.toLowerCase() ?? '-',
    input.requestedRole ?? '-',
    input.inviteeEmailHashHex ?? '-',
    input.inviteTokenHashHex ?? '-',
    input.credentialEvidenceHashHex ?? '-',
    reasonHash(input.reason),
    fieldHash(input.givenName),
    fieldHash(input.familyName),
    input.correlationId,
    String(input.issuedAtMs),
    String(input.expiresAtMs),
  ].join('\n');
}

export function createStaffLifecycleCapabilityIssuer({
  keyId,
  secret,
  databaseRole,
  ttlMs = 15_000,
  clock = Date.now,
} = {}) {
  if (!KEY_ID.test(keyId) || !ROLE_NAME.test(databaseRole) ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS ||
      typeof clock !== 'function' || !(secret instanceof Uint8Array) ||
      secret.byteLength < 32 || secret.byteLength > 64) {
    throw Error('invalid_staff_lifecycle_capability_config');
  }
  const secretSnapshot = Buffer.from(secret);
  return function issueStaffLifecycleCapability(input) {
    const keys = [
      'actorId', 'action', 'enrollmentId', 'subjectUserId', 'requestedRole',
      'inviteeEmailHashHex', 'inviteTokenHashHex', 'credentialEvidenceHashHex',
      'reason', 'givenName', 'familyName', 'correlationId',
    ];
    if (!exactDataRecord(input, keys) || !validShape(input)) {
      throw Error('invalid_staff_lifecycle_capability_input');
    }
    const issuedAtMs = clock();
    if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < 0 ||
        !Number.isSafeInteger(issuedAtMs + ttlMs)) {
      throw Error('invalid_staff_lifecycle_capability_clock');
    }
    const capability = {
      keyId,
      databaseRole,
      actorId: input.actorId.toLowerCase(),
      action: input.action,
      enrollmentId: input.enrollmentId.toLowerCase(),
      subjectUserId: input.subjectUserId?.toLowerCase() ?? null,
      requestedRole: input.requestedRole,
      inviteeEmailHashHex: input.inviteeEmailHashHex,
      inviteTokenHashHex: input.inviteTokenHashHex,
      credentialEvidenceHashHex: input.credentialEvidenceHashHex,
      reason: input.reason,
      givenName: input.givenName,
      familyName: input.familyName,
      correlationId: input.correlationId,
      issuedAtMs,
      expiresAtMs: issuedAtMs + ttlMs,
    };
    const signatureHex = createHmac('sha256', secretSnapshot)
      .update(signingInput(capability), 'utf8')
      .digest('hex');
    return Object.freeze({...capability, signatureHex});
  };
}

export function normalizeStaffName(value, maxLength) {
  if (typeof value !== 'string') throw Error('invalid_staff_name');
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!validStaffName(normalized, maxLength)) throw Error('invalid_staff_name');
  return normalized;
}

export function createStaffInviteeEmailHasher({secret} = {}) {
  if (!(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 64) {
    throw Error('invalid_staff_invitee_email_hash_config');
  }
  const snapshot = Buffer.from(secret);
  return function hashInviteeEmail(email) {
    if (typeof email !== 'string') throw Error('invalid_staff_invitee_email');
    const normalized = email.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw Error('invalid_staff_invitee_email');
    }
    return createHmac('sha256', snapshot).update(normalized, 'utf8').digest('hex');
  };
}

export function hashStaffInvitationToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw Error('invalid_staff_invitation_token');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export const STAFF_LIFECYCLE_CAPABILITY_AUDIENCE = AUDIENCE;
export const STAFF_LIFECYCLE_CAPABILITY_MAX_TTL_MS = MAX_TTL_MS;
