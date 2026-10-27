const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RECORD_AUTHORIZATION_H6_SQL=`SELECT payment_attempt_id,payment_state,round_state,repeated
 FROM sabora.record_h6_authorization_outcome_candidate($1::uuid,$2::text,$3::text,$4::timestamptz,$5::text)`;
export const REQUEST_CAPTURE_H6_SQL=`SELECT payment_attempt_id,provider_intent_id,capture_key,
 dispatch_id,dispatch_key,action,repeated FROM sabora.request_h6_capture_dispatch_candidate($1::uuid,$2::timestamptz)`;
export const RECORD_CAPTURE_H6_SQL=`SELECT payment_state,round_state,dispatch_id,dispatch_state,repeated
 FROM sabora.record_h6_capture_outcome_candidate($1::uuid,$2::text,$3::text,$4::text)`;
export const RECORD_CAPTURE_COMPENSATION_H6_SQL=`SELECT payment_state,round_state,dispatch_id,dispatch_state,repeated
 FROM sabora.record_h6_capture_compensation_candidate($1::uuid,$2::text,$3::text)`;
export const INGEST_STRIPE_WEBHOOK_H6_SQL=`SELECT sabora.ingest_stripe_webhook_h6_candidate(
 $1::text,$2::text,$3::text,$4::timestamptz,$5::bytea,$6::text,$7::timestamptz,$8::uuid,$9::text) AS result`;
export const RECORD_REFUND_H6_SQL=`SELECT sabora.record_h6_refund_outcome_candidate(
 $1::uuid,$2::text,$3::text) AS result`;
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
  recordCapture({orderId,outcome,providerChargeId=null,errorCode=null}={}){
   if(!UUID.test(orderId??'')||!['captured','failed','unknown'].includes(outcome))
    throw Error('invalid_h6_capture_record');
   return withTransaction(query=>rows(query(RECORD_CAPTURE_H6_SQL,
    [orderId,outcome,providerChargeId,errorCode])));
  },
  recordCaptureCompensation({orderId,providerChargeId,errorCode='dispatch_persistence_failed'}={}){
   if(!UUID.test(orderId??'')||typeof providerChargeId!=='string'||typeof errorCode!=='string')
    throw Error('invalid_h6_capture_compensation');
   return withTransaction(query=>rows(query(RECORD_CAPTURE_COMPENSATION_H6_SQL,
    [orderId,providerChargeId,errorCode])));
  },
  ingestWebhook({eventId,eventType,providerObjectId,providerCreatedAt,payloadSha256,
   providerChargeId=null,captureBefore=null,refundAttemptId=null,refundStatus=null}={}){
   if(!(providerCreatedAt instanceof Date)||!Number.isFinite(providerCreatedAt.getTime())||
      !Buffer.isBuffer(payloadSha256)||payloadSha256.length!==32)
    throw Error('invalid_h6_webhook_record');
   return withTransaction(query=>rows(query(INGEST_STRIPE_WEBHOOK_H6_SQL,
    [eventId,eventType,providerObjectId,providerCreatedAt,payloadSha256,providerChargeId,captureBefore,
     refundAttemptId,refundStatus])))
    .then(row=>Object.freeze(row.result));
  },
  recordRefund({refundAttemptId,outcome,providerRefundId=null}={}){
   if(!UUID.test(refundAttemptId??'')||!['succeeded','failed','unknown'].includes(outcome))
    throw Error('invalid_h6_refund_record');
   return withTransaction(query=>rows(query(RECORD_REFUND_H6_SQL,
    [refundAttemptId,outcome,providerRefundId]))).then(row=>Object.freeze(row.result));
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
