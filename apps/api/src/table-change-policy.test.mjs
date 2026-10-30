import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_CHANGE_REQUEST_WINDOW_MS,tableChangeRequestView,decideTableChange,consumeTableChange} from './table-change-policy.mjs';
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
 assert.throws(()=>consumeTableChange(moved,{sourceTableId:'table-1',destinationTableId:'table-4',nowMs:1_000_000}),/forbidden/);
 assert.throws(()=>consumeTableChange(approved,{sourceTableId:'table-1',destinationTableId:'table-1',nowMs:2000}),/forbidden/);
 assert.throws(()=>consumeTableChange(approved,{sourceTableId:'table-2',destinationTableId:'table-3',nowMs:2000}),/origin_conflict/);
});
