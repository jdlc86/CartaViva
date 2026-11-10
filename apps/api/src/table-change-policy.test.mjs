import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_CHANGE_REQUEST_WINDOW_MS,createTableChangeRequest,tableChangeRequestView,decideTableChange,consumeTableChange} from './table-change-policy.mjs';
const request={status:'pending',sourceTableId:'table-1',createdAtMs:1000,expiresAtMs:1000+TABLE_CHANGE_REQUEST_WINDOW_MS};
test('90-second pending window blocks repeated requests and decisions at deadline',()=>{
 assert.equal(tableChangeRequestView(request,1000).remainingSeconds,90);
 assert.equal(tableChangeRequestView(request,90_999).canDecide,true);
 assert.equal(tableChangeRequestView(request,91_000).canDecide,false);
 assert.equal(tableChangeRequestView(request,91_000).canRequestAgain,true);
 assert.throws(()=>decideTableChange(request,'approved',91_000),/not_pending/);
});
test('rejection preserves original cooldown, approval enables one deferred transfer',()=>{
 const rejected=decideTableChange(request,'rejected',2000);
 assert.equal(tableChangeRequestView(rejected,2000).canRequestAgain,false);
 assert.equal(tableChangeRequestView(rejected,91_000).canRequestAgain,true);
 const approved=decideTableChange(request,'approved',2000);
 assert.equal(tableChangeRequestView(approved,999_999).canTransfer,true);
 const moved=consumeTableChange(approved,{sourceTableId:'table-1',destinationTableId:'table-3',nowMs:999_999});
 assert.equal(moved.destinationTableId,'table-3');
 assert.equal(tableChangeRequestView(moved,999_999).canRequestAgain,true);
 assert.equal(tableChangeRequestView(approved,999_999).canRequestAgain,false);
 assert.throws(()=>consumeTableChange(moved,{sourceTableId:'table-1',destinationTableId:'table-4',nowMs:1_000_000}),/forbidden/);
 assert.throws(()=>consumeTableChange(approved,{sourceTableId:'table-1',destinationTableId:'table-1',nowMs:2000}),/forbidden/);
 assert.throws(()=>consumeTableChange(approved,{sourceTableId:'table-2',destinationTableId:'table-3',nowMs:2000}),/origin_conflict/);
});

test('server-side creation validates configurable timeout and clock',()=>{
 const created=createTableChangeRequest({sourceTableId:'table-1',nowMs:1000});
 assert.deepEqual(created,request);
 assert.equal(createTableChangeRequest({sourceTableId:'table-1',nowMs:1000,windowMs:120000}).expiresAtMs,121000);
 assert.throws(()=>createTableChangeRequest({sourceTableId:'table-1',nowMs:1000,windowMs:0}),/invalid_table_change_request/);
 assert.throws(()=>createTableChangeRequest({sourceTableId:'',nowMs:1000}),/invalid_table_change_request/);
});

test('one request per window applies after consumption and staff revocation',()=>{
 const approved=decideTableChange(request,'approved',2000);
 const consumed=consumeTableChange(approved,{
  sourceTableId:'table-1',destinationTableId:'table-2',nowMs:3000
 });
 const revoked={...approved,status:'revoked'};
 for(const prior of [consumed,revoked]){
  assert.equal(tableChangeRequestView(prior,3000).canRequestAgain,false);
  assert.equal(tableChangeRequestView(prior,90_999).canRequestAgain,false);
  assert.equal(tableChangeRequestView(prior,91_000).canRequestAgain,true);
 }
 assert.equal(tableChangeRequestView(approved,91_000).canRequestAgain,false);
});
