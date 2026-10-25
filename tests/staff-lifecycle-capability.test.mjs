import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {
  createStaffInviteeEmailHasher,
  createStaffLifecycleCapabilityIssuer,
  hashStaffInvitationToken,
  STAFF_LIFECYCLE_CAPABILITY_AUDIENCE,
} from '../apps/api/src/staff-lifecycle-capability.mjs';

const actorId = '10000000-0000-4000-8000-000000000001';
const enrollmentId = '20000000-0000-4000-8000-000000000002';
const secret = Buffer.alloc(32, 7);

function invitation(overrides = {}) {
  return {
    actorId,
    action: 'invite',
    enrollmentId,
    subjectUserId: null,
    requestedRole: 'waiter',
    inviteeEmailHashHex: '1'.repeat(64),
    inviteTokenHashHex: '2'.repeat(64),
    credentialEvidenceHashHex: null,
    reason: null,
    correlationId: 'invite_staff_001',
    ...overrides,
  };
}

test('staff lifecycle issuer signs every authority and target field canonically', () => {
  const issue = createStaffLifecycleCapabilityIssuer({
    keyId: 'staff_key_001', secret, databaseRole: 'sabora_staff_lifecycle_ci',
    ttlMs: 10_000, clock: () => 1_700_000_000_000,
  });
  const capability = issue(invitation());
  const message = [
    STAFF_LIFECYCLE_CAPABILITY_AUDIENCE, 'staff_key_001',
    'sabora_staff_lifecycle_ci', actorId, 'invite', enrollmentId, '-', 'waiter',
    '1'.repeat(64), '2'.repeat(64), '-', '-', 'invite_staff_001',
    '1700000000000', '1700000010000',
  ].join('\n');
  assert.equal(capability.signatureHex,
    createHmac('sha256', secret).update(message, 'utf8').digest('hex'));
  assert.ok(Object.isFrozen(capability));
});
test('staff lifecycle issuer rejects ambiguous action shapes and unsafe configuration', () => {
  assert.throws(() => createStaffLifecycleCapabilityIssuer({
    keyId: 'short', secret, databaseRole: 'safe_role',
  }), /invalid_staff_lifecycle_capability_config/);
  const issue = createStaffLifecycleCapabilityIssuer({
    keyId: 'staff_key_001', secret, databaseRole: 'safe_role', clock: () => 5,
  });
  for (const input of [
    invitation({requestedRole: 'root'}),
    invitation({subjectUserId: actorId}),
    invitation({reason: 'unexpected'}),
    invitation({inviteTokenHashHex: null}),
    {...invitation(), actorId: 'not-a-uuid'},
    Object.assign(Object.create({actorId}), invitation()),
  ]) assert.throws(() => issue(input), /invalid_staff_lifecycle_capability_input/);
});

test('email and invitation token hashes are normalized, deterministic and secret-safe', () => {
  const hashEmail = createStaffInviteeEmailHasher({secret});
  assert.equal(hashEmail(' Person@Example.COM '), hashEmail('person@example.com'));
  assert.notEqual(hashEmail('person@example.com'), hashEmail('other@example.com'));
  assert.equal(hashStaffInvitationToken('a'.repeat(48)), hashStaffInvitationToken('a'.repeat(48)));
  assert.notEqual(hashStaffInvitationToken('a'.repeat(48)), hashStaffInvitationToken('b'.repeat(48)));
  assert.throws(() => hashEmail('invalid'), /invalid_staff_invitee_email/);
  assert.throws(() => hashStaffInvitationToken('short'), /invalid_staff_invitation_token/);
});
