import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffInvitationOutboxRepository} from '../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';
import {claimCurrentStaffInvitation} from '../apps/api/src/staff-invitation-claim-candidate.mjs';

const id = '30000000-0000-4000-8000-000000000003';
const jobId = '40000000-0000-4000-8000-000000000004';
const hash = 'a'.repeat(64);

function row(overrides = {}) {
  return {job_id: jobId, enrollment_id: id, invite_version: 1,
    invite_token_hash_hex: hash, current_invite_version: 1,
    current_invite_token_hash_hex: hash, enrollment_state: 'invited',
    ...overrides};
}

test('SQL adapter binds UUID as value and never interpolates into SQL', async () => {
  const seen = [];
  const repository = createStaffInvitationOutboxRepository();
  await repository.lockDeliveryCandidate(async statement => {
    seen.push(statement);
    return {rows: [row()]};
  }, jobId);
  assert.deepEqual(seen[0].values, [jobId]);
  assert.equal(seen[0].text.includes(jobId), false);
});

test('outbox adapter refuses unexpected result cardinality and invalid fences', async () => {
  const repository = createStaffInvitationOutboxRepository();
  await assert.rejects(repository.markDeliveryClaimed(async () =>
    ({rows: [{fence: id}, {fence: id}]}), jobId),
  /invalid_staff_delivery_sql_result/);
  const result = await repository.markDeliveryClaimed(async () =>
    ({rows: [{fence: 'not-a-uuid'}]}), jobId);
  assert.equal(result.claimed, false);
});

test('missing outbox job returns not_found without UPDATE', async () => {
  let queries = 0;
  const result = await claimCurrentStaffInvitation({
    jobId,
    withTransaction: async callback => callback(async () => {
      queries++;
      return {rows: []};
    }),
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {claimed: false, reason: 'not_found'});
  assert.equal(queries, 1);
});

test('candidate rejects unsupported enrollment states', async () => {
  const repository = createStaffInvitationOutboxRepository();
  await assert.rejects(repository.lockDeliveryCandidate(async () =>
    ({rows: [row({enrollment_state: 'unknown'})]}), jobId),
  /invalid_staff_delivery_sql_result/);
});

test('accessor-backed SQL row is rejected without evaluating getter', async () => {
  let evaluated = false;
  const malicious = {
    job_id: jobId, enrollment_id: id, invite_version: 1,
    invite_token_hash_hex: hash, current_invite_version: 1,
    current_invite_token_hash_hex: hash, enrollment_state: 'invited',
  };
  Object.defineProperty(malicious, 'enrollment_state', {
    enumerable: true, get() {evaluated = true; throw Error('getter_executed');},
  });
  await assert.rejects(createStaffInvitationOutboxRepository()
    .lockDeliveryCandidate(async () => ({rows: [malicious]}), jobId),
  /invalid_staff_delivery_sql_result/);
  assert.equal(evaluated, false);
});

test('malformed job identifier is rejected before a claim mutation', async () => {
  const malformed = {
    job_id: 'not-a-uuid', enrollment_id: id, invite_version: 1,
    invite_token_hash_hex: hash, current_invite_version: 1,
    current_invite_token_hash_hex: hash, enrollment_state: 'invited',
  };
  await assert.rejects(createStaffInvitationOutboxRepository()
    .lockDeliveryCandidate(async () => ({rows: [malformed]}), jobId),
  /invalid_staff_delivery_sql_result/);
});
