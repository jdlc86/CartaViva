import assert from 'node:assert/strict';
import test from 'node:test';
import {createStaffInvitationResendSender} from './staff-invitation-resend.mjs';
import {dispatchStaffInvitation} from './staff-invitation-dispatch-guard.mjs';
import {recordStaffInvitationDeliveryOutcome} from './staff-invitation-delivery-outcome-candidate.mjs';

const origin='https://gestion.sabora.test';
const jobId='cbeb2d1d-fd43-4dc7-870d-27ec4e177da8';
const enrollmentId='1bbda0ac-18fd-4148-b9a4-3e565e6c8526';
const fence='48aac1d2-a059-49ce-8eec-0a5262e9851f';
const providerId='dbec97f1-e3ad-464c-aacf-2c4cddd9b272';
const hash='6'.repeat(64);
const delivery={authorized:true,recipient:'ficticio@demo.test',
 enrollmentUrl:origin+'/#enrolamiento?token=fixture'};
const settings={managementOrigin:origin,from:'sab@example.test',apiKey:'re_only_isolated_fixture'};

test('Resend dispatch calls the fixed endpoint once per authorized fence and records provider acceptance',async()=>{
 let state='claimed';const requests=[];
 const withTransaction=work=>work(null);
 const repository={
  lockClaimedDelivery:async()=>state==='claimed'?{
   job:{enrollmentId,inviteVersion:1,inviteTokenHashHex:hash},
   enrollment:{id:enrollmentId,state:'invited',inviteVersion:1,inviteTokenHashHex:hash}
  }:null,
  authorizeDispatch:async()=>{state='dispatching';return {authorized:true};},
  lockDispatchingDelivery:async()=>state==='dispatching'?{}:null,
  finishDispatchingDelivery:async(_query,_id,_fence,next,outcome,receiptId)=>{
   assert.equal(receiptId,providerId);
   assert.equal(outcome,'accepted');state=next;return {finished:true};
  }
 };
 const send=createStaffInvitationResendSender({...settings,fetchImpl:async(url,options)=>{
  assert.equal(state,'dispatching');
  requests.push({url,options});
  return Response.json({id:providerId});
 }});
 const input={withTransaction,repository,jobId,fence,send,
  readDelivery:async()=>delivery,
  recordOutcome:input=>recordStaffInvitationDeliveryOutcome({withTransaction,repository,...input})};
 assert.deepEqual(await dispatchStaffInvitation(input),
  {recorded:true,state:'delivered',retryable:false,ambiguous:false});
 assert.deepEqual(await dispatchStaffInvitation(input),{authorized:false,reason:'claim_not_found'});
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'https://api.resend.com/emails');
 assert.equal(requests[0].options.redirect,'error');
 assert.equal(requests[0].options.headers['Idempotency-Key'],'sabora-staff-invitation/'+jobId);
 assert.deepEqual(JSON.parse(requests[0].options.body).to,[delivery.recipient]);
});

test('Resend uncertainty returns unknown and credentials are not forwarded on bad enrollment URLs',async()=>{
 let calls=0;
 const send=createStaffInvitationResendSender({...settings,fetchImpl:async()=>{
  calls++;return Response.json({name:'concurrent_idempotent_requests'},{status:409});
 }});
 await assert.rejects(send({...delivery,jobId,enrollmentUrl:'https://other.test/#enrolamiento?token=fixture'}),
  /invalid_staff_resend_delivery/);
 assert.equal(calls,0);
 assert.deepEqual(await send({...delivery,jobId}),{outcome:'unknown'});
 assert.equal(calls,1);
});
