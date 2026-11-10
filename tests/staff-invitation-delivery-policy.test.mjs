import test from 'node:test';
import assert from 'node:assert/strict';
import {decideStaffInvitationDelivery} from '../apps/api/src/staff-invitation-delivery-policy.mjs';

const id = '30000000-0000-4000-8000-000000000003';
const hash = 'a'.repeat(64);
const job = {enrollmentId: id, inviteVersion: 1, inviteTokenHashHex: hash};
const enrollment = {id, inviteVersion: 1, inviteTokenHashHex: hash, state: 'invited'};

test('current invited token can be selected for delivery', () => {
  assert.deepEqual(decideStaffInvitationDelivery({job, enrollment}),
    {deliver: true, reason: 'current_invitation'});
});
test('revoked invitation is never eligible for delivery', () => {
  assert.deepEqual(decideStaffInvitationDelivery({job, enrollment: {...enrollment, state: 'revoked'}}),
    {deliver: false, reason: 'revoked'});
});
test('resend rotates version and token: old jobs cannot deliver', () => {
  assert.deepEqual(decideStaffInvitationDelivery({job, enrollment: {...enrollment, inviteVersion: 2}}),
    {deliver: false, reason: 'superseded'});
  assert.deepEqual(decideStaffInvitationDelivery({job, enrollment: {...enrollment, inviteTokenHashHex: 'b'.repeat(64)}}),
    {deliver: false, reason: 'superseded'});
});
test('accepted, registered and active invitations cannot be redelivered', () => {
  for (const state of ['accepted', 'registered', 'active', 'suspended']) {
    assert.deepEqual(decideStaffInvitationDelivery({job, enrollment: {...enrollment, state}}),
      {deliver: false, reason: 'already_accepted'});
  }
});
test('mismatched identity or invalid state fails closed', () => {
  assert.throws(() => decideStaffInvitationDelivery({
    job: {...job, enrollmentId: '40000000-0000-4000-8000-000000000004'}, enrollment,
  }), /staff_invitation_delivery_enrollment_mismatch/);
  assert.throws(() => decideStaffInvitationDelivery({
    job, enrollment: {...enrollment, state: 'unknown'},
  }), /invalid_staff_invitation_delivery_state/);
});
