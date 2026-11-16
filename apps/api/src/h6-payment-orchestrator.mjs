import {StripeAmbiguousResultError} from './h6-stripe-adapter.mjs';
import {safeProviderCents,providerMatchesMoney} from './h6-money-evidence.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY=/^h6_(auth|capture|release|refund)_[A-Za-z0-9_-]{16,96}$/;
const safeCode=value=>typeof value==='string'&&/^[a-z0-9_]{1,80}$/.test(value)?value:null;

export function createH6PaymentOrchestrator({stripe,repository,clock=Date.now}={}){
 if(!stripe||typeof stripe.authorize!=='function'||typeof stripe.capture!=='function'||
    typeof stripe.release!=='function'||typeof stripe.refund!=='function'||
    typeof stripe.retrieve!=='function'||
    !repository||typeof repository.recordAuthorization!=='function'||
    typeof repository.readPaymentEvidence!=='function'||
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
   if(['authorized','requires_action'].includes(result.outcome)&&
     (!providerMatchesMoney(result,amountCents)||typeof result.providerIntentId!=='string'))
    result={outcome:'unknown',errorCode:'provider_money_mismatch'};
   const outcome=['authorized','requires_action','failed'].includes(result.outcome)?result.outcome:'unknown';
   const recorded=await repository.recordAuthorization({orderId,outcome,
    providerIntentId:result.providerIntentId??null,captureBefore:result.captureBefore??null,
    errorCode:safeCode(result.errorCode)});
   return Object.freeze({...recorded,...(result.clientSecret?{clientSecret:result.clientSecret}:null)});
  },
  async captureOrDispatch({orderId,serverDue=false}={}){
   if(!UUID.test(orderId??''))throw Error('invalid_h6_capture_request');
   const requested=serverDue?
    await repository.requestDueCapture({orderId}):
    await repository.requestCapture({orderId,now:new Date(clock())});
   if(requested.action==='dispatch')return requested;
   if(requested.action!=='capture'||!IDEMPOTENCY.test(requested.capture_key??''))
    throw Error('invalid_h6_capture_state');
   const expected=safeProviderCents(requested.amount_cents);
   if(typeof requested.provider_intent_id!=='string')throw Error('invalid_h6_capture_state');
   let result;
   try{result=await stripe.capture({providerIntentId:requested.provider_intent_id,
    idempotencyKey:requested.capture_key});}
   catch(error){
    if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown',errorCode:'provider_result_ambiguous'};
   }
   if(result.outcome==='captured'&&(!providerMatchesMoney(result,expected)||
     result.providerIntentId!==requested.provider_intent_id))
    result={outcome:'unknown',errorCode:'provider_money_mismatch'};
   const outcome=['captured','failed'].includes(result.outcome)?result.outcome:'unknown';
   try{return await repository.recordCapture({orderId,outcome,
    providerChargeId:result.providerChargeId??null,errorCode:safeCode(result.errorCode),
     providerIntentId:outcome==='captured'?result.providerIntentId:null,
     providerAmountCents:outcome==='captured'?result.amountCents:null,
     providerCurrency:outcome==='captured'?result.currency:null});}
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
   const expected=await repository.readPaymentEvidence({orderId});
   const amount=safeProviderCents(expected.amount_cents);
   if(expected.provider_intent_id!==null&&expected.provider_intent_id!==providerIntentId)
    return Object.freeze({state:'unknown',retryAllowed:false});
   let result;
   try{result=await stripe.retrieve({providerIntentId});}
   catch(error){
    if(error instanceof StripeAmbiguousResultError)return Object.freeze({state:'unknown',retryAllowed:false});
    throw error;
   }
   if(['captured','authorized','requires_action'].includes(result.outcome)&&
     (!providerMatchesMoney(result,amount)||result.providerIntentId!==providerIntentId))
    return Object.freeze({state:'unknown',retryAllowed:false});
   if(result.outcome==='captured'){
    if(phase==='capture')return repository.recordCapture({orderId,outcome:'captured',
     providerChargeId:result.providerChargeId,providerIntentId,
     providerAmountCents:result.amountCents,providerCurrency:result.currency});
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
   const amount=safeProviderCents(requested.amount_cents);
   if(!IDEMPOTENCY.test(requested.idempotency_key??''))throw Error('invalid_h6_refund_state');
   let result;
   try{result=await stripe.refund({refundAttemptId,providerChargeId:requested.provider_charge_id,
    amountCents:amount,idempotencyKey:requested.idempotency_key});}
   catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown'};}
   if(result.outcome==='succeeded'&&(!providerMatchesMoney(result,amount)||
     result.providerChargeId!==requested.provider_charge_id))
    result={outcome:'unknown',errorCode:'provider_money_mismatch'};
   const outcome=['succeeded','failed'].includes(result.outcome)?result.outcome:'unknown';
   return repository.recordRefund({refundAttemptId,outcome,providerRefundId:result.providerRefundId??null,
    providerAmountCents:outcome==='succeeded'?result.amountCents:null,
    providerCurrency:outcome==='succeeded'?result.currency:null,
    providerChargeId:outcome==='succeeded'?result.providerChargeId:null});
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
