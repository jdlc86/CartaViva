import {StripeAmbiguousResultError} from './h6-stripe-adapter.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY=/^h6_(auth|capture|release|refund)_[A-Za-z0-9_-]{16,96}$/;
const safeCode=value=>typeof value==='string'&&/^[a-z0-9_]{1,80}$/.test(value)?value:null;

export function createH6PaymentOrchestrator({stripe,repository,clock=Date.now}={}){
 if(!stripe||typeof stripe.authorize!=='function'||typeof stripe.capture!=='function'||
    typeof stripe.release!=='function'||typeof stripe.refund!=='function'||
    typeof stripe.retrieve!=='function'||
    !repository||typeof repository.recordAuthorization!=='function'||
    typeof repository.requestCapture!=='function'||typeof repository.recordCapture!=='function'||
    typeof repository.recordCaptureCompensation!=='function'||
    typeof repository.requestRefund!=='function'||typeof repository.recordRefund!=='function'||
    typeof repository.requestRelease!=='function'||typeof repository.recordRelease!=='function'||
    typeof clock!=='function')throw Error('invalid_h6_payment_orchestrator');
 return Object.freeze({
  async authorize({orderId,amountCents,authorizationKey}={}){
   if(!UUID.test(orderId??'')||!Number.isSafeInteger(amountCents)||amountCents<1||
      !IDEMPOTENCY.test(authorizationKey??''))throw Error('invalid_h6_authorization_request');
   let result;
   try{result=await stripe.authorize({orderId,amountCents,idempotencyKey:authorizationKey});}
   catch(error){
    if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown',errorCode:'provider_result_ambiguous'};
   }
   const outcome=['authorized','requires_action','failed'].includes(result.outcome)?result.outcome:'unknown';
   const recorded=await repository.recordAuthorization({orderId,outcome,
    providerIntentId:result.providerIntentId??null,captureBefore:result.captureBefore??null,
    errorCode:safeCode(result.errorCode)});
   return Object.freeze({...recorded,...(result.clientSecret?{clientSecret:result.clientSecret}:null)});
  },
  async captureOrDispatch({orderId}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_capture_request');
   const requested=await repository.requestCapture({orderId,now:new Date(clock())});
   if(requested.action==='dispatch')return requested;
   if(requested.action!=='capture'||!IDEMPOTENCY.test(requested.capture_key??''))
    throw Error('invalid_h6_capture_state');
   let result;
   try{result=await stripe.capture({providerIntentId:requested.provider_intent_id,
    idempotencyKey:requested.capture_key});}
   catch(error){
    if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown',errorCode:'provider_result_ambiguous'};
   }
   const outcome=['captured','failed'].includes(result.outcome)?result.outcome:'unknown';
   try{return await repository.recordCapture({orderId,outcome,
    providerChargeId:result.providerChargeId??null,errorCode:safeCode(result.errorCode)});}
   catch(error){
    if(outcome!=='captured'||typeof result.providerChargeId!=='string')throw error;
    try{return await repository.recordCaptureCompensation({orderId,
     providerChargeId:result.providerChargeId,errorCode:'dispatch_persistence_failed'});}
    catch(compensationError){
     try{error.compensationError=compensationError;}catch{}
     throw error;
    }
   }
  },
  async reconcile({orderId,providerIntentId,phase}={}){
   if(!UUID.test(orderId??'')||typeof providerIntentId!=='string'||
      !['authorization','capture'].includes(phase))throw Error('invalid_h6_reconciliation_request');
   let result;
   try{result=await stripe.retrieve({providerIntentId});}
   catch(error){
    if(error instanceof StripeAmbiguousResultError)return Object.freeze({state:'unknown',retryAllowed:false});
    throw error;
   }
   if(result.outcome==='captured'){
    if(phase==='capture')return repository.recordCapture({orderId,outcome:'captured',
     providerChargeId:result.providerChargeId});
    return repository.recordCaptureCompensation({orderId,providerChargeId:result.providerChargeId,
     errorCode:'unexpected_provider_capture'});
   }
   if(phase==='authorization'){
    const outcome=['authorized','requires_action','failed'].includes(result.outcome)?result.outcome:'unknown';
    return repository.recordAuthorization({orderId,outcome,providerIntentId:result.providerIntentId??providerIntentId,
     captureBefore:result.captureBefore??null,errorCode:safeCode(result.errorCode)});
   }
   if(result.outcome==='authorized')return Object.freeze({state:'capture_retry_safe',retryAllowed:true});
   if(result.outcome==='failed')return repository.recordCapture({orderId,outcome:'failed',
    errorCode:safeCode(result.errorCode)});
   return Object.freeze({state:'unknown',retryAllowed:false});
  },
  async refund({refundAttemptId}={}){
   if(!UUID.test(refundAttemptId??''))throw Error('invalid_h6_refund_request');
   const requested=await repository.requestRefund({refundAttemptId});
   if(requested.action!=='refund')return requested;
   if(!IDEMPOTENCY.test(requested.idempotency_key??''))throw Error('invalid_h6_refund_state');
   let result;
   try{result=await stripe.refund({refundAttemptId,providerChargeId:requested.provider_charge_id,
    amountCents:Number(requested.amount_cents),idempotencyKey:requested.idempotency_key});}
   catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown'};}
   const outcome=['succeeded','failed'].includes(result.outcome)?result.outcome:'unknown';
   return repository.recordRefund({refundAttemptId,outcome,providerRefundId:result.providerRefundId??null});
  },
  async release({orderId}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_release_request');
   const requested=await repository.requestRelease({orderId});
   if(requested.action!=='release')return requested;
   if(!IDEMPOTENCY.test(requested.idempotency_key??''))throw Error('invalid_h6_release_state');
   let result;
   try{result=await stripe.release({providerIntentId:requested.provider_intent_id,
    idempotencyKey:requested.idempotency_key});}
   catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown'};}
   const outcome=result.outcome==='released'?'released':result.outcome==='failed'?'failed':'unknown';
   return repository.recordRelease({orderId,outcome,errorCode:safeCode(result.errorCode)});
  }
 });
}
