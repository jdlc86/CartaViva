import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffInvitationOutboxRepository} from '../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';
import {authorizeStaffInvitationDispatch} from '../apps/api/src/staff-invitation-dispatch-guard.mjs';

const jobId = '40000000-0000-4000-8000-000000000004';
const enrollmentId = '30000000-0000-4000-8000-000000000003';
const fence = '50000000-0000-4000-8000-000000000005';
const hash = 'a'.repeat(64);
const row = {
  job_id: jobId, enrollment_id: enrollmentId, invite_version: 1,
  invite_token_hash_hex: hash, current_invite_version: 1,
  current_invite_token_hash_hex: hash, enrollment_state: 'invited',
};

function tx(callback) {
  const statements = [];
  return callback(async statement => {
    statements.push(statement);
    return statements.length === 1 ? {rows: [row]} : {rows: [{id: jobId}]};
  });
}

test('dispatch gate locks enrollment and job, then records fenced transition', async () => {
  const statements = [];
  const result = await authorizeStaffInvitationDispatch({
    jobId, fence,
    withTransaction: callback => callback(async statement => {
      statements.push(statement);
      return statements.length === 1 ? {rows: [row]} : {rows: [{id: jobId}]};
    }),
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {authorized: true});
  assert.equal(statements.length, 2);
  assert.match(statements[0].text, /FOR UPDATE OF o, e/);
  assert.match(statements[0].text, /o\.fence = \$2::uuid/);
  assert.match(statements[1].text, /state = 'dispatching'/);
  assert.match(statements[1].text, /state = 'claimed'/);
  assert.match(statements[1].text, /attempts = attempts \+ 1/);
  assert.match(statements[1].text, /attempts < 100/);
  assert.deepEqual(statements.map(s => s.values), [[jobId, fence], [jobId, fence]]);
});

test('revocation after claim prevents dispatch mutation', async () => {
  let statements = 0;
  const result = await authorizeStaffInvitationDispatch({
    jobId, fence,
    withTransaction: callback => callback(async () => {
      statements++;
      return {rows: [{...row, enrollment_state: 'revoked'}]};
    }),
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {authorized: false, reason: 'revoked'});
  assert.equal(statements, 1);
});

test('lost dispatch fence is rejected rather than reported as success', async () => {
  let statements = 0;
  await assert.rejects(authorizeStaffInvitationDispatch({
    jobId, fence,
    withTransaction: callback => callback(async () => {
      statements++;
      return statements === 1 ? {rows: [row]} : {rows: []};
    }),
    repository: createStaffInvitationOutboxRepository(),
  }), /staff_dispatch_fence_rejected/);
});

test('stale fence returns no claim without a second query', async () => {
  let statements = 0;
  const result = await authorizeStaffInvitationDispatch({
    jobId, fence,
    withTransaction: callback => callback(async () => {
      statements++;
      return {rows: []};
    }),
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {authorized: false, reason: 'claim_not_found'});
  assert.equal(statements, 1);
});
