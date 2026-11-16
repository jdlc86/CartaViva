import {randomUUID} from 'node:crypto';
import {hashCustomerSessionToken} from './customer-session.mjs';

export const READ_ECONOMIC_CONSUMPTION_SQL=`SELECT sabora.read_customer_economic_consumption_candidate(
 $1::bytea,$2::uuid,$3::text) AS result`;
export const CREATE_ECONOMIC_SETTLEMENT_SQL=`SELECT sabora.create_customer_economic_settlement_candidate(
 $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb) AS result`;
export const RECORD_ECONOMIC_AUTHORIZATION_SQL=`SELECT sabora.record_economic_stripe_authorization_candidate(
 $1::uuid,$2::text,$3::text,$4::timestamptz,$5::text) AS result`;
export const REQUEST_ECONOMIC_CAPTURE_SQL=`SELECT sabora.request_economic_stripe_capture_candidate($1::uuid) AS result`;
export const RECORD_ECONOMIC_CAPTURE_SQL=`SELECT sabora.record_economic_stripe_capture_candidate(
 $1::uuid,$2::text,$3::text,$4::text,$5::bigint,$6::text) AS result`;
export const REQUEST_ECONOMIC_REFUND_SQL=`SELECT refund_attempt_id,provider_charge_id,amount_cents,
 idempotency_key,action,repeated FROM sabora.request_economic_stripe_refund_candidate($1::uuid)`;
export const RECORD_ECONOMIC_REFUND_SQL=`SELECT sabora.record_economic_stripe_refund_candidate(
 $1::uuid,$2::text,$3::text,$4::text,$5::bigint,$6::text,$7::text) AS result`;
export const READ_STAFF_ECONOMIC_ACCOUNTS_SQL=`SELECT sabora.read_staff_economic_accounts_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text) AS result`;
export const VERIFY_EXTERNAL_SETTLEMENT_SQL=`SELECT sabora.verify_external_settlement_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::text) AS result`;
export const CLOSE_ECONOMIC_TABLE_SQL=`SELECT sabora.close_economic_table_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,$8::bigint,$9::bigint,$10::text) AS result`;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const one=async promise=>{
 const rows=(await promise)?.rows;
 if(!Array.isArray(rows)||rows.length!==1||!plain(rows[0]?.result))
  throw Error('invalid_economic_sql_result');
 return Object.freeze(rows[0].result);
};
const oneRow=async promise=>{
 const rows=(await promise)?.rows;
 if(!Array.isArray(rows)||rows.length!==1||!plain(rows[0]))throw Error('invalid_economic_sql_result');
 return Object.freeze(rows[0]);
};
const session=token=>{
 const value=hashCustomerSessionToken(token);
 if(!value)throw Error('economic_scope_forbidden');
 return value;
};
const verified=value=>{
 const actorId=value?.verifiedIdentity?.userId,role=value?.verifiedStaff?.role;
 if(!UUID.test(actorId??'')||value?.verifiedStaff?.userId?.toLowerCase()!==actorId.toLowerCase()||
  !['admin','root','waiter'].includes(role))throw Error('economic_staff_forbidden');
 return {actorId,role};
};
const capArgs=cap=>[cap.keyId,cap.databaseRole,cap.actorId,cap.staffRole,
 cap.correlationId,cap.issuedAtMs,cap.expiresAtMs,cap.signatureHex];

export function createEconomicCustomerRepository({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_economic_customer_repository');
 return Object.freeze({
  consumption({customerSessionToken,tableId,visitId}={}){
   if(!UUID.test(tableId??'')||!KEY.test(visitId??''))throw Error('invalid_economic_scope');
   return withTransaction(query=>one(query(READ_ECONOMIC_CONSUMPTION_SQL,
    [session(customerSessionToken),tableId,visitId])));
  },
  create({customerSessionToken,tableId,visitId,requestKey,channel,allocations}={}){
   if(!UUID.test(tableId??'')||!KEY.test(visitId??'')||!KEY.test(requestKey??'')||
    !['stripe','external'].includes(channel)||!Array.isArray(allocations)||allocations.length<1||
    allocations.length>50||!allocations.every(x=>plain(x)&&Object.keys(x).length===2&&
     UUID.test(x.roundId??'')&&Number.isSafeInteger(x.amountCents)&&x.amountCents>0)||
    new Set(allocations.map(x=>x.roundId.toLowerCase())).size!==allocations.length)
    throw Error('invalid_economic_settlement');
   return withTransaction(query=>one(query(CREATE_ECONOMIC_SETTLEMENT_SQL,
    [session(customerSessionToken),tableId,visitId,requestKey,channel,JSON.stringify(allocations)])));
  }
 });
}

export function createEconomicProviderRepository({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_economic_provider_repository');
 return Object.freeze({
  recordAuthorization({intentId,outcome,providerIntentId=null,captureBefore=null,errorCode=null}){
   if(!UUID.test(intentId??'')||!['authorized','requires_action','failed','unknown'].includes(outcome))
    throw Error('invalid_economic_provider_record');
   return withTransaction(query=>one(query(RECORD_ECONOMIC_AUTHORIZATION_SQL,
    [intentId,outcome,providerIntentId,captureBefore,errorCode])));
  },
  requestCapture({intentId}){
   if(!UUID.test(intentId??''))throw Error('invalid_economic_provider_record');
   return withTransaction(query=>one(query(REQUEST_ECONOMIC_CAPTURE_SQL,[intentId])));
  },
  recordCapture({intentId,outcome,providerChargeId=null,errorCode=null,
   providerAmountCents=null,providerCurrency=null}){
   if(!UUID.test(intentId??'')||!['captured','failed','unknown'].includes(outcome))
    throw Error('invalid_economic_provider_record');
   return withTransaction(query=>one(query(RECORD_ECONOMIC_CAPTURE_SQL,
    [intentId,outcome,providerChargeId,errorCode,providerAmountCents,providerCurrency])));
  },
  requestRefund({incidentId}){
   if(!UUID.test(incidentId??''))throw Error('invalid_economic_refund');
   return withTransaction(query=>oneRow(query(REQUEST_ECONOMIC_REFUND_SQL,[incidentId])));
  },
  recordRefund({refundAttemptId,outcome,providerRefundId=null,errorCode=null,
   providerAmountCents=null,providerChargeId=null,providerCurrency=null}){
   if(!UUID.test(refundAttemptId??'')||!['succeeded','failed','unknown'].includes(outcome))
    throw Error('invalid_economic_refund');
   return withTransaction(query=>one(query(RECORD_ECONOMIC_REFUND_SQL,
    [refundAttemptId,outcome,providerRefundId,errorCode,providerAmountCents,
    providerChargeId,providerCurrency])));
  }
 });
}

export function createEconomicStaffRepository({withTransaction,issueCapability}={}){
 if(typeof withTransaction!=='function'||typeof issueCapability!=='function')
  throw Error('invalid_economic_staff_repository');
 const capability=(staff,action,targetId,correlationId)=>{
  const {actorId,role}=verified(staff);
  if(!UUID.test(targetId??'')||!KEY.test(correlationId??''))throw Error('invalid_economic_operation');
  return issueCapability({actorId,staffRole:role,action,targetId,correlationId});
 };
 return Object.freeze({
  read(staff){
   const {actorId}=verified(staff);
   const cap=capability(staff,'read_economic_accounts',actorId,
    'economic_read_'+randomUUID().replaceAll('-','_'));
   return withTransaction(query=>one(query(READ_STAFF_ECONOMIC_ACCOUNTS_SQL,capArgs(cap))));
  },
  verifyExternal(staff,{intentId,correlationId}={}){
   const cap=capability(staff,'verify_external_settlement',intentId,correlationId);
   return withTransaction(query=>one(query(VERIFY_EXTERNAL_SETTLEMENT_SQL,[
    cap.keyId,cap.databaseRole,cap.actorId,cap.staffRole,intentId,...capArgs(cap).slice(4)])));
  },
  closeTable(staff,{tableId,sessionId,correlationId}={}){
   if(!UUID.test(sessionId??''))throw Error('invalid_economic_operation');
   const cap=capability(staff,'close_operational_table',tableId,correlationId);
   return withTransaction(query=>one(query(CLOSE_ECONOMIC_TABLE_SQL,[
    cap.keyId,cap.databaseRole,cap.actorId,cap.staffRole,tableId,sessionId,...capArgs(cap).slice(4)])));
  }
 });
}
