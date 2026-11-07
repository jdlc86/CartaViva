import {randomUUID} from 'node:crypto';
import {hashCustomerSessionToken} from './customer-session.mjs';

// All SQL is exact and separately admitted by role-scoped-postgres. Neither a
// public user nor a runtime LOGIN has direct table privileges.
export const TP_CASH_DEBTS_SQL=`SELECT sabora.read_third_party_cash_debts_candidate(
 $1::bytea,$2::uuid,$3::text) AS result`;
export const TP_CASH_INTENT_SQL=`SELECT sabora.create_third_party_cash_intent_candidate(
 $1::bytea,$2::uuid,$3::text,$4::jsonb,$5::text,$6::boolean) AS result`;
export const TP_CASH_REFUNDS_SQL=`SELECT sabora.read_third_party_cash_refunds_candidate(
 $1::bytea) AS result`;
export const TP_CASH_REFUND_PROOF_SQL=`SELECT sabora.issue_third_party_cash_refund_proof_candidate(
 $1::bytea,$2::uuid) AS result`;
export const TP_CASH_PENDING_SQL=`SELECT sabora.read_third_party_cash_pending_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text) AS result`;
export const TP_CASH_SETTLE_SQL=`SELECT sabora.settle_third_party_cash_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::text,$7::bigint,$8::bigint,$9::text) AS result`;
export const TP_CASH_REFUND_SQL=`SELECT sabora.refund_third_party_cash_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,$8::text,
 $9::bigint,$10::bigint,$11::text) AS result`;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const CODE=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const result=async promise=>{
 const rows=(await promise)?.rows;
 if(!Array.isArray(rows)||rows.length!==1||!plain(rows[0]?.result))
  throw Error('invalid_third_party_sql_result');
 return Object.freeze(rows[0].result);
};
const session=token=>{
 const value=hashCustomerSessionToken(token);
 if(!value)throw Error('third_party_scope_forbidden');
 return value;
};
const scope=({tableId,visitId}={})=>{
 if(!UUID.test(tableId??'')||!KEY.test(visitId??''))
  throw Error('invalid_third_party_scope');
 return [tableId,visitId];
};
const verified=value=>{
 const actorId=value?.verifiedIdentity?.userId,staff=value?.verifiedStaff;
 if(!UUID.test(actorId??'')||staff?.userId?.toLowerCase()!==actorId.toLowerCase()||
   !['admin','root','waiter'].includes(staff?.role))
  throw Error('third_party_cash_forbidden');
 return {actorId,staffRole:staff.role};
};
const capArgs=cap=>[
 cap.keyId,cap.databaseRole,cap.actorId,cap.staffRole,
 cap.correlationId,cap.issuedAtMs,cap.expiresAtMs,cap.signatureHex
];
const sign=(verifiedStaff,issueCapability,action,targetId,correlationId)=>{
 const {actorId,staffRole}=verified(verifiedStaff);
 if(!UUID.test(targetId??'')||!KEY.test(correlationId??''))
  throw Error('invalid_third_party_cash_operation');
 return issueCapability({actorId,staffRole,action,targetId,correlationId});
};
export function createThirdPartyCashCustomerRepository({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_third_party_customer_repository');
 return Object.freeze({
  debts({customerSessionToken,tableId,visitId}={}){
   const [table,visit]=scope({tableId,visitId});
   return withTransaction(query=>result(query(TP_CASH_DEBTS_SQL,
    [session(customerSessionToken),table,visit])));
  },
  intent({customerSessionToken,tableId,visitId,rounds,requestKey,consent}={}){
   const [table,visit]=scope({tableId,visitId});
   if(consent!==true||!KEY.test(requestKey??'')||!Array.isArray(rounds)||
     rounds.length<1||rounds.length>10||
     !rounds.every(x=>plain(x)&&Object.keys(x).length===2&&UUID.test(x.roundId??'')&&
       Number.isSafeInteger(x.amountCents)&&x.amountCents>0&&x.amountCents<=999999999999)||
     new Set(rounds.map(x=>x.roundId.toLowerCase())).size!==rounds.length)
    throw Error('invalid_third_party_intent');
   return withTransaction(query=>result(query(TP_CASH_INTENT_SQL,
    [session(customerSessionToken),table,visit,JSON.stringify(rounds),requestKey,true])));
  },
  refunds({customerSessionToken}={}){
   return withTransaction(query=>result(query(TP_CASH_REFUNDS_SQL,[session(customerSessionToken)])));
  },
  issueRefundProof({customerSessionToken,incidentId}={}){
   if(!UUID.test(incidentId??''))throw Error('invalid_third_party_scope');
   return withTransaction(query=>result(query(TP_CASH_REFUND_PROOF_SQL,
    [session(customerSessionToken),incidentId])));
  }
 });
}
export function createThirdPartyCashOperations({withTransaction,issueCapability}={}){
 if(typeof withTransaction!=='function'||typeof issueCapability!=='function')
  throw Error('invalid_third_party_cash_operations');
 return Object.freeze({
  pending(staff){
   const {actorId}=verified(staff);
   const cap=sign(staff,issueCapability,'read_cash_accounts',actorId,
    'tp_read_'+randomUUID().replaceAll('-','_'));
   return withTransaction(query=>result(query(TP_CASH_PENDING_SQL,capArgs(cap))));
  },
  settle(staff,{intentId,correlationId}={}){
   const cap=sign(staff,issueCapability,'settle_cash',intentId,correlationId);
   return withTransaction(query=>result(query(TP_CASH_SETTLE_SQL,[
    cap.keyId,cap.databaseRole,cap.actorId,cap.staffRole,
    intentId,...capArgs(cap).slice(4)])));
  },
  refund(staff,{incidentId,claimId,proof,correlationId}={}){
   if(!UUID.test(claimId??'')||!CODE.test(proof??''))
    throw Error('invalid_third_party_cash_operation');
   const cap=sign(staff,issueCapability,'refund_cash',incidentId,correlationId);
   return withTransaction(query=>result(query(TP_CASH_REFUND_SQL,[
    cap.keyId,cap.databaseRole,cap.actorId,cap.staffRole,
    incidentId,claimId,proof,...capArgs(cap).slice(4)])));
  }
 });
}
