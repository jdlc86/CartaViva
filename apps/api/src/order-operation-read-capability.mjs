import {createHmac} from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const STATUSES = new Set(['confirmed', 'preparing', 'ready', 'picked_up']);
const OPERATIONS = new Set(['board', 'history']);
const AUDIENCE = 'sabora.order-operations-read.v1';
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

function normalizedIsoMilliseconds(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value ? Date.parse(value) : null;
}

function assertRoleStatus(role, status) {
  if (!ROLES.has(role) || (status !== null && !STATUSES.has(status)) ||
      (role === 'kitchen' && status === 'picked_up') ||
      (role === 'waiter' && (status === 'confirmed' || status === 'preparing'))) {
    throw Error('invalid_order_operation_read_capability_input');
  }
}

export function orderOperationBoardScope({role, status, limit, cursor}) {
  assertRoleStatus(role, status);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (cursor !== null && (!exactDataRecord(cursor, [
        'confirmedAt', 'orderId', 'lineNumber',
      ]) || !UUID.test(cursor.orderId) || !Number.isSafeInteger(cursor.lineNumber) ||
        cursor.lineNumber < 1 || normalizedIsoMilliseconds(cursor.confirmedAt) === null))) {
    throw Error('invalid_order_operation_read_capability_input');
  }
  const afterMs = cursor === null ? '*' : String(normalizedIsoMilliseconds(cursor.confirmedAt));
  const afterOrder = cursor === null ? '*' : cursor.orderId.toLowerCase();
  const afterLine = cursor === null ? '*' : String(cursor.lineNumber);
  return `status=${status ?? '*'};after_ms=${afterMs};after_order=${afterOrder};after_line=${afterLine};limit=${limit}`;
}

export function orderOperationHistoryScope({role, orderId, limit}) {
  if (!ROLES.has(role) || !UUID.test(orderId) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw Error('invalid_order_operation_read_capability_input');
  }
  return `order=${orderId.toLowerCase()};limit=${limit}`;
}

function signingInput({
  keyId, databaseRole, actorId, staffRole, operation, scope,
  issuedAtMs, expiresAtMs,
}) {
  return [
    AUDIENCE,
    keyId,
    databaseRole,
    actorId.toLowerCase(),
    staffRole,
    operation,
    scope,
    String(issuedAtMs),
    String(expiresAtMs),
  ].join('\n');
}

export function createOrderOperationReadCapabilityIssuer({
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
    throw Error('invalid_order_operation_read_capability_config');
  }
  const secretSnapshot = Buffer.from(secret);

  return function issueReadCapability(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        !OPERATIONS.has(input.operation)) {
      throw Error('invalid_order_operation_read_capability_input');
    }
    let scope;
    if (input.operation === 'board') {
      if (!exactDataRecord(input, [
        'actorId', 'role', 'operation', 'status', 'limit', 'cursor',
      ]) || !UUID.test(input.actorId)) {
        throw Error('invalid_order_operation_read_capability_input');
      }
      scope = orderOperationBoardScope(input);
    } else {
      if (!exactDataRecord(input, [
        'actorId', 'role', 'operation', 'orderId', 'limit',
      ]) || !UUID.test(input.actorId)) {
        throw Error('invalid_order_operation_read_capability_input');
      }
      scope = orderOperationHistoryScope(input);
    }
    const issuedAtMs = clock();
    if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < 0 ||
        !Number.isSafeInteger(issuedAtMs + ttlMs)) {
      throw Error('invalid_order_operation_read_capability_clock');
    }
    const capability = {
      keyId,
      databaseRole,
      actorId: input.actorId.toLowerCase(),
      staffRole: input.role,
      operation: input.operation,
      scope,
      issuedAtMs,
      expiresAtMs: issuedAtMs + ttlMs,
    };
    const signatureHex = createHmac('sha256', secretSnapshot)
      .update(signingInput(capability), 'utf8')
      .digest('hex');
    return Object.freeze({...capability, signatureHex});
  };
}

export const ORDER_OPERATION_READ_CAPABILITY_AUDIENCE = AUDIENCE;
export const ORDER_OPERATION_READ_CAPABILITY_MAX_TTL_MS = MAX_TTL_MS;
