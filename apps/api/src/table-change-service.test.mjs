import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableChangeService} from './table-change-service.mjs';

const base={accountId:'a1',customerId:'c1',visitId:'v1',tableId:'t1',closed:false};
test('request uses locked account, server time and configured window without destination',async()=>{
 let inserted;
 const tx={lockCustomerAccount:async()=>base,serverNowMs:async()=>1000,
  latestRequest:async()=>null,configuredWindowMs:async()=>90000,
  insertRequest:async value=>(inserted=value)};
 const service=createTableChangeService({store:{transaction:async(_,run)=>run(tx)}});
 await service.request({customerSessionToken:'secret'});
 assert.equal(inserted.sourceTableId,'t1');
 assert.equal(inserted.expiresAtMs,91000);
 assert.equal(Object.hasOwn(inserted,'destinationTableId'),false);
});
test('rejecting within 90 seconds does not allow immediate repeat',async()=>{
 const previous={status:'rejected',sourceTableId:'t1',createdAtMs:1000,expiresAtMs:91000};
 const tx={lockCustomerAccount:async()=>base,serverNowMs:async()=>2000,
  latestRequest:async()=>previous};
 const service=createTableChangeService({store:{transaction:async(_,run)=>run(tx)}});
 await assert.rejects(()=>service.request({customerSessionToken:'secret'}),/request_locked/);
});
test('transfer requires approved authorization and delegates atomic application',async()=>{
 let applied;
 const approved={status:'approved',sourceTableId:'t1',createdAtMs:1000,expiresAtMs:91000};
 const tx={serverNowMs:async()=>200000,lockApprovedRequest:async()=>approved,
  applyTransfer:async value=>{applied=value;}};
 const service=createTableChangeService({store:{transaction:async(_,run)=>run(tx)}});
 const result=await service.consumeInOrderTransaction(tx,{accountId:'a1',sourceTableId:'t1',
  destinationTableId:'t2',orderId:'o1'});
 assert.equal(result.status,'consumed');
 assert.equal(applied.request.destinationTableId,'t2');
 assert.equal(applied.orderId,'o1');
});

test('decision after server deadline is rejected even if waiter acts late',async()=>{
 const pending={status:'pending',sourceTableId:'t1',createdAtMs:1000,expiresAtMs:91000};
 let written=false;
 const tx={requireWaiter:async()=>({id:'w1',role:'waiter'}),lockRequest:async()=>pending,
  serverNowMs:async()=>91000,recordDecision:async()=>{written=true;}};
 const service=createTableChangeService({store:{transaction:async(_,run)=>run(tx)}});
 await assert.rejects(()=>service.decide({verifiedIdentity:{id:'w1'},verifiedStaff:{role:'waiter'},requestId:'r1',decision:'approved'}),
  /table_change_request_not_pending/);
 assert.equal(written,false);
});
test('an approved grant never transfers on approval alone',async()=>{
 const pending={status:'pending',sourceTableId:'t1',createdAtMs:1000,expiresAtMs:91000};
 let transferCalled=false;
 const tx={requireWaiter:async()=>({id:'w1',role:'waiter'}),lockRequest:async()=>pending,
  serverNowMs:async()=>5000,recordDecision:async value=>value,
  applyTransfer:async()=>{transferCalled=true;}};
 const service=createTableChangeService({store:{transaction:async(_,run)=>run(tx)}});
 const outcome=await service.decide({verifiedIdentity:{id:'w1'},verifiedStaff:{role:'waiter'},requestId:'r1',decision:'approved'});
 assert.equal(outcome.request.status,'approved');
 assert.equal(transferCalled,false);
});

test('decision rejects an identity without an authorized staff role',async()=>{
 let read=false;
 const tx={requireWaiter:async()=>({id:'w1',role:'kitchen'}),
  lockRequest:async()=>{read=true;return null;}};
 const service=createTableChangeService({store:{transaction:async(_,run)=>run(tx)}});
 await assert.rejects(()=>service.decide({
  verifiedIdentity:{id:'w1'},verifiedStaff:{role:'waiter'},
  requestId:'r1',decision:'approved'
 }),/table_change_unauthorized/);
 assert.equal(read,false);
});
