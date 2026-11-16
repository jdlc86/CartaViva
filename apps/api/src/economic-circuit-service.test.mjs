import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomicCircuitService} from './economic-circuit-service.mjs';
import {StripeAmbiguousResultError} from './h6-stripe-adapter.mjs';

const intentId='e6100000-0000-4000-8000-000000000001';
const refundAttemptId='e6100000-0000-4000-8000-000000000002';
const base={channel:'stripe',intentId,amountCents:2200,
 authorizationKey:'h6_auth_e6100000_0000_4000_8000_000000000001'};

const repository=overrides=>({
 recordAuthorization:async value=>value,
 requestCapture:async()=>({providerIntentId:'pi_12345678',captureKey:'h6_capture_economic_12345678',amountCents:2200}),
 recordCapture:async value=>value,
 requestRefund:async()=>({action:'done',repeated:true}),
 recordRefund:async value=>value,
 ...overrides
});

test('economic Stripe capture advances only from durable state and keeps provider keys',async()=>{
 const calls=[];
 const service=createEconomicCircuitService({repository:repository({
  recordAuthorization:async value=>{calls.push(['authorization',value]);return {state:'stripe_authorized'};},
  requestCapture:async value=>{calls.push(['capture-request',value]);return {
   providerIntentId:'pi_12345678',captureKey:'h6_capture_economic_12345678',amountCents:2200};},
  recordCapture:async value=>{calls.push(['capture-record',value]);return {state:'stripe_captured'};}
 }),stripe:{
  authorize:async value=>{calls.push(['stripe-authorize',value]);return {
   outcome:'authorized',providerIntentId:'pi_12345678',captureBefore:new Date('2026-11-20T00:00:00Z'),
    amountCents:2200,currency:'eur'};},
  capture:async value=>{calls.push(['stripe-capture',value]);return {
   outcome:'captured',providerIntentId:'pi_12345678',providerChargeId:'ch_12345678',
    amountCents:2200,currency:'eur'};},refund:async()=>{throw Error('unused');}
 }});
 assert.equal((await service.authorizeAndCapture({...base,state:'stripe_authorization_requested'})).state,
  'stripe_captured');
 assert.deepEqual(calls.find(([kind])=>kind==='stripe-capture')[1],{
  providerIntentId:'pi_12345678',idempotencyKey:'h6_capture_economic_12345678'});
});

test('economic Stripe retries capture_unknown without creating another authorization',async()=>{
 let authorizations=0,captures=0;
 const service=createEconomicCircuitService({repository:repository({}),stripe:{
  authorize:async()=>{authorizations++;throw Error('unexpected_authorization');},
  capture:async()=>{captures++;return {outcome:'captured',providerIntentId:'pi_12345678',providerChargeId:'ch_12345678',
    amountCents:2200,currency:'eur'};},
  refund:async()=>{throw Error('unused');}
 }});
 assert.equal((await service.authorizeAndCapture({...base,state:'stripe_capture_unknown'})).outcome,'captured');
 assert.equal(authorizations,0);
 assert.equal(captures,1);
});

test('ambiguous authorization and refund become durable unknown, never invented success',async()=>{
 const records=[];
 const service=createEconomicCircuitService({repository:repository({
  recordAuthorization:async value=>{records.push(value);return value;},
  requestRefund:async()=>({action:'refund',refund_attempt_id:refundAttemptId,
   provider_charge_id:'ch_12345678',amount_cents:800,idempotency_key:'h6_refund_economic_12345678'}),
  recordRefund:async value=>{records.push(value);return value;}
 }),stripe:{authorize:async()=>{throw new StripeAmbiguousResultError();},
  capture:async()=>{throw Error('unused');},refund:async()=>{throw new StripeAmbiguousResultError();}}});
 assert.equal((await service.authorizeAndCapture({...base,state:'stripe_authorization_requested'})).outcome,'unknown');
 assert.equal((await service.refundIncident('e6100000-0000-4000-8000-000000000003')).outcome,'unknown');
 assert.equal(records[0].errorCode,'provider_result_ambiguous');
 assert.equal(records[1].errorCode,'provider_result_ambiguous');
});

test('terminal failed Stripe intent is not charged again',async()=>{
 let calls=0;
 const service=createEconomicCircuitService({repository:repository({}),stripe:{
  authorize:async()=>{calls++;},capture:async()=>{calls++;},refund:async()=>{calls++;}
 }});
 const failed={...base,state:'stripe_failed'};
 assert.equal(await service.authorizeAndCapture(failed),failed);
 assert.equal(calls,0);
});

test('economic Stripe rejects mismatched authorizations before any provider capture',async()=>{
 for(const changed of [{amountCents:1000},{currency:'usd'},{amountCents:undefined}]){
  const records=[];let captures=0;
  const svc=createEconomicCircuitService({repository:repository({
   recordAuthorization:async value=>{records.push(value);return value;}
  }),stripe:{authorize:async()=>({outcome:'authorized',providerIntentId:'pi_12345678',
    amountCents:2200,currency:'eur',captureBefore:new Date('2026-11-20T00:00:00Z'),...changed}),
   capture:async()=>{captures++;throw Error('must_not_capture');},refund:async()=>{throw Error('unused');}}});
  const result=await svc.authorizeAndCapture({...base,state:'stripe_authorization_requested'});
  assert.equal(result.outcome,'unknown');assert.equal(captures,0);
  assert.equal(records[0].errorCode,'provider_money_mismatch');
 }
});

test('economic Stripe capture is fail-closed for amount, currency and provider intent drift',async()=>{
 for(const changed of [{amountCents:1000},{currency:'usd'},{amountCents:undefined},
  {providerIntentId:'pi_other1111'}]){
  const records=[];
  const svc=createEconomicCircuitService({repository:repository({
   recordCapture:async value=>{records.push(value);return value;}
  }),stripe:{authorize:async()=>{throw Error('unused');},
   capture:async()=>({outcome:'captured',providerIntentId:'pi_12345678',
    providerChargeId:'ch_12345678',amountCents:2200,currency:'eur',...changed}),
   refund:async()=>{throw Error('unused');}}});
  const result=await svc.authorizeAndCapture({...base,state:'stripe_capture_unknown'});
  assert.equal(result.outcome,'unknown');assert.equal(result.providerAmountCents,null);
  assert.equal(result.providerChargeId,null);
  assert.equal(records.length,1);
 }
});

test('economic Stripe refund requires exact original charge, amount and currency',async()=>{
 const request={action:'refund',refund_attempt_id:refundAttemptId,
  provider_charge_id:'ch_12345678',amount_cents:800,idempotency_key:'h6_refund_economic_12345678'};
 for(const changed of [{amountCents:100},{providerChargeId:'ch_other1111'},
  {currency:'usd'},{amountCents:undefined}]){
  const svc=createEconomicCircuitService({repository:repository({
   requestRefund:async()=>request,recordRefund:async value=>value
  }),stripe:{authorize:async()=>{throw Error('unused');},
   capture:async()=>{throw Error('unused');},
   refund:async()=>({outcome:'succeeded',providerRefundId:'re_12345678',
    amountCents:800,currency:'eur',providerChargeId:'ch_12345678',...changed})}});
  const value=await svc.refundIncident('e6100000-0000-4000-8000-000000000003');
  assert.equal(value.outcome,'unknown');
  assert.equal(value.providerRefundId,null);
  assert.equal(value.providerAmountCents,null);
 }
 const success=createEconomicCircuitService({repository:repository({
  requestRefund:async()=>request,recordRefund:async value=>value
 }),stripe:{authorize:async()=>{throw Error('unused');},
  capture:async()=>{throw Error('unused');},
  refund:async()=>({outcome:'succeeded',providerRefundId:'re_12345678',
   amountCents:800,currency:'eur',providerChargeId:'ch_12345678'})}});
 const good=await success.refundIncident('e6100000-0000-4000-8000-000000000003');
 assert.equal(good.outcome,'succeeded');assert.equal(good.providerAmountCents,800);
 assert.equal(good.providerChargeId,request.provider_charge_id);
});
