import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffInvitationOutboxRepository} from '../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';
import {claimCurrentStaffInvitation} from '../apps/api/src/staff-invitation-claim-candidate.mjs';

const id = '30000000-0000-4000-8000-000000000003';
const jobId = '40000000-0000-4000-8000-000000000004';
const hash = 'a'.repeat(64);
const row = {job_id: jobId, enrollment_id: id, invite_version: 1,
  invite_token_hash_hex: hash, current_invite_version: 1,
  current_invite_token_hash_hex: hash, enrollment_state: 'invited'};

test('parameterized locked claim uses same transaction and returns SQL fence', async () => {
  const sql = [];
  const query = async statement => {
    sql.push(statement);
    return sql.length === 1 ? {rows: [row]} :
      {rows: [{fence: '50000000-0000-4000-8000-000000000005'}]};
  };
  const result = await claimCurrentStaffInvitation({
    jobId,
    withTransaction: async callback => callback(query),
    repository: createStaffInvitationOutboxRepository(),
  });
  assert.equal(result.claimed, true);
  assert.equal(sql.length, 2);
  assert.deepEqual(sql.map(s => s.values), [[jobId], [jobId]]);
  assert.match(sql[0].text, /FOR UPDATE OF o, e/);
  assert.match(sql[1].text, /state = 'pending'/);
});

test('revoked state never executes UPDATE', async () => {
  let count = 0;
  const result = await claimCurrentStaffInvitation({
    jobId, withTransaction: async callback => callback(async () => {
      count++;
      return {rows: [{...row, enrollment_state: 'revoked'}]};
    }), repository: createStaffInvitationOutboxRepository(),
  });
  assert.deepEqual(result, {claimed: false, reason: 'revoked'});
  assert.equal(count, 1);
});

test('duplicate SQL rows and malformed state reject before mutation', async () => {
  for (const rows of [[row, row], [{...row, invite_version: '1'}]]) {
    let count = 0;
    await assert.rejects(claimCurrentStaffInvitation({
      jobId, withTransaction: async callback => callback(async () => {
        count++;
        return {rows};
      }), repository: createStaffInvitationOutboxRepository(),
    }), /invalid_staff_delivery_sql_result/);
    assert.equal(count, 1);
  }
});

test('conditional UPDATE losing race fails closed', async () => {
  let count = 0;
  await assert.rejects(claimCurrentStaffInvitation({
    jobId, withTransaction: async callback => callback(async () => {
      count++;
      return count === 1 ? {rows: [row]} : {rows: []};
    }), repository: createStaffInvitationOutboxRepository(),
  }), /staff_delivery_claim_failed/);
});
