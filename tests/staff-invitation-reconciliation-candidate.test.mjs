import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileStaffInvitationJob} from '../apps/api/src/staff-invitation-reconciliation-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';

const jobId = '40000000-0000-4000-8000-000000000004';
const enrollmentId = '30000000-0000-4000-8000-000000000003';
const hash = 'a'.repeat(64);
const row = {
  job_id: jobId, enrollment_id: enrollmentId, invite_version: 1,
  invite_token_hash_hex: hash, current_invite_version: 1,
  current_invite_token_hash_hex: hash, enrollment_state: 'invited',
};

function setup(candidate, updated = true) {
  const statements = [];
  const withTransaction = async callback => callback(async statement => {
    statements.push(statement);
    return statements.length === 1 ? {rows: candidate ? [candidate] : []} :
      {rows: updated ? [{id: jobId}] : []};
  });
  return {statements, withTransaction};
}

test('revoked, accepted and superseded jobs are cancelled under lock', async () => {
  for (const [candidate, reason] of [
    [{...row, enrollment_state: 'revoked'}, 'revoked'],
    [{...row, enrollment_state: 'accepted'}, 'already_accepted'],
    [{...row, current_invite_version: 2}, 'superseded'],
    [{...row, current_invite_token_hash_hex: 'b'.repeat(64)}, 'superseded'],
  ]) {
    const context = setup(candidate);
    const result = await reconcileStaffInvitationJob({
      jobId, withTransaction: context.withTransaction,
      repository: createStaffInvitationOutboxRepository(),
    });
    assert.deepEqual(result, {cancelled: true, reason});
    assert.equal(context.statements.length, 2);
    assert.match(context.statements[0].text, /FOR UPDATE OF o, e/);
    assert.match(context.statements[0].text, /state IN \('pending', 'claimed'\)/);
    assert.match(context.statements[1].text, /SET state = 'cancelled'/);
    assert.deepEqual(context.statements.map(s => s.values), [[jobId], [jobId]]);
  }
});

test('current invitation is never cancelled', async () => {
  const context = setup(row);
  const result = await reconcileStaffInvitationJob({
    jobId, withTransaction: context.withTransaction,
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {cancelled: false, reason: 'current_invitation'});
  assert.equal(context.statements.length, 1);
});

test('in-flight dispatch and absent job cannot be reconciled by this path', async () => {
  const context = setup(null);
  const result = await reconcileStaffInvitationJob({
    jobId, withTransaction: context.withTransaction,
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {cancelled: false, reason: 'not_found'});
  assert.equal(context.statements.length, 1);
  assert.doesNotMatch(context.statements[0].text, /'dispatching'/);
});

test('lost cancellation race rejects and must roll back transaction', async () => {
  const context = setup({...row, enrollment_state: 'revoked'}, false);
  await assert.rejects(reconcileStaffInvitationJob({
    jobId, withTransaction: context.withTransaction,
    repository: createStaffInvitationOutboxRepository(),
  }), /staff_reconciliation_lost_race/);
});

test('invalid configuration fails before database access', async () => {
  await assert.rejects(reconcileStaffInvitationJob({
    jobId: 'bad', withTransaction: async () => {throw Error('called');},
    repository: createStaffInvitationOutboxRepository(),
  }), /invalid_staff_reconciliation_config/);
});
