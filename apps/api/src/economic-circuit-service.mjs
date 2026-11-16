import {StripeAmbiguousResultError} from './h6-stripe-adapter.mjs';
import {safeProviderCents} from './h6-money-evidence.mjs';

const safe=value=>typeof value==='string'&&/^[a-z0-9_]{1,80}$/.test(value)?value:null;
const verifiedEuros=(result,expected)=>Number.isSafeInteger(expected)&&expected>0&&
 Number.isSafeInteger(result?.amountCents)&&result.amountCents===expected&&result.currency==='eur';
const uncertain=()=>({outcome:'unknown',errorCode:'provider_money_mismatch'});
export function createEconomicCircuitService({stripe,repository}={}){
 if(!stripe||typeof stripe.authorize!=='function'||typeof stripe.capture!=='function'||typeof stripe.refund!=='function'||
  !repository||typeof repository.recordAuthorization!=='function'||
  typeof repository.requestCapture!=='function'||typeof repository.recordCapture!=='function'||
  typeof repository.requestRefund!=='function'||typeof repository.recordRefund!=='function')
  throw Error('invalid_economic_circuit_service');
 const capture=async intentId=>{
  const request=await repository.requestCapture({intentId});
   if(!Number.isSafeInteger(request.amountCents)||request.amountCents<=0||
    typeof request.providerIntentId!=='string')throw Error('invalid_economic_capture_request');
   let result;
  try{result=await stripe.capture({providerIntentId:request.providerIntentId,
   idempotencyKey:request.captureKey});}
  catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
   result={outcome:'unknown',errorCode:'provider_result_ambiguous'};}
  if(result.outcome==='captured'&&(!verifiedEuros(result,request.amountCents)||
    result.providerIntentId!==request.providerIntentId))result=uncertain();
   const outcome=['captured','failed'].includes(result.outcome)?result.outcome:'unknown';
   return repository.recordCapture({intentId,outcome,providerChargeId:result.providerChargeId??null,
    errorCode:safe(result.errorCode),providerAmountCents:outcome==='captured'?result.amountCents:null,
    providerCurrency:outcome==='captured'?result.currency:null});
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
   if(['authorized','requires_action'].includes(result.outcome)&&
     (!verifiedEuros(result,intent.amountCents)||typeof result.providerIntentId!=='string'))
     result=uncertain();
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
   const amount=safeProviderCents(request.amount_cents);
   let result;
   try{result=await stripe.refund({refundAttemptId:request.refund_attempt_id,
    providerChargeId:request.provider_charge_id,amountCents:amount,
    idempotencyKey:request.idempotency_key});}
   catch(error){if(!(error instanceof StripeAmbiguousResultError))throw error;
    result={outcome:'unknown',errorCode:'provider_result_ambiguous'};}
   if(result.outcome==='succeeded'&&(!verifiedEuros(result,amount)||
     result.providerChargeId!==request.provider_charge_id))result=uncertain();
   const outcome=['succeeded','failed'].includes(result.outcome)?result.outcome:'unknown';
   return repository.recordRefund({refundAttemptId:request.refund_attempt_id,outcome,
    providerRefundId:result.providerRefundId??null,errorCode:safe(result.errorCode),
    providerAmountCents:outcome==='succeeded'?result.amountCents:null,
    providerChargeId:outcome==='succeeded'?result.providerChargeId:null,
    providerCurrency:outcome==='succeeded'?result.currency:null});
  }
 });
}
