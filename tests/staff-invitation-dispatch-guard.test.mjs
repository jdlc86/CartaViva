import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeStaffInvitationDispatch} from '../apps/api/src/staff-invitation-dispatch-guard.mjs';

const jobId = '40000000-0000-4000-8000-000000000004';
const enrollmentId = '30000000-0000-4000-8000-000000000003';
const fence = '50000000-0000-4000-8000-000000000005';
const hash = 'a'.repeat(64);
const candidate = {
  job: {enrollmentId, inviteVersion: 1, inviteTokenHashHex: hash},
  enrollment: {id: enrollmentId, inviteVersion: 1,
    inviteTokenHashHex: hash, state: 'invited'},
};
const tx = async (callback) => callback(() => {});

test('current invitation with matching fence can be authorized by repository', async () => {
  const calls = [];
  const result = await authorizeStaffInvitationDispatch({
    jobId, fence, withTransaction: tx,
    repository: {
      lockClaimedDelivery: async () => {calls.push('lock'); return candidate;},
      authorizeDispatch: async () => {calls.push('authorize'); return {authorized: true};},
    },
  });
  assert.deepEqual(result, {authorized: true});
  assert.deepEqual(calls, ['lock', 'authorize']);
});

test('revoked, accepted, superseded and rotated invitations never authorize', async () => {
  for (const enrollment of [
    {...candidate.enrollment, state: 'revoked'},
    {...candidate.enrollment, state: 'accepted'},
    {...candidate.enrollment, inviteVersion: 2},
    {...candidate.enrollment, inviteTokenHashHex: 'b'.repeat(64)},
  ]) {
    let mutated = false;
    const result = await authorizeStaffInvitationDispatch({
      jobId, fence, withTransaction: tx,
      repository: {
        lockClaimedDelivery: async () => ({...candidate, enrollment}),
        authorizeDispatch: async () => {mutated = true; return {authorized: true};},
      },
    });
    assert.equal(result.authorized, false);
    assert.equal(mutated, false);
  }
});

test('stale claim and rejected fence fail closed', async () => {
  const missing = await authorizeStaffInvitationDispatch({
    jobId, fence, withTransaction: tx,
    repository: {
      lockClaimedDelivery: async () => null,
      authorizeDispatch: async () => {throw Error('should_not_run');},
    },
  });
  assert.deepEqual(missing, {authorized: false, reason: 'claim_not_found'});
  await assert.rejects(authorizeStaffInvitationDispatch({
    jobId, fence, withTransaction: tx,
    repository: {
      lockClaimedDelivery: async () => candidate,
      authorizeDispatch: async () => ({authorized: false}),
    },
  }), /staff_dispatch_fence_rejected/);
});

test('untrusted fence fails before transaction', async () => {
  let called = false;
  await assert.rejects(authorizeStaffInvitationDispatch({
    jobId, fence: 'bad',
    withTransaction: async () => {called = true;},
    repository: {lockClaimedDelivery() {}, authorizeDispatch() {}},
  }), /invalid_staff_dispatch_config/);
  assert.equal(called, false);
});
