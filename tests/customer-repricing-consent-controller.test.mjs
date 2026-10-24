import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepricingConsentController,parseRepricingChallenge} from '../packages/customer-consent/src/repricing-consent.mjs';
const now=1792600000000;
const token='v1.1792600300000.'+'a'.repeat(64)+'.'+'b'.repeat(64);
const response={error:'acceptance_required',repricing:{
 schemaVersion:1,previousTotalCents:1000,currentTotalCents:900,differenceCents:-100,
 previousPublishedRevision:1,currentPublishedRevision:2,
 acceptanceToken:token,expiresAt:now+300000
}};
const request={requestKey:'request-001',basketId:'basket-1'};
test('a lower price and changed revision still require deliberate consent',async()=>{
 const calls=[];
 const c=createRepricingConsentController({clock:()=>now,submit:async body=>{
  calls.push(body);return {status:'confirmed',orderId:'order-1'};
 }});
 assert.equal(c.status,'idle');
 assert.equal(c.present(response,request).differenceCents,-100);
 assert.equal(c.status,'awaiting_explicit_acceptance');
 assert.equal(c.comparison.acceptanceToken,undefined);
 assert.equal(calls.length,0);
 const result=await c.accept();
 assert.equal(result.status,'confirmed');
 assert.deepEqual(calls,[{...request,acceptanceToken:token}]);
 assert.equal(c.status,'idle');
 await assert.rejects(c.accept(),/not_pending/);
});
test('decline never submits and expired consent fails closed',async()=>{
 let calls=0;
 let current=now;
 const c=createRepricingConsentController({clock:()=>current,submit:async()=>{calls++;}});
 c.present(response,request);c.decline();
 await assert.rejects(c.accept(),/not_pending/);
 c.present(response,request);current=now+300000;
 await assert.rejects(c.accept(),/expired/);
 assert.equal(calls,0);
});
test('malformed, expired, inconsistent or extra-field challenges are rejected',()=>{
 const changes=[
  {differenceCents:100},
  {expiresAt:now},
  {acceptanceToken:'forged'},
  {currentPublishedRevision:1},
  {privateEvidence:'secret'}
 ];
 for(const change of changes)
  assert.throws(()=>parseRepricingChallenge({error:'acceptance_required',
   repricing:{...response.repricing,...change}},{nowMs:now}),/invalid_repricing_challenge/);
});
test('double-click cannot send consent twice while request is in flight',async()=>{
 let resolve;
 const calls=[];
 const c=createRepricingConsentController({clock:()=>now,submit:body=>{
  calls.push(body);return new Promise(r=>{resolve=r;});
 }});
 c.present(response,request);
 const first=c.accept();
 await assert.rejects(c.accept(),/in_flight/);
 resolve({status:'confirmed'});
 await first;
 assert.equal(calls.length,1);
});
test('second price change requires a second explicit acceptance',async()=>{
 let calls=0;
 const c=createRepricingConsentController({clock:()=>now,submit:async()=>{
  calls++;
  return calls===1?response:{status:'confirmed'};
 }});
 c.present(response,request);
 const first=await c.accept();
 assert.equal(first.error,'acceptance_required');
 assert.equal(c.status,'awaiting_explicit_acceptance');
 assert.equal(calls,1);
 await c.accept();
 assert.equal(calls,2);
});
