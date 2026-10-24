import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {
  createOrderOperationCapabilityIssuer,
  ORDER_OPERATION_CAPABILITY_AUDIENCE,
  ORDER_OPERATION_CAPABILITY_MAX_TTL_MS,
} from '../apps/api/src/order-operation-capability.mjs';

const actorId = '10000000-0000-4000-8000-000000000001';
const lineId = '20000000-0000-4000-8000-000000000002';
const secret = Buffer.from('11'.repeat(32), 'hex');
const input = Object.freeze({
  actorId, lineId, targetStatus: 'preparing', correlationId: 'capability_nonce_001',
});

test('issuer signs every security-sensitive transition field with a bounded lifetime', () => {
  const issue = createOrderOperationCapabilityIssuer({
    keyId: 'ci_key_001', secret, databaseRole: 'sabora_operations',
    ttlMs: 15_000, clock: () => 1_800_000_000_000,
  });
  const capability = issue(input);
  const message = [
    ORDER_OPERATION_CAPABILITY_AUDIENCE,
    'ci_key_001', 'sabora_operations', actorId, lineId,
    'preparing', 'capability_nonce_001', '1800000000000', '1800000015000',
  ].join('\n');
  assert.deepEqual(capability, {
    keyId: 'ci_key_001', databaseRole: 'sabora_operations', actorId, lineId,
    targetStatus: 'preparing', correlationId: 'capability_nonce_001',
    issuedAtMs: 1_800_000_000_000, expiresAtMs: 1_800_000_015_000,
    signatureHex: createHmac('sha256', secret).update(message, 'utf8').digest('hex'),
  });
  assert.equal(Object.isFrozen(capability), true);
  assert.equal(ORDER_OPERATION_CAPABILITY_MAX_TTL_MS, 30_000);
});

test('issuer snapshots key material and produces operation-specific signatures', () => {
  const mutableSecret = Buffer.from(secret);
  const issue = createOrderOperationCapabilityIssuer({
    keyId: 'ci_key_002', secret: mutableSecret, databaseRole: 'sabora_operations',
    clock: () => 2_000,
  });
  const original = issue(input);
  mutableSecret.fill(0);
  assert.equal(issue(input).signatureHex, original.signatureHex);
  for (const override of [
    {actorId: '90000000-0000-4000-8000-000000000009'},
    {lineId: '80000000-0000-4000-8000-000000000008'},
    {targetStatus: 'ready'},
    {correlationId: 'capability_nonce_002'},
  ]) {
    assert.notEqual(issue({...input, ...override}).signatureHex, original.signatureHex);
  }
});

test('issuer rejects ambiguous inputs, weak keys, unsafe roles and invalid clocks', () => {
  for (const options of [
    {},
    {keyId: 'short', secret, databaseRole: 'sabora_operations'},
    {keyId: 'ci_key_001', secret: Buffer.alloc(31), databaseRole: 'sabora_operations'},
    {keyId: 'ci_key_001', secret, databaseRole: 'Bad-Role'},
    {keyId: 'ci_key_001', secret, databaseRole: 'sabora_operations', ttlMs: 30_001},
  ]) {
    assert.throws(() => createOrderOperationCapabilityIssuer(options),
      /invalid_order_operation_capability_config/);
  }
  const issue = createOrderOperationCapabilityIssuer({
    keyId: 'ci_key_001', secret, databaseRole: 'sabora_operations', clock: () => 1_000,
  });
  for (const invalid of [
    {...input, actorId: 'invalid'},
    {...input, targetStatus: 'picked_up', extra: true},
    Object.assign(Object.create({actorId}), input),
    null,
  ]) {
    assert.throws(() => issue(invalid), /invalid_order_operation_capability_input/);
  }
  const badClock = createOrderOperationCapabilityIssuer({
    keyId: 'ci_key_001', secret, databaseRole: 'sabora_operations', clock: () => 1.5,
  });
  assert.throws(() => badClock(input), /invalid_order_operation_capability_clock/);
});
