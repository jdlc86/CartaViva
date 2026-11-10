import test from 'node:test';
import assert from 'node:assert/strict';
import {claimCurrentStaffInvitation} from '../apps/api/src/staff-invitation-claim-candidate.mjs';
const id = '30000000-0000-4000-8000-000000000003';
const jobId = '40000000-0000-4000-8000-000000000004';
const hash = 'a'.repeat(64);
const candidate = {
  job: {enrollmentId: id, inviteVersion: 1, inviteTokenHashHex: hash},
  enrollment: {id, inviteVersion: 1, inviteTokenHashHex: hash, state: 'invited'},
};
function transaction(callback) {
  return callback(async () => ({rows: []}));
}
test('claim only current invitation under repository transaction', async () => {
  const calls = [];
  const result = await claimCurrentStaffInvitation({
    jobId, withTransaction: transaction,
    repository: {
      async lockDeliveryCandidate() {calls.push('lock'); return candidate;},
      async markDeliveryClaimed() {calls.push('claim'); return {claimed: true, fence: 'f'.repeat(32)};},
    },
  });
  assert.deepEqual(calls, ['lock', 'claim']);
  assert.deepEqual(result, {claimed: true, reason: 'claimed', fence: 'f'.repeat(32)});
});
test('revoked and superseded invitations never reach claim mutation', async () => {
  for (const enrollment of [
    {...candidate.enrollment, state: 'revoked'},
    {...candidate.enrollment, inviteVersion: 2},
  ]) {
    let mutated = false;
    const result = await claimCurrentStaffInvitation({
      jobId, withTransaction: transaction,
      repository: {
        async lockDeliveryCandidate() {return {...candidate, enrollment};},
        async markDeliveryClaimed() {mutated = true;},
      },
    });
    assert.equal(result.claimed, false);
    assert.equal(mutated, false);
  }
});
test('invalid claim response aborts transaction rather than returning success', async () => {
  await assert.rejects(claimCurrentStaffInvitation({
    jobId, withTransaction: transaction,
    repository: {
      async lockDeliveryCandidate() {return candidate;},
      async markDeliveryClaimed() {return {claimed: false};},
    },
  }), /staff_delivery_claim_failed/);
});
test('missing trusted dependencies fail before transaction', async () => {
  let called = false;
  await assert.rejects(claimCurrentStaffInvitation({
    jobId, withTransaction: async () => {called = true;},
    repository: {lockDeliveryCandidate: async () => candidate},
  }), /invalid_staff_delivery_claim_config/);
  assert.equal(called, false);
});
