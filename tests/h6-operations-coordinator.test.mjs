import test from 'node:test';
import assert from 'node:assert/strict';
import {createH6OperationsCoordinator} from '../apps/api/src/h6-operations-coordinator.mjs';

const actorId='a6200000-0000-4000-8000-000000000007';
const roundId='a6200000-0000-4000-8000-000000000101';
const incidentId='a6200000-0000-4000-8000-000000000102';
const verified={verifiedIdentity:{userId:actorId},verifiedStaff:{userId:actorId,role:'waiter'}};
const repository=result=>({
 acknowledgeDispatch:async()=>({state:'acknowledged'}),
 reportIncident:async()=>result,
 resolveIncident:async()=>result,
 managePickup:async()=>({outcome:'updated'}),
 setCatalogSoldOut:async()=>({soldOut:true})
});
const issueCapability=value=>value;

test('economic incident refunds run through the operations coordinator and settle its public state',async()=>{
 let calls=0;
 const coordinator=createH6OperationsCoordinator({
  repository:repository({incidentId,state:'refund_due'}),issueCapability,
  refundEconomicIncident:async value=>{calls++;assert.equal(value,incidentId);return {state:'succeeded'};}
 });
 const reported=await coordinator.reportIncident(verified,{roundId,lineId:null,
  origin:'waiter_restaurant',reason:'No servido',affectedCents:500,
  correlationId:'economic_refund_runtime_0001'});
 assert.equal(reported.state,'resolved');
 const resolved=await coordinator.resolveIncident(verified,{incidentId,resolution:'approve',
  reason:'Aprobado',correlationId:'economic_refund_runtime_0002'});
 assert.equal(resolved.state,'resolved');
 assert.equal(calls,2);
});

test('only an absent economic attempt falls through to the legacy refund owner',async()=>{
 const legacy=createH6OperationsCoordinator({
  repository:repository({incidentId,state:'refund_due'}),issueCapability,
  refundEconomicIncident:async()=>{throw Error('refund_not_found');}
 });
 assert.equal((await legacy.reportIncident(verified,{roundId,lineId:null,
  origin:'waiter_restaurant',reason:'No servido',affectedCents:500,
  correlationId:'legacy_refund_runtime_0001'})).state,'refund_due');

 const unavailable=createH6OperationsCoordinator({
  repository:repository({incidentId,state:'refund_due'}),issueCapability,
  refundEconomicIncident:async()=>{throw Error('stripe_unavailable');}
 });
 await assert.rejects(unavailable.resolveIncident(verified,{incidentId,resolution:'approve',
  reason:'Aprobado',correlationId:'economic_refund_failure_0001'}),/stripe_unavailable/);
});
