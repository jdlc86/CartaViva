import {StripeAmbiguousResultError} from './h6-stripe-adapter.mjs';

const safe=value=>typeof value==='string'&&/^[a-z0-9_]{1,80}$/.test(value)?value:null;
export function createEconomicCircuitService({stripe,repository}={}){
 if(!stripe||typeof stripe.authorize!=='function'||typeof stripe.capture!=='function'||typeof stripe.refund!=='function'||
  !repository||typeof repository.recordAuthorization!=='function'||
  typeof repository.requestCapture!=='function'||typeof repository.recordCapture!=='function'||
  typeof repository.requestRefund!=='function'||typeof repository.recordRefund!=='function')
  throw Error('invalid_economic_circuit_service');
 const capture=async intentId=>{
  const request=await repository.requestCapture({intentId});
  let result;
  try{result=await stripe.capture({providerIntentId:request.providerIntentId,
   idempotencyKey:request.captureKey});}
  catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
   result={outcome:'unknown',errorCode:'provider_result_ambiguous'};}
  const outcome=['captured','failed'].includes(result.outcome)?result.outcome:'unknown';
  return repository.recordCapture({intentId,outcome,providerChargeId:result.providerChargeId??null,
   errorCode:safe(result.errorCode)});
 };
 return Object.freeze({
  async authorizeAndCapture(intent){
   if(intent?.channel!=='stripe'||typeof intent.intentId!=='string'||
    !Number.isSafeInteger(intent.amountCents)||typeof intent.authorizationKey!=='string')
    throw Error('invalid_economic_stripe_intent');
   if(['stripe_capture_requested','stripe_capture_unknown','stripe_authorized'].includes(intent.state))
    return capture(intent.intentId);
   if(['stripe_captured','stripe_refund_pending','stripe_partially_refunded','stripe_refunded'].includes(intent.state))
    return intent;
   if(intent.state==='stripe_failed')return intent;
   if(!['stripe_authorization_requested','stripe_authorization_unknown','stripe_requires_action'].includes(intent.state))
    throw Error('invalid_economic_stripe_state');
   let result;
   try{result=await stripe.authorize({orderId:intent.intentId,amountCents:intent.amountCents,
    idempotencyKey:intent.authorizationKey});}
   catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown',errorCode:'provider_result_ambiguous'};}
   const outcome=['authorized','requires_action','failed'].includes(result.outcome)?result.outcome:'unknown';
   const recorded=await repository.recordAuthorization({intentId:intent.intentId,outcome,
    providerIntentId:result.providerIntentId??null,captureBefore:result.captureBefore??null,
    errorCode:safe(result.errorCode)});
   if(outcome==='authorized')return capture(intent.intentId);
   return Object.freeze({...recorded,...(result.clientSecret?{clientSecret:result.clientSecret}:null)});
  },
  async refundIncident(incidentId){
   const request=await repository.requestRefund({incidentId});
   if(request.action!=='refund')return request;
   let result;
   try{result=await stripe.refund({refundAttemptId:request.refund_attempt_id,
    providerChargeId:request.provider_charge_id,amountCents:request.amount_cents,
    idempotencyKey:request.idempotency_key});}
   catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown',errorCode:'provider_result_ambiguous'};}
   const outcome=['succeeded','failed'].includes(result.outcome)?result.outcome:'unknown';
   return repository.recordRefund({refundAttemptId:request.refund_attempt_id,outcome,
    providerRefundId:result.providerRefundId??null,errorCode:safe(result.errorCode)});
  }
 });
}
