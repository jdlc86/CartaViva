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
