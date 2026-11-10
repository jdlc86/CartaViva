import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStaffInvitationEnqueueCandidate,
  STAFF_INVITATION_ENQUEUE_SQL,
} from '../apps/api/src/staff-invitation-enqueue-candidate.mjs';

const enrollmentId = 'a0000000-0000-4000-8000-000000000001';
const jobId = 'b0000000-0000-4000-8000-000000000002';
const actorId = 'a0000000-0000-4000-8000-000000000003';
const eventId = 'b0000000-0000-4000-8000-000000000004';
const hash = 'a'.repeat(64);
const capability = Object.freeze({
  keyId: 'enqueue_key_001', databaseRole: 'staff_enqueue_ci', actorId,
  action: 'invite', enrollmentId, subjectUserId: null, requestedRole: 'waiter',
  inviteeEmailHashHex: 'b'.repeat(64), inviteTokenHashHex: hash,
  credentialEvidenceHashHex: null, reason: null,
  givenName: 'Julia', familyName: 'García López',
  correlationId: 'enqueue_00000001', issuedAtMs: 1000, expiresAtMs: 16000,
  signatureHex: 'c'.repeat(64),
});

function row(overrides = {}) {
  return {
    result_enrollment_id: enrollmentId, result_subject_user_id: null,
    result_requested_role: 'waiter', previous_state: null,
    current_state: 'invited', repeated: false, result_invite_version: 1,
    event_id: eventId, outbox_job_id: jobId, outbox_enqueued: true,
    result_given_name: 'Julia', result_family_name: 'García López',
    result_employee_code: '027', result_operational_display_id: 'JG-027',
    outbox_cancelled_count: 0, ...overrides,
  };
}

function harness({resultRow = row(), failure = null} = {}) {
  const calls = [];
  const coordinator = createStaffInvitationEnqueueCandidate({
    query: async (sql, parameters) => {
      calls.push({sql, parameters});
      if (failure) throw failure;
      return {rows: resultRow === null ? [] : [resultRow]};
    },
  });
  return {coordinator, calls};
}

test('fresh invitation uses one integrated SQL statement and exposes its durable job', async () => {
  const candidate = harness();
  const result = await candidate.coordinator.transitionAndEnqueue(capability);
  assert.deepEqual(result, {
    transition: {
      enrollmentId, subjectUserId: null, requestedRole: 'waiter',
      previousState: null, currentState: 'invited', repeated: false,
      inviteVersion: 1, eventId, givenName: 'Julia', familyName: 'García López',
      employeeCode: '027', operationalDisplayId: 'JG-027',
    },
    jobId, enqueued: true, repeated: false, cancelledCount: 0,
  });
  assert.equal(candidate.calls.length, 1);
  assert.equal(candidate.calls[0].sql, STAFF_INVITATION_ENQUEUE_SQL);
  assert.deepEqual(candidate.calls[0].parameters, [
    capability.keyId, capability.databaseRole, actorId, 'invite', enrollmentId,
    null, 'waiter', capability.inviteeEmailHashHex, hash, null, null,
    capability.correlationId, 1000, 16000, 'Julia', 'García López', capability.signatureHex,
  ]);
});

test('replay returns the original job and cannot claim a new enqueue', async () => {
  const candidate = harness({resultRow: row({repeated: true, outbox_enqueued: false})});
  const result = await candidate.coordinator.transitionAndEnqueue(capability);
  assert.equal(result.jobId, jobId);
  assert.equal(result.enqueued, false);
  assert.equal(result.repeated, true);
  assert.equal(result.cancelledCount, 0);
  assert.equal(candidate.calls.length, 1);
});

test('resend accepts an atomic stale-job cancellation count', async () => {
  const resend = {...capability, action: 'resend', requestedRole: null,
    inviteeEmailHashHex: null, givenName: null, familyName: null,
    correlationId: 'resend_00000001'};
  const candidate = harness({resultRow: row({
    previous_state: 'invited', result_invite_version: 2,
    outbox_cancelled_count: 1,
  })});
  const result = await candidate.coordinator.transitionAndEnqueue(resend);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.transition.inviteVersion, 2);
});

test('malformed or contradictory SQL output fails closed', async () => {
  for (const resultRow of [
    null,
    row({outbox_job_id: 'bad'}),
    row({outbox_enqueued: false}),
    row({outbox_cancelled_count: -1}),
    row({outbox_cancelled_count: 1}),
    row({repeated: true, outbox_enqueued: true}),
  ]) {
    await assert.rejects(harness({resultRow}).coordinator.transitionAndEnqueue(capability),
      /invalid_staff_(?:lifecycle|enqueue)_sql_result/);
  }
});

test('query failure propagates without a second SQL attempt', async () => {
  const failure = Error('database_failure');
  const candidate = harness({failure});
  await assert.rejects(candidate.coordinator.transitionAndEnqueue(capability), failure);
  assert.equal(candidate.calls.length, 1);
});

test('invalid action, hash and uuid are rejected before SQL', async () => {
  const candidate = harness();
  for (const input of [
    {...capability, action: 'revoke'},
    {...capability, inviteTokenHashHex: 'secret'},
    {...capability, enrollmentId: 'bad'},
  ]) await assert.rejects(candidate.coordinator.transitionAndEnqueue(input),
    /invalid_staff_enqueue_input/);
  assert.deepEqual(candidate.calls, []);
});

test('adapter targets only the integrated HMAC/outbox routine', () => {
  assert.match(STAFF_INVITATION_ENQUEUE_SQL,
    /transition_staff_lifecycle_with_outbox_candidate/);
  assert.doesNotMatch(STAFF_INVITATION_ENQUEUE_SQL, /\bINSERT\b|ON CONFLICT/i);
  assert.doesNotMatch(STAFF_INVITATION_ENQUEUE_SQL, /token_plaintext|secret_material/i);
  assert.throws(() => createStaffInvitationEnqueueCandidate(),
    /invalid_staff_enqueue_config/);
});
