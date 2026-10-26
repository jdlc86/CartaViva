import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {
  createOrderOperationReadCapabilityIssuer,
  ORDER_OPERATION_READ_CAPABILITY_AUDIENCE,
  ORDER_OPERATION_READ_CAPABILITY_MAX_TTL_MS,
  orderOperationBoardScope,
  orderOperationHistoryScope,
} from '../apps/api/src/order-operation-read-capability.mjs';

const actorId = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000002';
const secret = Buffer.from('22'.repeat(32), 'hex');

test('read issuer binds actor, durable role, operation and exact board scope', () => {
  const issue = createOrderOperationReadCapabilityIssuer({
    keyId: 'ci_read_key_001', secret, databaseRole: 'sabora_operations',
    ttlMs: 12_000, clock: () => 1_800_000_000_000,
  });
  const input = {
    actorId, role: 'kitchen', operation: 'board', status: 'ready', limit: 25,
    cursor: {
      confirmedAt: '2026-10-26T10:20:30.123Z', orderId, lineNumber: 3,
    },
  };
  const capability = issue(input);
  const scope = 'status=ready;after_ms=1793010030123;after_order=' + orderId +
    ';after_line=3;limit=25';
  const message = [
    ORDER_OPERATION_READ_CAPABILITY_AUDIENCE,
    'ci_read_key_001', 'sabora_operations', actorId, 'kitchen', 'board', scope,
    '1800000000000', '1800000012000',
  ].join('\n');
  assert.deepEqual(capability, {
    keyId: 'ci_read_key_001', databaseRole: 'sabora_operations', actorId,
    staffRole: 'kitchen', operation: 'board', scope,
    issuedAtMs: 1_800_000_000_000, expiresAtMs: 1_800_000_012_000,
    signatureHex: createHmac('sha256', secret).update(message, 'utf8').digest('hex'),
  });
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(ORDER_OPERATION_READ_CAPABILITY_MAX_TTL_MS, 30_000);
});

test('history and board scopes are canonical and operation-specific', () => {
  const issue = createOrderOperationReadCapabilityIssuer({
    keyId: 'ci_read_key_002', secret, databaseRole: 'sabora_operations',
    clock: () => 2_000,
  });
  const board = issue({
    actorId, role: 'waiter', operation: 'board', status: null, limit: 100, cursor: null,
  });
  const history = issue({
    actorId, role: 'waiter', operation: 'history', orderId, limit: 100,
  });
  assert.equal(board.scope,
    'status=*;after_ms=*;after_order=*;after_line=*;limit=100');
  assert.equal(history.scope, `order=${orderId};limit=100`);
  assert.notEqual(board.signatureHex, history.signatureHex);
  assert.equal(orderOperationBoardScope({
    role: 'waiter', status: 'ready', limit: 10, cursor: null,
  }), 'status=ready;after_ms=*;after_order=*;after_line=*;limit=10');
  assert.equal(orderOperationHistoryScope({role: 'admin', orderId, limit: 1}),
    `order=${orderId};limit=1`);
});

test('read issuer rejects widened roles, filters, cursors, TTL and ambiguous records', () => {
  for (const options of [
    {},
    {keyId: 'short', secret, databaseRole: 'sabora_operations'},
    {keyId: 'ci_read_key_001', secret: Buffer.alloc(31), databaseRole: 'sabora_operations'},
    {keyId: 'ci_read_key_001', secret, databaseRole: 'Bad-Role'},
    {keyId: 'ci_read_key_001', secret, databaseRole: 'sabora_operations', ttlMs: 30_001},
  ]) {
    assert.throws(() => createOrderOperationReadCapabilityIssuer(options),
      /invalid_order_operation_read_capability_config/);
  }
  const issue = createOrderOperationReadCapabilityIssuer({
    keyId: 'ci_read_key_001', secret, databaseRole: 'sabora_operations', clock: () => 2_000,
  });
  for (const invalid of [
    {actorId, role: 'waiter', operation: 'board', status: 'confirmed', limit: 10, cursor: null},
    {actorId, role: 'kitchen', operation: 'board', status: null, limit: 0, cursor: null},
    {actorId, role: 'kitchen', operation: 'board', status: null, limit: 10,
      cursor: {confirmedAt: '2026-10-26', orderId, lineNumber: 1}},
    {actorId, role: 'kitchen', operation: 'history', orderId, limit: 10, extra: true},
    Object.assign(Object.create({actorId}), {
      role: 'kitchen', operation: 'history', orderId, limit: 10,
    }),
  ]) {
    assert.throws(() => issue(invalid), /invalid_order_operation_read_capability_input/);
  }
});
