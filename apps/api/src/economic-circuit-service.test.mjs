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
 requestCapture:async()=>({providerIntentId:'pi_12345678',captureKey:'h6_capture_economic_12345678'}),
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
   providerIntentId:'pi_12345678',captureKey:'h6_capture_economic_12345678'};},
  recordCapture:async value=>{calls.push(['capture-record',value]);return {state:'stripe_captured'};}
 }),stripe:{
  authorize:async value=>{calls.push(['stripe-authorize',value]);return {
   outcome:'authorized',providerIntentId:'pi_12345678',captureBefore:new Date('2026-11-20T00:00:00Z')};},
  capture:async value=>{calls.push(['stripe-capture',value]);return {
   outcome:'captured',providerChargeId:'ch_12345678'};},refund:async()=>{throw Error('unused');}
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
  capture:async()=>{captures++;return {outcome:'captured',providerChargeId:'ch_12345678'};},
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
