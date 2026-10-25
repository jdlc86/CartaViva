import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createStaffCustodyApprovalAuthorityCandidate} from '../apps/api/src/staff-custody-approval-authority-candidate.mjs';
import {createStaffCustodyMaintenanceCandidate} from '../apps/api/src/staff-custody-maintenance-candidate.mjs';
const cutoff='2026-10-01T00:00:00Z';
let now=new Date('2026-10-25T12:00:00Z');
const clock=()=>now;
function authority(){
  const consumed=new Set();
  return createStaffCustodyApprovalAuthorityCandidate({
    secret:randomBytes(32),clock,allowedActors:['staff_root_001'],
    consumeNonce:async nonce=>{
      if(consumed.has(nonce))return false;
      consumed.add(nonce);return true;
    },
  });
}
const scope={cutoff,maxRows:2,maxBatches:2};
test('signed grant executes once and cannot be replayed',async()=>{
  now=new Date('2026-10-25T12:00:00Z');
  const auth=authority();
  let calls=0;
  const coordinator=createStaffCustodyMaintenanceCandidate({
    approvalAuthority:auth,clock,query:async()=>{calls++;return {rows:[{removed:1}]};},
  });
  const grant=auth.issue({actorId:'staff_root_001',...scope});
  assert.deepEqual(await coordinator.run({...scope,dryRun:false,authorization:grant}),
    {executed:true,removed:1,batches:1});
  await assert.rejects(coordinator.run({...scope,dryRun:false,authorization:grant}),
    /staff_custody_approval_replayed/);
  assert.equal(calls,1);
  auth.close();
});
test('signature, scope, actor, expiry and untrusted boolean approvals fail closed',async()=>{
  now=new Date('2026-10-25T12:00:00Z');
  const auth=authority();
  const coordinator=createStaffCustodyMaintenanceCandidate({
    approvalAuthority:auth,clock,query:async()=>{throw Error('must_not_query');},
  });
  const grant=auth.issue({actorId:'staff_root_001',...scope});
  await assert.rejects(coordinator.run({...scope,dryRun:false,
    authorization:{action:'purge_terminal_staff_custody',approved:true,...scope}}),
  /invalid_staff_custody_approval/);
  await assert.rejects(coordinator.run({...scope,dryRun:false,
    authorization:{...grant,signature:'0'.repeat(64)}}),
  /staff_custody_approval_signature_invalid/);
  await assert.rejects(coordinator.run({...scope,dryRun:false,
    authorization:{...grant,maxRows:3}}),
  /staff_custody_approval_scope_mismatch/);
  await assert.rejects(coordinator.run({...scope,maxRows:1,dryRun:false,
    authorization:grant}),/staff_custody_approval_scope_mismatch/);
  assert.throws(()=>auth.issue({actorId:'unknown_001',...scope}),
    /invalid_staff_custody_approval/);
  now=new Date('2026-10-25T12:03:00Z');
  await assert.rejects(coordinator.run({...scope,dryRun:false,authorization:grant}),
    /staff_custody_approval_expired/);
  auth.close();
  assert.throws(()=>auth.issue({actorId:'staff_root_001',...scope}),
    /staff_custody_approval_authority_closed/);
});
test('dry-run never consumes signed approval',async()=>{
  now=new Date('2026-10-25T12:00:00Z');
  const auth=authority();
  let consumed=0;
  const coordinator=createStaffCustodyMaintenanceCandidate({
    approvalAuthority:auth,clock,query:async()=>{consumed++;return {rows:[{removed:0}]};},
  });
  const grant=auth.issue({actorId:'staff_root_001',...scope});
  assert.equal((await coordinator.run({...scope,authorization:grant})).executed,false);
  assert.equal(consumed,0);
  assert.equal((await coordinator.run({...scope,dryRun:false,authorization:grant})).executed,true);
  auth.close();
});
