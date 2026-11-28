const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RECORD_AUTHORIZATION_H6_SQL=`SELECT payment_attempt_id,payment_state,round_state,repeated
 FROM sabora.record_h6_authorization_outcome_candidate($1::uuid,$2::text,$3::text,$4::timestamptz,$5::text)`;
export const LIST_SCHEDULABLE_H6_SQL=`SELECT order_id,grouping_deadline,server_now
 FROM sabora.list_schedulable_h6_rounds_candidate($1::integer)`;
export const LIST_H6_WITHOUT_STRIPE_SQL=`SELECT order_id,grouping_deadline,server_now
 FROM sabora.list_h6_rounds_without_stripe_candidate($1::integer)
 ORDER BY grouping_deadline,order_id`;
export const REQUEST_H6_WITHOUT_STRIPE_SQL=`SELECT sabora.request_h6_dispatch_without_stripe_candidate($1::uuid) AS dispatched`;
export const REQUEST_DUE_CAPTURE_H6_SQL=`SELECT payment_attempt_id,provider_intent_id,capture_key,
 dispatch_id,dispatch_key,action,repeated,amount_cents
 FROM sabora.request_h6_capture_evidence_candidate($1::uuid,clock_timestamp())`;
export const REQUEST_CAPTURE_H6_SQL=`SELECT payment_attempt_id,provider_intent_id,capture_key,
 dispatch_id,dispatch_key,action,repeated,amount_cents FROM sabora.request_h6_capture_evidence_candidate($1::uuid,$2::timestamptz)`;
export const RECORD_CAPTURE_H6_SQL=`SELECT payment_state,round_state,dispatch_id,dispatch_state,repeated
 FROM sabora.record_h6_capture_verified_candidate($1::uuid,$2::text,$3::text,$4::text,
 $5::text,$6::bigint,$7::text)`;
export const READ_PAYMENT_EVIDENCE_H6_SQL=`SELECT amount_cents,provider_intent_id,provider_charge_id
 FROM sabora.read_h6_provider_evidence_candidate($1::uuid)`;
export const RECORD_CAPTURE_COMPENSATION_H6_SQL=`SELECT payment_state,round_state,dispatch_id,dispatch_state,repeated
 FROM sabora.record_h6_capture_compensation_verified_candidate($1::uuid,$2::text,$3::text,
  $4::text,$5::bigint,$6::text)`;
export const INGEST_STRIPE_WEBHOOK_H6_SQL=`SELECT sabora.ingest_stripe_webhook_verified_candidate(
 $1::text,$2::text,$3::text,$4::timestamptz,$5::bytea,$6::text,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text) AS result`;
export const RECORD_REFUND_H6_SQL=`SELECT sabora.record_h6_refund_verified_candidate(
 $1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text) AS result`;
export const REQUEST_REFUND_H6_SQL=`SELECT refund_attempt_id,provider_charge_id,amount_cents,
 idempotency_key,action,repeated FROM sabora.request_h6_refund_candidate($1::uuid)`;
export const REQUEST_RELEASE_H6_SQL=`SELECT payment_attempt_id,provider_intent_id,idempotency_key,
 action,repeated FROM sabora.request_h6_release_candidate($1::uuid)`;
export const RECORD_RELEASE_H6_SQL=`SELECT payment_state,round_state,repeated
 FROM sabora.record_h6_release_outcome_candidate($1::uuid,$2::text,$3::text)`;

const rows=async promise=>{
 const value=await promise;
 if(!value||!Array.isArray(value.rows)||value.rows.length!==1)throw Error('invalid_h6_provider_sql_result');
 return Object.freeze(value.rows[0]);
};
export function createH6ProviderRepository({withTransaction}={}){
 if(typeof withTransaction!=='function')throw Error('invalid_h6_provider_repository');
 return Object.freeze({
  async listSchedulable({limit=100,withoutStripe=false}={}){
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||typeof withoutStripe!=='boolean')
    throw Error('invalid_h6_dispatch_limit');
   const sql=withoutStripe?LIST_H6_WITHOUT_STRIPE_SQL:LIST_SCHEDULABLE_H6_SQL;
   const result=await withTransaction(query=>query(sql,[limit]));
   if(!result||!Array.isArray(result.rows))throw Error('invalid_h6_dispatch_schedule');
   return result.rows.map(row=>Object.freeze({
    orderId:row.order_id,groupingDeadline:row.grouping_deadline,serverNow:row.server_now
   }));
  },
  async requestDispatchWithoutStripe({orderId}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_dispatch_request');
   const result=await withTransaction(query=>rows(query(REQUEST_H6_WITHOUT_STRIPE_SQL,[orderId])));
   if(typeof result.dispatched!=='boolean')throw Error('invalid_h6_provider_sql_result');
   return result.dispatched;
  },
  requestDueCapture({orderId}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_capture_request');
   return withTransaction(query=>rows(query(REQUEST_DUE_CAPTURE_H6_SQL,[orderId])));
  },
  recordAuthorization({orderId,outcome,providerIntentId=null,captureBefore=null,errorCode=null}={}){
   if(!UUID.test(orderId??'')||!['authorized','requires_action','failed','unknown'].includes(outcome))
    throw Error('invalid_h6_authorization_record');
   return withTransaction(query=>rows(query(RECORD_AUTHORIZATION_H6_SQL,
    [orderId,outcome,providerIntentId,captureBefore,errorCode])));
  },
  requestCapture({orderId,now=new Date()}={}){
   if(!UUID.test(orderId??'')||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error('invalid_h6_capture_request');
   return withTransaction(query=>rows(query(REQUEST_CAPTURE_H6_SQL,[orderId,now])));
  },
  readPaymentEvidence({orderId}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_provider_evidence');
   return withTransaction(query=>rows(query(READ_PAYMENT_EVIDENCE_H6_SQL,[orderId])));
  },
  recordCapture({orderId,outcome,providerChargeId=null,errorCode=null,
   providerIntentId=null,providerAmountCents=null,providerCurrency=null}={}){
   if(!UUID.test(orderId??'')||!['captured','failed','unknown'].includes(outcome))
    throw Error('invalid_h6_capture_record');
   return withTransaction(query=>rows(query(RECORD_CAPTURE_H6_SQL,
    [orderId,outcome,providerChargeId,errorCode,providerIntentId,providerAmountCents,providerCurrency])));
  },
  recordCaptureCompensation({orderId,providerChargeId,errorCode='dispatch_persistence_failed',
   providerIntentId=null,providerAmountCents=null,providerCurrency=null}={}){
   if(!UUID.test(orderId??'')||typeof providerChargeId!=='string'||typeof errorCode!=='string')
    throw Error('invalid_h6_capture_compensation');
   return withTransaction(query=>rows(query(RECORD_CAPTURE_COMPENSATION_H6_SQL,
    [orderId,providerChargeId,errorCode,providerIntentId,providerAmountCents,providerCurrency])));
  },
  ingestWebhook({eventId,eventType,providerObjectId,providerCreatedAt,payloadSha256,
   providerChargeId=null,captureBefore=null,refundAttemptId=null,refundStatus=null,
    saboraOrderId=null,providerAmountCents=null,providerCurrency=null}={}){
   if(!(providerCreatedAt instanceof Date)||!Number.isFinite(providerCreatedAt.getTime())||
      !Buffer.isBuffer(payloadSha256)||payloadSha256.length!==32)
    throw Error('invalid_h6_webhook_record');
   return withTransaction(query=>rows(query(INGEST_STRIPE_WEBHOOK_H6_SQL,
    [eventId,eventType,providerObjectId,providerCreatedAt,payloadSha256,providerChargeId,captureBefore,
     refundAttemptId,refundStatus,saboraOrderId,providerAmountCents,providerCurrency])))
    .then(row=>Object.freeze(row.result));
  },
  recordRefund({refundAttemptId,outcome,providerRefundId=null,providerAmountCents=null,
   providerChargeId=null,providerCurrency=null}={}){
   if(!UUID.test(refundAttemptId??'')||!['succeeded','failed','unknown'].includes(outcome))
    throw Error('invalid_h6_refund_record');
   return withTransaction(query=>rows(query(RECORD_REFUND_H6_SQL,
    [refundAttemptId,outcome,providerRefundId,providerAmountCents,providerChargeId,
     providerCurrency]))).then(row=>Object.freeze(row.result));
  },
  requestRefund({refundAttemptId}={}){
   if(!UUID.test(refundAttemptId??''))throw Error('invalid_h6_refund_request');
   return withTransaction(query=>rows(query(REQUEST_REFUND_H6_SQL,[refundAttemptId])));
  },
  requestRelease({orderId}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_release_request');
   return withTransaction(query=>rows(query(REQUEST_RELEASE_H6_SQL,[orderId])));
  },
  recordRelease({orderId,outcome,errorCode=null}={}){
   if(!UUID.test(orderId??'')||!['released','failed','unknown'].includes(outcome))
    throw Error('invalid_h6_release_record');
   return withTransaction(query=>rows(query(RECORD_RELEASE_H6_SQL,[orderId,outcome,errorCode])));
  }
 });
}
