import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStaffLifecycleCoordinator,
  STAFF_INVITATION_DELIVERY_TOKEN,
} from '../apps/api/src/staff-lifecycle-coordinator.mjs';

const adminId = '10000000-0000-4000-8000-000000000001';
const inviteeId = '20000000-0000-4000-8000-000000000002';
const enrollmentId = '30000000-0000-4000-8000-000000000003';
const token = 'T'.repeat(48);

function harness() {
  const capabilities = [];
  const calls = [];
  const coordinator = createStaffLifecycleCoordinator({
    withTransaction: async (callback) => callback(async () => ({rows: []})),
    repository: {async transition(query, capability) {
      calls.push({query, capability});
      return Object.freeze({
        enrollmentId: capability.enrollmentId,
        subjectUserId: capability.subjectUserId,
        requestedRole: capability.requestedRole ?? 'waiter',
        previousState: null,
        currentState: capability.action === 'invite' ? 'invited' : 'registered',
        repeated: false, inviteVersion: 1,
        eventId: '40000000-0000-4000-8000-000000000004',
      });
    }},
    issueCapability(value) { capabilities.push(value); return {...value,
      keyId: 'staff_key_001', databaseRole: 'staff_lifecycle_ci',
      issuedAtMs: 1, expiresAtMs: 2, signatureHex: 'a'.repeat(64)}; },
    issueInvitationToken: () => token,
    hashInviteeEmail: () => 'b'.repeat(64),
    verifyCredentialRegistration: async () => Buffer.alloc(32, 3),
    uuid: () => enrollmentId,
  });
  return {coordinator, capabilities, calls};
}

test('admin invitation derives actor from verified context and hides delivery secret from JSON', async () => {
  const {coordinator, capabilities} = harness();
  const result = await coordinator.transition({
    verifiedIdentity: {userId: adminId}, verifiedStaff: {userId: adminId, role: 'admin'},
  }, {action: 'invite', email: 'person@example.com', givenName: 'Julia', familyName: 'García López', requestedRole: 'waiter',
    correlationId: 'invite_staff_001'});
  assert.equal(capabilities[0].actorId, adminId);
  assert.equal(capabilities[0].enrollmentId, enrollmentId);
  assert.equal(capabilities[0].inviteeEmailHashHex, 'b'.repeat(64));
  assert.equal(result[STAFF_INVITATION_DELIVERY_TOKEN], token);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.deepEqual(Object.keys(result).includes('invitationToken'), false);
});
test('invitee acceptance and registration bind only the verified JWT subject', async () => {
  const {coordinator, capabilities} = harness();
  const context = {verifiedIdentity: {userId: inviteeId}};
  await coordinator.transition(context, {action: 'accept', enrollmentId,
    inviteToken: token, correlationId: 'accept_staff_001'});
  await coordinator.transition(context, {action: 'register', enrollmentId,
    credentialRegistration: 'e'.repeat(64), correlationId: 'register_staff_001'});
  assert.equal(capabilities[0].actorId, inviteeId);
  assert.equal(capabilities[0].subjectUserId, inviteeId);
  assert.equal(capabilities[1].credentialEvidenceHashHex, '03'.repeat(32));
});

test('forged actor fields, ROOT and unverified admin requests never open a transaction', async () => {
  const {coordinator, calls} = harness();
  for (const [context, input] of [
    [{verifiedIdentity: {userId: adminId}, verifiedStaff: {userId: adminId, role: 'root'}},
      {action: 'invite', email: 'person@example.com', requestedRole: 'waiter',
        givenName: 'Julia', familyName: 'García López',
        correlationId: 'invite_staff_002'}],
    [{verifiedIdentity: {userId: adminId}},
      {action: 'revoke', enrollmentId, subjectUserId: null, reason: 'Baja',
        correlationId: 'revoke_staff_002'}],
    [{verifiedIdentity: {userId: inviteeId}},
      {action: 'accept', enrollmentId, inviteToken: token,
        correlationId: 'accept_staff_002', actorId: adminId}],
  ]) await assert.rejects(coordinator.transition(context, input),
    /staff_lifecycle_admin_forbidden|invalid_staff_lifecycle_request/);
  assert.equal(calls.length, 0);
});

test('accessor-backed action is rejected without invoking the getter', async () => {
  const {coordinator, calls} = harness();
  let accessed = false;
  const input = {};
  Object.defineProperty(input, 'action', {enumerable: true, get() {
    accessed = true;
    throw Error('getter_executed');
  }});
  await assert.rejects(coordinator.transition({verifiedIdentity: {userId: inviteeId}}, input),
    /invalid_staff_lifecycle_request/);
  assert.equal(accessed, false);
  assert.equal(calls.length, 0);
});

test('idempotent replay never delivers a newly generated but invalid invitation token', async () => {
  let tokenGenerations = 0;
  const coordinator = createStaffLifecycleCoordinator({
    withTransaction: async callback => callback(async () => ({rows: []})),
    repository: {async transition(_query, capability) {
      return Object.freeze({
        enrollmentId: capability.enrollmentId,
        currentState: 'invited',
        repeated: true,
        inviteVersion: 1,
      });
    }},
    issueCapability: value => value,
    issueInvitationToken: () => {
      tokenGenerations++;
      return token;
    },
    hashInviteeEmail: () => 'b'.repeat(64),
    verifyCredentialRegistration: async () => Buffer.alloc(32),
    uuid: () => enrollmentId,
  });
  const result = await coordinator.transition({
    verifiedIdentity: {userId: adminId},
    verifiedStaff: {userId: adminId, role: 'admin'},
  }, {action: 'invite', email: 'person@example.com', givenName: 'Julia', familyName: 'García López', requestedRole: 'waiter',
    correlationId: 'invite_staff_replay_001'});
  assert.equal(tokenGenerations, 1);
  assert.equal(result.repeated, true);
  assert.equal(result[STAFF_INVITATION_DELIVERY_TOKEN], undefined);
});
