import {createTableChangeRequest,tableChangeRequestView,decideTableChange,consumeTableChange} from './table-change-policy.mjs';

// Transaction adapter. The store owns PostgreSQL row locking, account ownership,
// database clock, idempotency and audit. No client-supplied origin or timestamps.
export function createTableChangeService({store}={}){
 if(!store||typeof store.transaction!=='function')throw Error('invalid_table_change_store');
 const within=async(operation,handler)=>store.transaction(operation,handler);
 return Object.freeze({
  async request({customerSessionToken}={}){
   if(typeof customerSessionToken!=='string'||!customerSessionToken)throw Error('table_change_unauthorized');
   return within('request',async tx=>{
    const state=await tx.lockCustomerAccount(customerSessionToken);
    if(!state||!state.accountId||!state.tableId||state.closed)throw Error('table_change_account_forbidden');
    const nowMs=await tx.serverNowMs();
    const previous=await tx.latestRequest(state.accountId);
    if(previous&&!tableChangeRequestView(previous,nowMs).canRequestAgain)
     throw Error('table_change_request_locked');
    const windowMs=await tx.configuredWindowMs();
    const request=createTableChangeRequest({sourceTableId:state.tableId,nowMs,windowMs});
    return tx.insertRequest({accountId:state.accountId,customerId:state.customerId,visitId:state.visitId,...request});
   });
  },
  async decide({verifiedIdentity,verifiedStaff,requestId,decision}={}){
   if(!verifiedIdentity||!verifiedStaff||typeof requestId!=='string'||!requestId)
    throw Error('table_change_unauthorized');
   return within('decide',async tx=>{
    const staff=await tx.requireWaiter({verifiedIdentity,verifiedStaff});
    if(!staff||typeof staff.id!=='string'||!staff.id||!['waiter','admin','root'].includes(staff.role))
     throw Error('table_change_unauthorized');
    const request=await tx.lockRequest(requestId);
    if(!request)throw Error('table_change_request_not_found');
    const nowMs=await tx.serverNowMs();
    const next=decideTableChange(request,decision,nowMs);
    return tx.recordDecision({request:next,staffId:staff.id});
   });
  },
  async consumeInOrderTransaction(tx,{accountId,sourceTableId,destinationTableId,orderId}={}){
   if(!tx||!accountId||!orderId||!sourceTableId||!destinationTableId)
    throw Error('invalid_table_change_context');
   const nowMs=await tx.serverNowMs();
   const request=await tx.lockApprovedRequest(accountId);
   if(!request)throw Error('table_change_transfer_forbidden');
   const next=consumeTableChange(request,{sourceTableId,destinationTableId,nowMs});
   // The store must update account binding and pending delivery destinations in
   // the SAME transaction as the confirmed order, or roll everything back.
   await tx.applyTransfer({accountId,orderId,request:next});
   return next;
  }
 });
}
