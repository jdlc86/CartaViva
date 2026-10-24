import test from 'node:test';
import assert from 'node:assert/strict';
import { decideOwnershipTransition as decide } from '../apps/api/src/ownership-transition-policy.mjs';

const [owner, applicant, other, root] = [
 '00000000-0000-0000-0000-000000000301',
 '00000000-0000-0000-0000-000000000302',
 '00000000-0000-0000-0000-000000000303',
 '00000000-0000-0000-0000-000000000304'
];
const actor = (userId,role='admin',state='active') => ({userId,role,state});
const pending = (kind='request') => ({kind,status:'pending',fromOwnerId:owner,toOwnerId:applicant});

test('ownership decision matrix: unauthorized actors cannot accept or reject',()=>{
 for(const kind of ['request','offer']){
  for(const action of ['accept','reject']){
   const decisionMaker=kind==='request'?owner:applicant;
   for(const candidate of [owner,applicant,other]){
    const result=decide({action,actor:actor(candidate),currentOwnerId:owner,
      target:actor(applicant),proposal:pending(kind)});
    if(candidate===decisionMaker){
     assert.equal(result.error,undefined,`${kind}/${action}: decision maker should be allowed`);
    }else{
     assert.equal(result.error,'forbidden',`${kind}/${action}: wrong actor`);
    }
   }
  }
 }
});

test('ownership decision matrix: inactive, revoked or non-admin participants denied',()=>{
 for(const state of ['invited','suspended','revoked']){
  assert.equal(decide({action:'request',actor:actor(applicant,'admin',state),currentOwnerId:owner}).error,'forbidden');
  assert.equal(decide({action:'offer',actor:actor(owner,'admin',state),currentOwnerId:owner,target:actor(applicant)}).error,'forbidden');
  assert.equal(decide({action:'accept',actor:actor(owner,'admin',state),currentOwnerId:owner,
   target:actor(applicant),proposal:pending()}).error,'forbidden');
  assert.equal(decide({action:'accept',actor:actor(owner),currentOwnerId:owner,
   target:actor(applicant,'admin',state),proposal:pending()}).error,'invalid_transition');
 }
 for(const role of ['waiter','kitchen','root']){
  assert.equal(decide({action:'request',actor:actor(applicant,role),currentOwnerId:owner}).error,'forbidden');
  assert.equal(decide({action:'offer',actor:actor(owner,role),currentOwnerId:owner,target:actor(applicant)}).error,'forbidden');
 }
});

test('ownership decision matrix: stale proposals cannot change ownership',()=>{
 for(const kind of ['request','offer']){
  const decisionMaker=kind==='request'?owner:applicant;
  for(const status of ['accepted','rejected','cancelled']){
   assert.equal(decide({action:'accept',actor:actor(decisionMaker),currentOwnerId:owner,
    target:actor(applicant),proposal:{...pending(kind),status}}).error,'stale_proposal');
  }
  assert.equal(decide({action:'accept',actor:actor(decisionMaker),currentOwnerId:other,
   target:actor(applicant),proposal:pending(kind)}).error,'stale_proposal');
 }
});

test('ownership decision matrix: ROOT governance is distinct from ordinary ownership',()=>{
 for(const action of ['request','offer','accept','reject','cancel']){
  assert.equal(decide({action,actor:actor(root,'root'),currentOwnerId:owner,
   target:actor(applicant),proposal:pending()}).error,'forbidden');
 }
 assert.equal(decide({action:'force',actor:actor(root,'root'),currentOwnerId:owner,
  target:actor(applicant),reason:'Emergency recovery'}).nextOwnerId,applicant);
 assert.equal(decide({action:'force',actor:actor(root,'root'),currentOwnerId:owner,
  target:actor(root,'root'),reason:'Emergency recovery'}).error,'invalid_transition');
});
