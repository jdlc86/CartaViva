import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffLifecycleHttpHandler, validateStaffLifecycleHttpInput} from '../apps/api/src/staff-lifecycle-http-candidate.mjs';
import {STAFF_INVITATION_DELIVERY_TOKEN} from '../apps/api/src/staff-lifecycle-coordinator.mjs';

const enrollmentId = '30000000-0000-4000-8000-000000000003';
const adminId = '10000000-0000-4000-8000-000000000001';
const identity = {userId: adminId};
const staff = {userId: adminId, role: 'admin'};
function reply() {
  return {status: 200, headers: {}, header(key, value) {this.headers[key] = value; return this;},
    code(value) {this.status = value; return this;},
    send(value) {this.payload = value; return value;}};
}
function invite() {return {action: 'invite', email: 'test@example.com',
  givenName: 'Julia', familyName: 'García López',
  requestedRole: 'waiter', correlationId: 'correlation_001'};}

test('rejects forged actor, unknown fields and malformed correlation before coordinator', async () => {
  let called = 0;
  const handler = createStaffLifecycleHttpHandler({
    coordinator: {async transition() {called++; throw Error('must_not_call');}},
    deliverInvitation: async () => {},
  });
  for (const body of [
    {...invite(), actorId: adminId},
    {...invite(), correlationId: 'bad'},
    {...invite(), requestedRole: 'root'},
    {...invite(), email: 'x'.repeat(255)},
    {action: 'revoke', enrollmentId, subjectUserId: null, reason: '', correlationId: 'correlation_001'},
  ]) {
    const result = reply();
    await handler({body, verifiedIdentity: identity, verifiedStaff: staff}, result);
    assert.equal(result.status, 400);
  }
  assert.equal(called, 0);
});

test('accept and register cannot provide actor identity and do not require staff role', () => {
  const accept = validateStaffLifecycleHttpInput({action: 'accept', enrollmentId,
    inviteToken: 'T'.repeat(48), correlationId: 'correlation_001'});
  assert.equal(accept.adminRequired, false);
  assert.throws(() => validateStaffLifecycleHttpInput({action: 'accept', enrollmentId,
    inviteToken: 'T'.repeat(48), correlationId: 'correlation_001', actorId: adminId}),
  /invalid_staff_lifecycle_request/);
});

test('admin action requires verified staff before calling coordinator', async () => {
  let called = 0;
  const handler = createStaffLifecycleHttpHandler({
    coordinator: {async transition() {called++;}},
    deliverInvitation: async () => {},
  });
  const response = reply();
  await handler({body: invite(), verifiedIdentity: identity}, response);
  assert.equal(response.status, 403);
  assert.equal(called, 0);
});

test('invitation token is never serialized and delivery failure is not reported as success', async () => {
  const result = {enrollmentId, currentState: 'invited', repeated: false};
  Object.defineProperty(result, STAFF_INVITATION_DELIVERY_TOKEN,
    {value: 'S'.repeat(48), enumerable: false});
  const handler = createStaffLifecycleHttpHandler({
    coordinator: {async transition() {return result;}},
    async deliverInvitation({token}) {assert.equal(token, 'S'.repeat(48)); throw Error('offline');},
  });
  const response = reply();
  await handler({body: invite(), verifiedIdentity: identity, verifiedStaff: staff}, response);
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(response.payload).includes('SSSS'), false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('successful adapter returns public result only, without delivery token', async () => {
  const result = {enrollmentId, currentState: 'invited', repeated: false};
  Object.defineProperty(result, STAFF_INVITATION_DELIVERY_TOKEN,
    {value: 'S'.repeat(48), enumerable: false});
  let deliveries = 0;
  const handler = createStaffLifecycleHttpHandler({
    coordinator: {async transition() {return result;}},
    async deliverInvitation() {deliveries++;},
  });
  const response = reply();
  await handler({body: invite(), verifiedIdentity: identity, verifiedStaff: staff}, response);
  assert.equal(response.status, 201);
  assert.equal(deliveries, 1);
  assert.equal(JSON.stringify(response.payload).includes('SSSS'), false);
});
