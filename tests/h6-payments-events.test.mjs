import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createH6StaffCapabilityIssuer} from '../apps/api/src/h6-staff-capability.mjs';
import {createH6StripeAdapter,StripeAmbiguousResultError} from '../apps/api/src/h6-stripe-adapter.mjs';
import {createH6StripeWebhookHandler,verifyH6StripeWebhook} from '../apps/api/src/h6-stripe-webhook.mjs';
import {createH6PaymentOrchestrator} from '../apps/api/src/h6-payment-orchestrator.mjs';
import {createH6CustomerPaymentFlow} from '../apps/api/src/h6-customer-payment-flow.mjs';

const actorId='a6100000-0000-4000-8000-000000000001';
const targetId='a6100000-0000-4000-8000-000000000002';
const orderId='a6100000-0000-4000-8000-000000000003';

test('H6 staff capability binds SQL login, actor, role, action, target and expiry',()=>{
 const secret=Buffer.alloc(32,17),now=Date.UTC(2026,9,27,12,0,0);
 const issue=createH6StaffCapabilityIssuer({keyId:'h6_key_2026',secret,
  databaseRole:'sabora_h6_ci',ttlMs:20_000,clock:()=>now});
 const capability=issue({actorId,staffRole:'kitchen',action:'ack_dispatch',targetId,
  correlationId:'ack_dispatch_0001'});
 const payload=['h6-v1','sabora_h6_ci',actorId,'kitchen','ack_dispatch',targetId,
  'ack_dispatch_0001',String(now),String(now+20_000)].join('\n');
 assert.equal(capability.signatureHex,createHmac('sha256',secret).update(payload).digest('hex'));
 assert.throws(()=>issue({actorId,staffRole:'waiter',action:'ack_dispatch',targetId,
  correlationId:'short'}),/invalid_h6_capability_input/);
});

test('Stripe adapter fixes manual capture and durable idempotency without live credentials',async()=>{
 const calls=[];
 const adapter=createH6StripeAdapter({credential:'sk_test_candidate_not_real_2026',request:async call=>{
  calls.push(call);
  if(call.path.endsWith('/capture'))return {id:'pi_12345678',status:'succeeded',latest_charge:'ch_12345678'};
  return {id:'pi_12345678',status:'requires_capture',latest_charge:{
   id:'ch_12345678',payment_method_details:{card:{capture_before:Date.UTC(2026,10,2)/1000}}
  }};
 }});
 const authorized=await adapter.authorize({orderId,amountCents:2750,
  idempotencyKey:'h6_auth_a6100000_0000_4000_8000_000000000003'});
 assert.equal(authorized.outcome,'authorized');
 assert.equal(calls[0].headers['idempotency-key'],'h6_auth_a6100000_0000_4000_8000_000000000003');
 const form=new URLSearchParams(calls[0].body);
 assert.equal(form.get('capture_method'),'manual');
 assert.equal(form.get('amount'),'2750');
 assert.equal(form.get('currency'),'eur');
 const captured=await adapter.capture({providerIntentId:'pi_12345678',
  idempotencyKey:'h6_capture_a6100000_0000_4000_8000_000000000003'});
 assert.deepEqual(captured,{outcome:'captured',providerChargeId:'ch_12345678'});
 const refundAdapter=createH6StripeAdapter({credential:'sk_test_candidate_not_real_2026',request:async call=>{
  calls.push(call);return {id:'re_12345678',status:'succeeded'};
 }});
 await refundAdapter.refund({refundAttemptId:targetId,providerChargeId:'ch_12345678',amountCents:400,
  idempotencyKey:'h6_refund_a6100000_0000_4000_8000_000000000003'});
 const refundForm=new URLSearchParams(calls.at(-1).body);
 assert.equal(refundForm.get('metadata[sabora_refund_attempt_id]'),targetId);
 assert.throws(()=>createH6StripeAdapter({credential:'sk_live_forbidden_123456',request:async()=>({})}),
  /invalid_h6_stripe_adapter/);
 const uncertain=createH6StripeAdapter({credential:'rk_test_candidate_not_real_2026',
  request:async()=>{throw Error('timeout');}});
 await assert.rejects(uncertain.authorize({orderId,amountCents:1,
  idempotencyKey:'h6_auth_a6100000_0000_4000_8000_000000000003'}),StripeAmbiguousResultError);
});

test('Stripe webhook verifies the unmodified body, age and any valid v1 signature',async()=>{
 const secret='whsec_candidate_0123456789abcdef',timestamp=Math.floor(Date.UTC(2026,9,27,12,0,0)/1000);
 const rawBody=Buffer.from(JSON.stringify({id:'evt_12345678',type:'payment_intent.succeeded',created:timestamp,
  data:{object:{id:'pi_12345678',latest_charge:'ch_12345678'}}}));
 const valid=createHmac('sha256',secret).update(`${timestamp}.`).update(rawBody).digest('hex');
 const verified=verifyH6StripeWebhook({rawBody,signatureHeader:`t=${timestamp},v1=${'0'.repeat(64)},v1=${valid}`,
  secret,nowMs:timestamp*1000});
 assert.equal(verified.eventId,'evt_12345678');
 assert.equal(verified.providerChargeId,'ch_12345678');
 const ingested=[];
 const handler=createH6StripeWebhookHandler({secret,clock:()=>timestamp*1000,
  providerRepository:{ingestWebhook:async event=>{ingested.push(event);return {outcome:'applied'};}}});
 assert.deepEqual(await handler({rawBody,signatureHeader:`t=${timestamp},v1=${valid}`}),{outcome:'applied'});
 assert.equal(ingested.length,1);
 assert.throws(()=>verifyH6StripeWebhook({rawBody:Buffer.from(rawBody.toString().replace('succeeded','canceled')),
  signatureHeader:`t=${timestamp},v1=${valid}`,secret,nowMs:timestamp*1000}),
  /invalid_stripe_webhook_signature/);
 assert.throws(()=>verifyH6StripeWebhook({rawBody,signatureHeader:`t=${timestamp},v1=${valid}`,
  secret,nowMs:(timestamp+301)*1000}),/invalid_stripe_webhook_signature/);
});

test('Stripe capturable webhook preserves the provider authorization deadline',()=>{
 const secret='whsec_candidate_0123456789abcdef',timestamp=Math.floor(Date.UTC(2026,9,27,12,0,0)/1000);
 const deadline=timestamp+6*24*60*60;
 const rawBody=Buffer.from(JSON.stringify({id:'evt_87654321',
  type:'payment_intent.amount_capturable_updated',created:timestamp,data:{object:{id:'pi_87654321',
   latest_charge:{payment_method_details:{card:{capture_before:deadline}}}}}}));
 const valid=createHmac('sha256',secret).update(`${timestamp}.`).update(rawBody).digest('hex');
 const verified=verifyH6StripeWebhook({rawBody,signatureHeader:`t=${timestamp},v1=${valid}`,
  secret,nowMs:timestamp*1000});
 assert.equal(verified.captureBefore.toISOString(),new Date(deadline*1000).toISOString());
});

test('Stripe refund webhook binds provider outcome to the durable refund attempt metadata',()=>{
 const secret='whsec_candidate_0123456789abcdef',timestamp=Math.floor(Date.UTC(2026,9,27,12,0,0)/1000);
 const rawBody=Buffer.from(JSON.stringify({id:'evt_refund123',type:'refund.updated',created:timestamp,
  data:{object:{id:'re_12345678',status:'succeeded',metadata:{sabora_refund_attempt_id:targetId}}}}));
 const valid=createHmac('sha256',secret).update(`${timestamp}.`).update(rawBody).digest('hex');
 const verified=verifyH6StripeWebhook({rawBody,signatureHeader:`t=${timestamp},v1=${valid}`,
  secret,nowMs:timestamp*1000});
 assert.equal(verified.refundAttemptId,targetId);
 assert.equal(verified.refundStatus,'succeeded');
});

test('ambiguous provider results become durable unknown states and block invented success',async()=>{
 const recorded=[];
 const repository={
  async recordAuthorization(value){recorded.push(value);return {payment_state:'authorization_unknown',round_state:'payment_unknown'};},
  async requestCapture(){return {action:'capture',provider_intent_id:'pi_12345678',
   capture_key:'h6_capture_a6100000_0000_4000_8000_000000000003'};},
  async recordCapture(value){recorded.push(value);return {payment_state:'capture_unknown',round_state:'payment_unknown'};},
  async recordCaptureCompensation(){throw Error('unexpected_compensation');},
  async requestRefund(){throw Error('unused');},async recordRefund(){throw Error('unused');},
  async requestRelease(){throw Error('unused');},async recordRelease(){throw Error('unused');}
 };
 const stripe={authorize:async()=>{throw new StripeAmbiguousResultError();},
  capture:async()=>{throw new StripeAmbiguousResultError();},
  retrieve:async()=>{throw new StripeAmbiguousResultError();},release:async()=>{},refund:async()=>{}};
 const payments=createH6PaymentOrchestrator({stripe,repository,clock:()=>Date.UTC(2026,9,27)});
 assert.equal((await payments.authorize({orderId,amountCents:500,
  authorizationKey:'h6_auth_a6100000_0000_4000_8000_000000000003'})).payment_state,
 'authorization_unknown');
 assert.equal(recorded[0].outcome,'unknown');
 assert.equal((await payments.captureOrDispatch({orderId})).payment_state,'capture_unknown');
 assert.equal(recorded[1].outcome,'unknown');
});

test('captured provider result becomes durable compensation when dispatch persistence fails',async()=>{
 const calls=[];
 const repository={
  async recordAuthorization(){throw Error('unused');},
  async requestCapture(){return {action:'capture',provider_intent_id:'pi_12345678',
   capture_key:'h6_capture_a6100000_0000_4000_8000_000000000003'};},
  async recordCapture(){throw Error('database_commit_failed');},
  async recordCaptureCompensation(value){calls.push(value);return {payment_state:'refund_required',
   round_state:'compensation_required',dispatch_state:'compensation_required'};},
  async requestRefund(){throw Error('unused');},async recordRefund(){throw Error('unused');},
  async requestRelease(){throw Error('unused');},async recordRelease(){throw Error('unused');}
 };
 const payments=createH6PaymentOrchestrator({repository,stripe:{authorize:async()=>{},retrieve:async()=>{},
  capture:async()=>({outcome:'captured',providerChargeId:'ch_12345678'}),release:async()=>{},refund:async()=>{}}});
 const result=await payments.captureOrDispatch({orderId});
 assert.equal(result.round_state,'compensation_required');
 assert.deepEqual(calls,[{orderId,providerChargeId:'ch_12345678',errorCode:'dispatch_persistence_failed'}]);
});

test('point reconciliation does not invent a capture and permits only same-key retry',async()=>{
 const recorded=[];
 const repository={
  async recordAuthorization(value){recorded.push(value);return {payment_state:'authorized'};},
  async requestCapture(){throw Error('unused');},async recordCapture(value){recorded.push(value);return value;},
  async recordCaptureCompensation(value){recorded.push(value);return value;},
  async requestRefund(){throw Error('unused');},async recordRefund(){throw Error('unused');},
  async requestRelease(){throw Error('unused');},async recordRelease(){throw Error('unused');}
 };
 const stripe={authorize:async()=>{},capture:async()=>{},retrieve:async()=>({outcome:'authorized',
  providerIntentId:'pi_12345678',captureBefore:new Date(Date.UTC(2026,10,2))}),
  release:async()=>{},refund:async()=>{}};
 const payments=createH6PaymentOrchestrator({stripe,repository});
 assert.deepEqual(await payments.reconcile({orderId,providerIntentId:'pi_12345678',phase:'capture'}),
  {state:'capture_retry_safe',retryAllowed:true});
 assert.equal(recorded.length,0);
 assert.equal((await payments.reconcile({orderId,providerIntentId:'pi_12345678',
  phase:'authorization'})).payment_state,'authorized');
 assert.equal(recorded[0].outcome,'authorized');
});

test('refund and authorization release use only durable database idempotency keys',async()=>{
 const recorded=[];
 const repository={
  async recordAuthorization(){},async requestCapture(){},async recordCapture(){},
  async recordCaptureCompensation(){},
  async requestRefund(){return {action:'refund',provider_charge_id:'ch_12345678',amount_cents:400,
   idempotency_key:'h6_refund_a6100000_0000_4000_8000_000000000003'};},
  async recordRefund(value){recorded.push(value);return {state:'succeeded'};},
  async requestRelease(){return {action:'release',provider_intent_id:'pi_12345678',
   idempotency_key:'h6_release_a6100000_0000_4000_8000_000000000003'};},
  async recordRelease(value){recorded.push(value);return {payment_state:'released'};}
 };
 const calls=[];
 const stripe={authorize:async()=>{},capture:async()=>{},retrieve:async()=>{},
  refund:async value=>{calls.push(value);return {outcome:'succeeded',providerRefundId:'re_12345678'};},
  release:async value=>{calls.push(value);return {outcome:'released'};}};
 const payments=createH6PaymentOrchestrator({stripe,repository});
 assert.equal((await payments.refund({refundAttemptId:targetId})).state,'succeeded');
 assert.equal((await payments.release({orderId})).payment_state,'released');
 assert.equal(calls[0].idempotencyKey,'h6_refund_a6100000_0000_4000_8000_000000000003');
 assert.equal(calls[1].idempotencyKey,'h6_release_a6100000_0000_4000_8000_000000000003');
 assert.deepEqual(recorded.map(value=>value.outcome),['succeeded','released']);
});

test('customer payment wrapper authorizes only an H6 pay-now round that awaits authorization',async()=>{
 let authorizations=0;
 const base={authorizeVisit:async()=>({}),quote:async()=>({}),confirm:async input=>({
  status:'confirmed',orderId,accountId:actorId,roundId:targetId,amountCents:900,
  paymentMode:input.paymentMode,roundState:input.paymentMode==='pay_now'?'awaiting_authorization':'grouping',
  paymentAttemptId:'a6100000-0000-4000-8000-000000000004',
  authorizationKey:'h6_auth_a6100000_0000_4000_8000_000000000003'
 })};
 const wrapped=createH6CustomerPaymentFlow({flow:base,payments:{authorize:async()=>{
  authorizations+=1;return {payment_state:'authorized',round_state:'grouping'};
 }}});
 assert.equal((await wrapped.confirm({paymentMode:'pay_now'})).paymentState,'authorized');
 assert.equal((await wrapped.confirm({paymentMode:'pay_at_end'})).roundState,'grouping');
 assert.equal(authorizations,1);
});
