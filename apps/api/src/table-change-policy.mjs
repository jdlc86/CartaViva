// Pure transition rules for the Sabora table-change request lifecycle.
// This module is deliberately independent of persistence: the server must enforce
// expiry, locking, authentication and idempotency inside a PostgreSQL transaction.
export const TABLE_CHANGE_REQUEST_WINDOW_MS=90_000;
export const TABLE_CHANGE_STATUS=Object.freeze({
 PENDING:'pending',APPROVED:'approved',REJECTED:'rejected',EXPIRED:'expired',CONSUMED:'consumed',REVOKED:'revoked'
});
const finiteTime=value=>Number.isSafeInteger(value)&&value>=0;
const statuses=new Set(Object.values(TABLE_CHANGE_STATUS));
function assertRequest(request){
 if(!request||typeof request!=='object'||!statuses.has(request.status)||
  !finiteTime(request.createdAtMs)||!finiteTime(request.expiresAtMs)||
  request.expiresAtMs<=request.createdAtMs)throw Error('invalid_table_change_request');
}
export function createTableChangeRequest({sourceTableId,nowMs,windowMs=TABLE_CHANGE_REQUEST_WINDOW_MS}) {
 if(typeof sourceTableId!=='string'||!sourceTableId||!finiteTime(nowMs)||
 !Number.isSafeInteger(windowMs)||windowMs<1000||windowMs>600000||
 !Number.isSafeInteger(nowMs+windowMs))throw Error('invalid_table_change_request');
 return Object.freeze({status:'pending',sourceTableId,createdAtMs:nowMs,expiresAtMs:nowMs+windowMs});
}

export function tableChangeRequestView(request,nowMs){
 assertRequest(request);
 if(!finiteTime(nowMs))throw Error('invalid_table_change_clock');
 const remainingMs=Math.max(0,request.expiresAtMs-nowMs);
 const expired=request.status==='pending'&&remainingMs===0;
 return Object.freeze({
  status:expired?'expired':request.status,
  remainingSeconds:Math.ceil(remainingMs/1000),
  canRequestAgain:request.status==='consumed'||(remainingMs===0&&request.status!=='approved'),
  canDecide:request.status==='pending'&&remainingMs>0,
  canTransfer:request.status==='approved'
 });
}
export function decideTableChange(request,decision,nowMs){
 const view=tableChangeRequestView(request,nowMs);
 if(!['approved','rejected'].includes(decision))throw Error('invalid_table_change_decision');
 if(!view.canDecide)throw Error('table_change_request_not_pending');
 return Object.freeze({...request,status:decision,decidedAtMs:nowMs});
}
export function consumeTableChange(request,{sourceTableId,destinationTableId,nowMs}){
 const view=tableChangeRequestView(request,nowMs);
 if(!view.canTransfer||typeof sourceTableId!=='string'||!sourceTableId||
  typeof destinationTableId!=='string'||!destinationTableId||
  sourceTableId===destinationTableId)throw Error('table_change_transfer_forbidden');
 if(request.sourceTableId!==sourceTableId)throw Error('table_change_origin_conflict');
 return Object.freeze({...request,status:'consumed',destinationTableId,consumedAtMs:nowMs});
}
