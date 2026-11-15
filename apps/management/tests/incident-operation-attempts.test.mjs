import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIncidentOperationAttempts} from '../src/incident-operation-attempts.js';
import {createOrderOperationsGateway} from '../src/order-operations-gateway.js';
const incidentId='10000000-0000-4000-8000-000000000001';
const roundId='20000000-0000-4000-8000-000000000002';
const settlementId='30000000-0000-4000-8000-000000000003';
const nonces=['40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005'];
const makeLedger=()=>{let i=0;return createIncidentOperationAttempts({newId:()=>nonces[i++]});};

test('refund via real gateway transport reuses the same key after ambiguous response',async()=>{
 const attempts=makeLedger(),calls=[];
 let fail=true;
 const gateway=createOrderOperationsGateway({send:async(path,init)=>{
  calls.push({path,body:JSON.parse(init.body)});
  if(fail){fail=false;throw Error('response_lost_after_commit');}
  return new Response(JSON.stringify({incidentId,settlementId,state:'resolved',amountCents:300,repeated:true}),
   {status:201,headers:{'content-type':'application/json'}});
 }});
 const operation=()=>attempts.run({kind:'refund',subjectId:incidentId,payload:{amountCents:300},
  invoke:correlationId=>gateway.refundCash({incidentId,correlationId}),
  validateResult:result=>result.incidentId===incidentId&&result.state==='resolved'&&
   result.amountCents===300&&result.settlementId===settlementId});
 await assert.rejects(operation(),/response_lost_after_commit/);
 assert.equal(attempts.pending('refund',incidentId),true);
 const result=await operation();
 assert.equal(result.repeated,true);
 assert.equal(attempts.pending('refund',incidentId),false);
 assert.equal(calls.length,2);
 assert.equal(calls[0].path,'/api/v1/operations/incidents/'+incidentId+'/cash-refund');
 assert.deepEqual(calls[0].body,calls[1].body);
 assert.match(calls[0].body.correlationId,/^ui_cash_refund_/);
});
test('different resolution stays blocked until pending decision is reconciled',async()=>{
 const attempts=makeLedger(),calls=[];
 const fail=async correlationId=>{calls.push(correlationId);throw Error('timeout');};
 await assert.rejects(attempts.run({kind:'resolve',subjectId:incidentId,
  payload:{resolution:'approve',reason:'comprobado'},invoke:fail}),/timeout/);
 await assert.rejects(attempts.run({kind:'resolve',subjectId:incidentId,
  payload:{resolution:'reject',reason:'comprobado'},invoke:fail}),/incident_attempt_requires_reconciliation/);
 await assert.rejects(attempts.run({kind:'resolve',subjectId:incidentId,
  payload:{resolution:'approve',reason:'comprobado'},invoke:fail}),/timeout/);
 assert.equal(calls.length,2);
 assert.equal(calls[0],calls[1]);
 assert.equal(attempts.pending('resolve',incidentId),true);
});
test('unverifiable cash refund response never clears original request identity',async()=>{
 const attempts=makeLedger(),ids=[];
 const run=receipt=>attempts.run({kind:'refund',subjectId:incidentId,payload:{amountCents:300},
  invoke:async id=>{ids.push(id);return receipt;},
  validateResult:result=>result.incidentId===incidentId&&result.state==='resolved'&&
    result.amountCents===300&&result.settlementId===settlementId});
 await assert.rejects(run({incidentId,state:'resolved',amountCents:200,settlementId}),/receipt_unverified/);
 assert.equal(attempts.pending('refund',incidentId),true);
 await run({incidentId,state:'resolved',amountCents:300,settlementId});
 assert.equal(ids[0],ids[1]);
 assert.equal(attempts.pending('refund',incidentId),false);
});
test('incident report reuses identity after uncertainty and rotates only after confirmed result',async()=>{
 const attempts=makeLedger(),ids=[];
 const run=fail=>attempts.run({kind:'report',subjectId:roundId,
  payload:{origin:'waiter_restaurant',reason:'plato no servido',affectedCents:300,lineId:null},
  invoke:async id=>{ids.push(id);if(fail)throw Error('network');return {incidentId,state:'cash_refund_due'};},
  validateResult:result=>result.incidentId===incidentId});
 await assert.rejects(run(true),/network/);
 await run(false);
 assert.equal(ids[0],ids[1]);
 await run(false);
 assert.notEqual(ids[1],ids[2]);
});
test('orders view enforces confirmed physical handover before recording cash refund',()=>{
 const view=readFileSync(new URL('../src/views/OrdersView.tsx',import.meta.url),'utf8');
 assert.match(view,/refundAcknowledgments\.has\(incidentId\)/);
 assert.match(view,/Confirmo que el efectivo se ha devuelto físicamente/);
 assert.match(view,/disabled=\{Boolean\(pendingOperation\)\|\|!refundAcknowledgments\.has\(id\)\}/);
 for(const kind of ["kind:'report'","kind:'resolve'","kind:'refund'"])assert.ok(view.includes(kind));
 assert.match(view,/incidentAttempts\.current\.run/);
 assert.match(view,/seen\.has\(id\)/);
});
