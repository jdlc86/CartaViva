import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIncidentOperationAttempts} from '../src/incident-operation-attempts.js';
const incidentId='10000000-0000-4000-8000-000000000001';
const roundId='20000000-0000-4000-8000-000000000002';
const nonces=['40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000005'];
const makeLedger=()=>{let i=0;return createIncidentOperationAttempts({newId:()=>nonces[i++]});};

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
test('incident report reuses identity after uncertainty and rotates only after confirmed result',async()=>{
 const attempts=makeLedger(),ids=[];
 const run=fail=>attempts.run({kind:'report',subjectId:roundId,
  payload:{origin:'waiter_restaurant',reason:'plato no servido',affectedCents:300,lineId:null},
  invoke:async id=>{ids.push(id);if(fail)throw Error('network');return {incidentId,state:'adjusted'};},
  validateResult:result=>result.incidentId===incidentId});
 await assert.rejects(run(true),/network/);
 await run(false);
 assert.equal(ids[0],ids[1]);
 await run(false);
 assert.notEqual(ids[1],ids[2]);
});
test('orders view keeps incident idempotency without handling external money',()=>{
 const view=readFileSync(new URL('../src/views/OrdersView.tsx',import.meta.url),'utf8');
 for(const kind of ["kind:'report'","kind:'resolve'"])assert.ok(view.includes(kind));
 assert.doesNotMatch(view,/kind:'refund'|refundCash|cash_refund_due|entrega.*efectivo/i);
 assert.match(view,/incidentAttempts\.current\.run/);
});
