import test from 'node:test';
import assert from 'node:assert/strict';
import {claimCurrentStaffInvitation} from '../apps/api/src/staff-invitation-claim-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';

const enrollmentId = '30000000-0000-4000-8000-000000000003';
const jobId = '40000000-0000-4000-8000-000000000004';
const hash = 'a'.repeat(64);
const base = {
  job_id: jobId, enrollment_id: enrollmentId, invite_version: 1,
  invite_token_hash_hex: hash, current_invite_version: 1,
  current_invite_token_hash_hex: hash, enrollment_state: 'invited',
};

function simulatedTransaction(rows, update) {
  let committed = false;
  let rolledBack = false;
  const queries = [];
  return {
    queries,
    get committed() {return committed;},
    get rolledBack() {return rolledBack;},
    async run(callback) {
      try {
        const result = await callback(async statement => {
          queries.push(statement.text);
          return queries.length === 1 ? {rows} : update();
        });
        committed = true;
        return result;
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  };
}

test('two competing claims: a lost conditional UPDATE cannot report success', async () => {
  const first = simulatedTransaction([base], () => ({
    rows: [{fence: '50000000-0000-4000-8000-000000000005'}],
  }));
  const second = simulatedTransaction([base], () => ({rows: []}));
  const repository = createStaffInvitationOutboxRepository();
  assert.equal((await claimCurrentStaffInvitation({
    jobId, withTransaction: first.run, repository,
  })).claimed, true);
  await assert.rejects(claimCurrentStaffInvitation({
    jobId, withTransaction: second.run, repository,
  }), /staff_delivery_claim_failed/);
  assert.equal(first.committed, true);
  assert.equal(second.rolledBack, true);
});

test('revocation and resend observed under lock suppress delivery claims', async () => {
  for (const row of [
    {...base, enrollment_state: 'revoked'},
    {...base, current_invite_version: 2},
    {...base, current_invite_token_hash_hex: 'b'.repeat(64)},
  ]) {
    const tx = simulatedTransaction([row], () => {
      throw Error('must_not_claim');
    });
    const result = await claimCurrentStaffInvitation({
      jobId, withTransaction: tx.run,
      repository: createStaffInvitationOutboxRepository(),
    });
    assert.equal(result.claimed, false);
    assert.equal(tx.queries.length, 1);
  }
});

test('invalid SQL output fails closed before claim and rolls back', async () => {
  const tx = simulatedTransaction([{
    ...base, enrollment_state: 'invited', current_invite_version: null,
  }], () => {
    throw Error('must_not_claim');
  });
  await assert.rejects(claimCurrentStaffInvitation({
    jobId, withTransaction: tx.run,
    repository: createStaffInvitationOutboxRepository(),
  }), /invalid_staff_delivery_sql_result/);
  assert.equal(tx.rolledBack, true);
  assert.equal(tx.queries.length, 1);
});
