import test from 'node:test';
import assert from 'node:assert/strict';
import {planHistoricalContactReconciliation} from '../apps/api/src/staff-contact-reconciliation-plan.mjs';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const row=(enrollmentId,state,hasVerifiedContact)=>({enrollmentId,state,hasVerifiedContact});
test('offline inventory identifies only missing non-revoked contacts',()=>{
 const result=planHistoricalContactReconciliation([row(a,'active',false),row(b,'revoked',false),row(c,'invited',true)]);
 assert.deepEqual(result.summary,{alreadyVerified:1,pendingVerification:1,revoked:1});
 assert.deepEqual(result.pending,[{enrollmentId:a,action:'authorized_verification_required'}]);
 assert.equal(JSON.stringify(result).includes('@'),false);
});
test('reconciliation planning does not mutate inputs',()=>{
 const input=[row(a,'suspended',false)];
 const snapshot=JSON.stringify(input);
 planHistoricalContactReconciliation(input);
 assert.equal(JSON.stringify(input),snapshot);
});
test('rejects duplicate identities and unknown states',()=>{
 assert.throws(()=>planHistoricalContactReconciliation([row(a,'active',false),row(a,'active',true)]),/duplicate/);
 assert.throws(()=>planHistoricalContactReconciliation([row(a,'deleted',false)]),/invalid/);
});
test('rejects personal contact fields and arbitrary payloads',()=>{
 assert.throws(()=>planHistoricalContactReconciliation([{...row(a,'active',false),email:'person@example.test'}]),/invalid/);
 assert.throws(()=>planHistoricalContactReconciliation([row(a,'active','false')]),/invalid/);
 assert.throws(()=>planHistoricalContactReconciliation({rows:[]}),/invalid/);
});
test('empty inventory has no actions',()=>{
 assert.deepEqual(planHistoricalContactReconciliation([]).pending,[]);
});

test('inventory is explicitly non-executable and cannot authorize delivery',()=>{
 const result=planHistoricalContactReconciliation([row(a,'active',false)]);
 assert.equal(result.mode,'offline_review_only');
 assert.equal(result.writesAuthorized,false);
 assert.equal(result.deliveryAuthorized,false);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.pending),true);
 assert.equal(Object.isFrozen(result.pending[0]),true);
});
