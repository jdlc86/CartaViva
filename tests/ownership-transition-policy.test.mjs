import test from 'node:test';
import assert from 'node:assert/strict';
import { decideOwnershipTransition as decide } from '../apps/api/src/ownership-transition-policy.mjs';
const ids = ['00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000203'];
const member = (userId,role='admin',state='active') => ({userId,role,state});
const base = {currentOwnerId:ids[0]};
test('non-owner requests; current owner offers',()=>{
 assert.deepEqual(decide({...base,action:'request',actor:member(ids[1])}),{proposalKind:'request',fromOwnerId:ids[0],toOwnerId:ids[1]});
 assert.deepEqual(decide({...base,action:'offer',actor:member(ids[0]),target:member(ids[1])}),{proposalKind:'offer',fromOwnerId:ids[0],toOwnerId:ids[1]});
 assert.equal(decide({...base,action:'offer',actor:member(ids[1]),target:member(ids[2])}).error,'invalid_transition');
});
test('request accepted only by current owner; offer accepted only by recipient',()=>{
 const request={kind:'request',status:'pending',fromOwnerId:ids[0],toOwnerId:ids[1]};
 const offer={...request,kind:'offer'};
 assert.equal(decide({...base,action:'accept',actor:member(ids[1]),target:member(ids[1]),proposal:request}).error,'forbidden');
 assert.equal(decide({...base,action:'accept',actor:member(ids[0]),target:member(ids[1]),proposal:request}).nextOwnerId,ids[1]);
 assert.equal(decide({...base,action:'accept',actor:member(ids[0]),target:member(ids[1]),proposal:offer}).error,'forbidden');
 assert.equal(decide({...base,action:'accept',actor:member(ids[1]),target:member(ids[1]),proposal:offer}).nextOwnerId,ids[1]);
 assert.equal(decide({...base,action:'accept',actor:member(ids[1]),target:member(ids[1]),proposal:{...offer,status:'accepted'}}).error,'stale_proposal');
 assert.equal(decide({...base,currentOwnerId:ids[2],action:'accept',actor:member(ids[1]),target:member(ids[1]),proposal:offer}).error,'stale_proposal');
});
test('creator can cancel; decision maker can reject',()=>{
 const offer={kind:'offer',status:'pending',fromOwnerId:ids[0],toOwnerId:ids[1]};
 assert.equal(decide({...base,action:'cancel',actor:member(ids[0]),proposal:offer}).nextStatus,'cancelled');
 assert.equal(decide({...base,action:'reject',actor:member(ids[1]),proposal:offer}).nextStatus,'rejected');
 assert.equal(decide({...base,action:'cancel',actor:member(ids[2]),proposal:offer}).error,'forbidden');
});
test('only active ROOT forces reassignment with reason and eligible admin',()=>{
 assert.equal(decide({...base,action:'force',actor:member(ids[2],'root'),target:member(ids[1]),reason:'recovery'}).nextOwnerId,ids[1]);
 assert.equal(decide({...base,action:'force',actor:member(ids[0]),target:member(ids[1]),reason:'recovery'}).error,'forbidden');
 assert.equal(decide({...base,action:'force',actor:member(ids[2],'root'),target:member(ids[1]),reason:' '}).error,'invalid_transition');
 assert.equal(decide({...base,action:'force',actor:member(ids[2],'root','revoked'),target:member(ids[1]),reason:'recovery'}).error,'forbidden');
 assert.equal(decide({...base,action:'force',actor:member(ids[2],'root'),target:member(ids[1],'waiter'),reason:'recovery'}).error,'invalid_transition');
});
