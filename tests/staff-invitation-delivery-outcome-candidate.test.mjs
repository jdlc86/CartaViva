import test from 'node:test';
import assert from 'node:assert/strict';
import {recordStaffInvitationDeliveryOutcome} from '../apps/api/src/staff-invitation-delivery-outcome-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';

const jobId = '40000000-0000-4000-8000-000000000004';
const fence = '50000000-0000-4000-8000-000000000005';

function simulatedTransaction({found = true, finished = true} = {}) {
  const statements = [];
  return {
    statements,
    withTransaction: async fn => fn(async statement => {
      statements.push(statement);
      if (statements.length === 1) return {rows: found ? [{id: jobId}] : []};
      return {rows: finished ? [{id: jobId}] : []};
    }),
  };
}

test('provider accepted: persist delivered, without claiming inbox delivery', async () => {
  const tx = simulatedTransaction();
  const result = await recordStaffInvitationDeliveryOutcome({
    ...tx, repository: createStaffInvitationOutboxRepository(),
    jobId, fence, outcome: 'accepted',
  });
  assert.deepEqual(result, {
    recorded: true, state: 'delivered', retryable: false, ambiguous: false,
  });
  assert.match(tx.statements[0].text, /state = 'dispatching'/);
  assert.match(tx.statements[0].text, /FOR UPDATE/);
  assert.match(tx.statements[1].text, /state = \$3::text/);
  assert.deepEqual(tx.statements[1].values, [jobId, fence, 'delivered', 'accepted']);
});

test('unknown provider outcome is terminal, flagged ambiguous, and not retried', async () => {
  const tx = simulatedTransaction();
  const result = await recordStaffInvitationDeliveryOutcome({
    ...tx, repository: createStaffInvitationOutboxRepository(),
    jobId, fence, outcome: 'unknown',
  });
  assert.deepEqual(result, {
    recorded: true, state: 'failed', retryable: false, ambiguous: true,
  });
  assert.deepEqual(tx.statements[1].values, [jobId, fence, 'failed', 'unknown']);
});

test('permanent failure cannot schedule automatic resend', async () => {
  const tx = simulatedTransaction();
  const result = await recordStaffInvitationDeliveryOutcome({
    ...tx, repository: createStaffInvitationOutboxRepository(),
    jobId, fence, outcome: 'permanent_failure',
  });
  assert.deepEqual(result, {
    recorded: true, state: 'failed', retryable: false, ambiguous: false,
  });
});

test('missing dispatch or mismatched fence never updates the job', async () => {
  const tx = simulatedTransaction({found: false});
  const result = await recordStaffInvitationDeliveryOutcome({
    ...tx, repository: createStaffInvitationOutboxRepository(),
    jobId, fence, outcome: 'accepted',
  });
  assert.deepEqual(result, {recorded: false, reason: 'not_dispatching'});
  assert.equal(tx.statements.length, 1);
});

test('concurrent transition losing its fence is an error, not success', async () => {
  const tx = simulatedTransaction({finished: false});
  await assert.rejects(recordStaffInvitationDeliveryOutcome({
    ...tx, repository: createStaffInvitationOutboxRepository(),
    jobId, fence, outcome: 'accepted',
  }), /staff_delivery_outcome_lost_race/);
});

test('reject unknown outcomes before database access', async () => {
  let called = false;
  await assert.rejects(recordStaffInvitationDeliveryOutcome({
    withTransaction: async () => {called = true;},
    repository: createStaffInvitationOutboxRepository(),
    jobId, fence, outcome: 'retry',
  }), /invalid_staff_delivery_outcome_config/);
  assert.equal(called, false);
});

test('SQL adapter rejects forged completion row and malformed next state', async () => {
  const repo = createStaffInvitationOutboxRepository();
  await assert.rejects(repo.finishDispatchingDelivery(
    async () => ({rows: [{id: '60000000-0000-4000-8000-000000000006'}]}),
    jobId, fence, 'delivered', 'accepted',
  ), /invalid_staff_delivery_sql_result/);
  await assert.rejects(repo.finishDispatchingDelivery(
    async () => {throw Error('should_not_execute');},
    jobId, fence, 'pending', 'accepted',
  ), /invalid_staff_delivery_sql_input/);
});
