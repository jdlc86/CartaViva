import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createStaffCustodyApprovalAuthorityCandidate} from '../apps/api/src/staff-custody-approval-authority-candidate.mjs';
import {createAuthenticatedStaffCustodyGrantIssuerCandidate} from '../apps/api/src/staff-custody-authenticated-grant-issuer-candidate.mjs';
const now=new Date('2026-10-25T12:00:00Z');
const cutoff='2026-10-01T00:00:00Z';
const scope={cutoff,maxRows:10,maxBatches:2};
function setup({identity,allow=true}={}){
  const authority=createStaffCustodyApprovalAuthorityCandidate({
    secret:randomBytes(32),clock:()=>now,allowedActors:['root_actor_001'],
    consumeNonce:async()=>true,
  });
  let checks=0;
  const issuer=createAuthenticatedStaffCustodyGrantIssuerCandidate({
    authority,resolveAuthenticatedActor:async()=>identity,
    authorizeMaintenance:async({identity:verified,action,cutoff:date})=>{
      checks++;
      assert.equal(verified,identity);
      assert.equal(action,'purge_terminal_staff_custody');
      assert.equal(date,cutoff);
      return allow;
    },
  });
  return {issuer,authority,checks:()=>checks};
}
test('trusted issuer derives actor from verified identity, never caller-supplied actor',async()=>{
  const {issuer,authority}=setup({
    identity:{actorId:'root_actor_001',authenticated:true},
  });
  const grant=await issuer.issue({
    ...scope,actorId:'attacker_001',approved:true,role:'ROOT',
  });
  assert.equal(grant.actorId,'root_actor_001');
  assert.equal(grant.action,'purge_terminal_staff_custody');
  assert.equal(grant.maxRows,10);
  authority.close();
});
test('missing or unauthenticated identity fails before authorization',async()=>{
  for(const identity of [undefined,{},{
    actorId:'root_actor_001',authenticated:false,
  },{actorId:'not valid',authenticated:true}]){
    const {issuer,authority,checks}=setup({identity});
    await assert.rejects(issuer.issue(scope),
      /staff_custody_grant_actor_not_authenticated/);
    assert.equal(checks(),0);
    authority.close();
  }
});
test('authenticated but unauthorized actor cannot issue signed grants',async()=>{
  const {issuer,authority}=setup({
    identity:{actorId:'root_actor_001',authenticated:true},allow:false,
  });
  await assert.rejects(issuer.issue(scope),
    /staff_custody_grant_actor_not_authorized/);
  authority.close();
});
test('issuer cannot be configured without both trust boundaries',()=>{
  assert.throws(()=>createAuthenticatedStaffCustodyGrantIssuerCandidate({
    authority:{issue:()=>{}},resolveAuthenticatedActor:async()=>({}),
  }),/invalid_staff_custody_grant_issuer_config/);
});
