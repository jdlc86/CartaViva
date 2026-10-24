import {createHmac} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const TARGETS = new Set(['preparing', 'ready', 'picked_up']);
const AUDIENCE = 'sabora.order-line-transition.v1';
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

function signingInput({
  keyId, databaseRole, actorId, lineId, targetStatus, correlationId,
  issuedAtMs, expiresAtMs,
}) {
  return [
    AUDIENCE,
    keyId,
    databaseRole,
    actorId.toLowerCase(),
    lineId.toLowerCase(),
    targetStatus,
    correlationId,
    String(issuedAtMs),
    String(expiresAtMs),
  ].join('\n');
}

export function createOrderOperationCapabilityIssuer({
  keyId,
  secret,
  databaseRole,
  ttlMs = 15_000,
  clock = Date.now,
} = {}) {
  if (!KEY_ID.test(keyId) || !ROLE_NAME.test(databaseRole) ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS ||
      typeof clock !== 'function' ||
      !(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 64) {
    throw Error('invalid_order_operation_capability_config');
  }
  const secretSnapshot = Buffer.from(secret);

  return function issueTransitionCapability(input) {
    if (!exactDataRecord(input, [
      'actorId', 'lineId', 'targetStatus', 'correlationId',
    ]) || !UUID.test(input.actorId) || !UUID.test(input.lineId) ||
        !TARGETS.has(input.targetStatus) || !CORRELATION.test(input.correlationId)) {
      throw Error('invalid_order_operation_capability_input');
    }
    const issuedAtMs = clock();
    if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < 0 ||
        !Number.isSafeInteger(issuedAtMs + ttlMs)) {
      throw Error('invalid_order_operation_capability_clock');
    }
    const capability = {
      keyId,
      databaseRole,
      actorId: input.actorId.toLowerCase(),
      lineId: input.lineId.toLowerCase(),
      targetStatus: input.targetStatus,
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

export const ORDER_OPERATION_CAPABILITY_AUDIENCE = AUDIENCE;
export const ORDER_OPERATION_CAPABILITY_MAX_TTL_MS = MAX_TTL_MS;
