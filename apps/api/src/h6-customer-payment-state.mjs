import {hashCustomerSessionToken} from './customer-session.mjs';
import {READ_H6_ROUND_SQL} from './customer-production-flow.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIT=/^[A-Za-z0-9_-]{16,128}$/;

// Sealed existing SQL capability. No provider secret, authorization key or
// payment-attempt ID reaches the browser. Browser reports never prove capture.
export function createH6CustomerPaymentStateReader({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_h6_payment_state_reader');
 return async function readPaymentState({customerSessionToken,tableId,visitId,orderId}={}){
  const sessionHash=hashCustomerSessionToken(customerSessionToken);
  if(!sessionHash)throw Error('customer_session_forbidden');
  if(!UUID.test(tableId??'')||!UUID.test(orderId??'')||!VISIT.test(visitId??''))
   throw Error('invalid_customer_payment_state_scope');
  const result=await withTransaction(query=>query(READ_H6_ROUND_SQL,
   [sessionHash,tableId,visitId,orderId]));
  if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
   throw Error('customer_payment_scope_forbidden');
  const row=result.rows[0];
  if(!['pay_now','pay_at_end',null].includes(row.effective_payment_mode)||
     typeof row.round_state!=='string')throw Error('invalid_customer_payment_state_result');
  return Object.freeze({orderId,paymentMode:row.effective_payment_mode,
   roundState:row.round_state});
 };
}
