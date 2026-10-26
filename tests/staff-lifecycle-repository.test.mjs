import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStaffLifecycleRepository,
  STAFF_LIFECYCLE_SQL,
} from '../apps/api/src/staff-lifecycle-repository.mjs';

const actorId = '10000000-0000-4000-8000-000000000001';
const enrollmentId = '20000000-0000-4000-8000-000000000002';
const originalEnrollmentId = '20000000-0000-4000-8000-000000000099';
const subjectId = '30000000-0000-4000-8000-000000000003';
const eventId = '40000000-0000-4000-8000-000000000004';

function capability(overrides = {}) {
  return {
    keyId: 'staff_key_001', databaseRole: 'staff_lifecycle_ci', actorId,
    action: 'activate', enrollmentId, subjectUserId: subjectId,
    requestedRole: null, inviteeEmailHashHex: null, inviteTokenHashHex: null,
    credentialEvidenceHashHex: null, reason: null,
    correlationId: 'activate_staff_001', issuedAtMs: 1000, expiresAtMs: 2000,
    signatureHex: 'a'.repeat(64), ...overrides,
  };
}

test('staff lifecycle repository calls only the pinned authorized wrapper', async () => {
  const calls = [];
  const repository = createStaffLifecycleRepository();
  const result = await repository.transition(async (sql, values) => {
    calls.push({sql, values});
    return {rows: [{
      result_enrollment_id: enrollmentId, result_subject_user_id: subjectId,
      result_requested_role: 'waiter', previous_state: 'registered',
      current_state: 'active', repeated: false, result_invite_version: 1,
      event_id: eventId,
    }]};
  }, capability());
  assert.equal(calls[0].sql, STAFF_LIFECYCLE_SQL);
  assert.deepEqual(calls[0].values.slice(0, 6), [
    'staff_key_001', 'staff_lifecycle_ci', actorId, 'activate', enrollmentId, subjectId,
  ]);
  assert.deepEqual(result, {
    enrollmentId, subjectUserId: subjectId, requestedRole: 'waiter',
    previousState: 'registered', currentState: 'active', repeated: false,
    inviteVersion: 1, eventId,
  });
});
test('staff lifecycle repository fails closed on malformed capabilities and SQL rows', async () => {
  const repository = createStaffLifecycleRepository();
  let queried = false;
  await assert.rejects(repository.transition(async () => {
    queried = true;
    return {rows: []};
  }, capability({signatureHex: 'invalid'})), /invalid_staff_lifecycle_repository_input/);
  assert.equal(queried, false);
  for (const row of [
    null,
    {result_enrollment_id: enrollmentId, result_subject_user_id: subjectId,
      result_requested_role: 'waiter', previous_state: 'active', current_state: 'active',
      repeated: false, result_invite_version: 1, event_id: eventId},
    {result_enrollment_id: enrollmentId, result_subject_user_id: actorId,
      result_requested_role: 'waiter', previous_state: 'registered', current_state: 'active',
      repeated: false, result_invite_version: 1, event_id: eventId},
  ]) {
    await assert.rejects(repository.transition(async () => ({rows: row ? [row] : []}), capability()),
      /invalid_staff_lifecycle_sql_result/);
  }
});

test('staff lifecycle repository accepts only the durable original enrollment on invite replay', async () => {
  const repository = createStaffLifecycleRepository();
  const invite = capability({
    action: 'invite', enrollmentId, subjectUserId: null, requestedRole: 'waiter',
    inviteeEmailHashHex: 'b'.repeat(64), inviteTokenHashHex: 'c'.repeat(64),
    correlationId: 'invite_staff_001',
  });
  const durableReplay = {
    result_enrollment_id: originalEnrollmentId, result_subject_user_id: null,
    result_requested_role: 'waiter', previous_state: null,
    current_state: 'invited', repeated: true, result_invite_version: 1,
    event_id: eventId,
  };
  assert.equal(
    (await repository.transition(async () => ({rows: [durableReplay]}), invite)).enrollmentId,
    originalEnrollmentId,
  );
  await assert.rejects(
    repository.transition(async () => ({rows: [{...durableReplay, repeated: false}]}), invite),
    /invalid_staff_lifecycle_sql_result/,
  );
  await assert.rejects(
    repository.transition(async () => ({rows: [{
      ...durableReplay, previous_state: 'registered', current_state: 'active',
    }]}), capability({enrollmentId, action: 'activate'})),
    /invalid_staff_lifecycle_sql_result/,
  );
});
