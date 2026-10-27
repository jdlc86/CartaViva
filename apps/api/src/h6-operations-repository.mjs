const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const SIGNATURE=/^[0-9a-f]{64}$/;
const ROLES=new Set(['admin','waiter','kitchen','root']);

export const ACK_DISPATCH_H6_SQL=`SELECT sabora.acknowledge_kitchen_dispatch_h6_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::text) AS result`;
export const REPORT_INCIDENT_H6_SQL=`SELECT sabora.report_h6_incident_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,$8::text,$9::bigint,
 $10::text,$11::bigint,$12::bigint,$13::text) AS result`;
export const RESOLVE_INCIDENT_H6_SQL=`SELECT sabora.resolve_h6_incident_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::text,$7::text,$8::text,
 $9::bigint,$10::bigint,$11::text) AS result`;
export const SETTLE_CASH_H6_SQL=`SELECT sabora.settle_h6_account_cash_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::bigint,$7::text,$8::bigint,$9::bigint,$10::text) AS result`;
export const REFUND_CASH_H6_SQL=`SELECT sabora.refund_h6_cash_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::text) AS result`;
export const READ_STAFF_EVENTS_H6_SQL=`SELECT sabora.read_staff_event_backlog_h6_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::bigint,$10::integer) AS result`;
export const READ_CUSTOMER_EVENTS_H6_SQL=`SELECT sabora.read_customer_event_backlog_h6_candidate(
 $1::bytea,$2::uuid,$3::text,$4::uuid,$5::bigint,$6::integer) AS result`;
export const MANAGE_PICKUP_TASK_H6_SQL=`SELECT sabora.manage_pickup_task_h6_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::uuid,$7::bigint,$8::text,
 $9::bigint,$10::bigint,$11::text) AS result`;

const one=async promise=>{
 const value=await promise,row=value?.rows?.[0];
 if(!value||!Array.isArray(value.rows)||value.rows.length!==1||!row||typeof row.result!=='object'||
    row.result===null||Array.isArray(row.result))throw Error('invalid_h6_sql_result');
 return Object.freeze(row.result);
};
const capability=(value,action,targetId)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||value.action!==action||
    value.targetId?.toLowerCase()!==targetId.toLowerCase()||!UUID.test(value.actorId??'')||
    !ROLES.has(value.staffRole)||!CORRELATION.test(value.correlationId??'')||
    !Number.isSafeInteger(value.issuedAtMs)||!Number.isSafeInteger(value.expiresAtMs)||
    !SIGNATURE.test(value.signatureHex??''))throw Error('invalid_h6_capability');
 return [value.keyId,value.databaseRole,value.actorId,value.staffRole];
};
const tail=value=>[value.correlationId,value.issuedAtMs,value.expiresAtMs,value.signatureHex];
const pickupCapability=(value,action,lineId,expectedVersion)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||value.action!==action||
    value.targetId?.toLowerCase()!==lineId.toLowerCase()||value.expectedVersion!==expectedVersion||
    !UUID.test(value.actorId??'')||!ROLES.has(value.staffRole)||
    !CORRELATION.test(value.correlationId??'')||!Number.isSafeInteger(value.issuedAtMs)||
    !Number.isSafeInteger(value.expiresAtMs)||!SIGNATURE.test(value.signatureHex??''))
  throw Error('invalid_h6_capability');
 return [value.keyId,value.databaseRole,value.actorId,value.staffRole,action,lineId,expectedVersion,
  value.correlationId,value.issuedAtMs,value.expiresAtMs,value.signatureHex];
};

export function createH6OperationsRepository({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_h6_operations_repository');
 return Object.freeze({
  acknowledgeDispatch:({dispatchId,capability:cap}={})=>{
   if(!UUID.test(dispatchId??''))throw Error('invalid_h6_dispatch_request');
   const head=capability(cap,'ack_dispatch',dispatchId);
   return withTransaction(query=>one(query(ACK_DISPATCH_H6_SQL,[...head,dispatchId,...tail(cap)])));
  },
  reportIncident:({roundId,lineId=null,origin,reason,affectedCents,capability:cap}={})=>{
   if(!UUID.test(roundId??'')||(lineId!==null&&!UUID.test(lineId))||
      !['kitchen','waiter_customer','waiter_restaurant'].includes(origin)||
      typeof reason!=='string'||reason.trim().length<1||reason.trim().length>500||
      !Number.isSafeInteger(affectedCents)||affectedCents<0)throw Error('invalid_h6_incident_request');
   const head=capability(cap,'report_incident',roundId);
   return withTransaction(query=>one(query(REPORT_INCIDENT_H6_SQL,[...head,roundId,lineId,origin,
    reason.trim(),affectedCents,...tail(cap)])));
  },
  resolveIncident:({incidentId,resolution,reason,capability:cap}={})=>{
   if(!UUID.test(incidentId??'')||!['approve','reject'].includes(resolution)||
      typeof reason!=='string'||reason.trim().length<1||reason.trim().length>500)
    throw Error('invalid_h6_incident_resolution');
   const head=capability(cap,'resolve_incident',incidentId);
   return withTransaction(query=>one(query(RESOLVE_INCIDENT_H6_SQL,[...head,incidentId,
    resolution,reason.trim(),...tail(cap)])));
  },
  settleCash:({accountId,amountCents,capability:cap}={})=>{
   if(!UUID.test(accountId??'')||!Number.isSafeInteger(amountCents)||amountCents<1)
    throw Error('invalid_h6_cash_settlement');
   const head=capability(cap,'settle_cash',accountId);
   return withTransaction(query=>one(query(SETTLE_CASH_H6_SQL,[...head,accountId,amountCents,...tail(cap)])));
  },
  refundCash:({incidentId,capability:cap}={})=>{
   if(!UUID.test(incidentId??''))throw Error('invalid_h6_cash_refund');
   const head=capability(cap,'refund_cash',incidentId);
   return withTransaction(query=>one(query(REFUND_CASH_H6_SQL,[...head,incidentId,...tail(cap)])));
  },
  managePickup:({lineId,action,expectedVersion,capability:cap}={})=>{
   if(!UUID.test(lineId??'')||!['claim_pickup','cancel_pickup','correct_ready'].includes(action)||
      !Number.isSafeInteger(expectedVersion)||expectedVersion<1)
    throw Error('invalid_pickup_operation');
   const values=pickupCapability(cap,action,lineId,expectedVersion);
   return withTransaction(query=>one(query(MANAGE_PICKUP_TASK_H6_SQL,values)));
  },
  readStaffEvents:({afterCursor=0,limit=100,capability:cap}={})=>{
   if(!Number.isSafeInteger(afterCursor)||afterCursor<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
    throw Error('invalid_h6_event_cursor');
   const head=capability(cap,'read_events',cap.actorId);
   return withTransaction(query=>one(query(READ_STAFF_EVENTS_H6_SQL,[...head,...tail(cap),afterCursor,limit])));
  }
 });
}

export function createH6CustomerEventRepository({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_h6_customer_event_repository');
 return Object.freeze({read:({sessionHash,tableId,visitId,accountId,afterCursor=0,limit=100}={})=>{
  if(!Buffer.isBuffer(sessionHash)||sessionHash.length!==32||!UUID.test(tableId??'')||
     !CORRELATION.test(visitId??'')||!UUID.test(accountId??'')||
     !Number.isSafeInteger(afterCursor)||afterCursor<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
   throw Error('invalid_h6_customer_event_scope');
  return withTransaction(query=>one(query(READ_CUSTOMER_EVENTS_H6_SQL,
   [sessionHash,tableId,visitId,accountId,afterCursor,limit])));
 }});
}
