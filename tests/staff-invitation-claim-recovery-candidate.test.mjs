import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffInvitationClaimRecoveryCandidate,STAFF_INVITATION_RECLAIM_SQL} from '../apps/api/src/staff-invitation-claim-recovery-candidate.mjs';
const jobId='a0000000-0000-4000-8000-000000000001';
const staleFence='b0000000-0000-4000-8000-000000000002';
const freshFence='c0000000-0000-4000-8000-000000000003';
test('recovery fences only expired claimed rows',async()=>{
  const c=createStaffInvitationClaimRecoveryCandidate({withTransaction:fn=>fn(async(sql,params)=>{
    assert.equal(sql,STAFF_INVITATION_RECLAIM_SQL);
    assert.deepEqual(params,[jobId,staleFence,60]);
    return {rows:[{fence:freshFence}]};
  })});
  assert.deepEqual(await c.reclaim({jobId,staleFence,leaseSeconds:60}),{reclaimed:true,fence:freshFence});
  assert.match(STAFF_INVITATION_RECLAIM_SQL,/state='claimed'/);
  assert.doesNotMatch(STAFF_INVITATION_RECLAIM_SQL,/dispatching/);
});
test('no eligible job yields no recovery',async()=>{
  const c=createStaffInvitationClaimRecoveryCandidate({withTransaction:fn=>fn(async()=>({rows:[]}))});
  assert.deepEqual(await c.reclaim({jobId,staleFence,leaseSeconds:30}),{reclaimed:false});
});
test('invalid lease and stale fence are rejected',async()=>{
  const c=createStaffInvitationClaimRecoveryCandidate({withTransaction:()=>{throw Error('must not run')}});
  for(const leaseSeconds of [0,29,3601,1.5]) await assert.rejects(c.reclaim({jobId,staleFence,leaseSeconds}),/invalid_staff_claim_recovery_input/);
});
test('reused fence and ambiguous SQL results fail closed',async()=>{
  for(const rows of [[{fence:staleFence}],[{fence:freshFence},{fence:freshFence}]]) {
    const c=createStaffInvitationClaimRecoveryCandidate({withTransaction:fn=>fn(async()=>({rows}))});
    await assert.rejects(c.reclaim({jobId,staleFence,leaseSeconds:60}),/invalid_staff_claim_recovery_result/);
  }
});
