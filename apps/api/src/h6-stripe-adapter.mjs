const INTENT=/^pi_[A-Za-z0-9]{8,128}$/;
const CHARGE=/^ch_[A-Za-z0-9]{8,128}$/;
const REFUND=/^re_[A-Za-z0-9]{8,128}$/;
const IDEMPOTENCY=/^h6_(auth|capture|release|refund)_[A-Za-z0-9_-]{16,96}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class StripeAmbiguousResultError extends Error{
 constructor(message='stripe_ambiguous_result'){super(message);this.name='StripeAmbiguousResultError';}
}

const encode=fields=>{
 const body=new URLSearchParams();
 for(const [key,value] of Object.entries(fields))if(value!==null&&value!==undefined)body.set(key,String(value));
 return body.toString();
};
const captureBefore=value=>{
 const raw=value?.latest_charge?.payment_method_details?.card?.capture_before;
 return Number.isSafeInteger(raw)&&raw>0?new Date(raw*1000):null;
};
const chargeId=value=>typeof value?.latest_charge==='string'?value.latest_charge:value?.latest_charge?.id;

// Candidate adapter. It never reads environment variables and only accepts
// test/restricted-test credentials. Network transport is injected explicitly.
export function createH6StripeAdapter({request,credential,apiVersion='2026-09-30.clover'}={}){
 if(typeof request!=='function'||typeof credential!=='string'||
    !/^(sk_test_|rk_test_)[A-Za-z0-9_]+$/.test(credential)||credential.length<16||
    !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}\.[a-z]+$/.test(apiVersion))
  throw Error('invalid_h6_stripe_adapter');
 const call=async(path,{method='POST',idempotencyKey=null,fields={}}={})=>{
  if(idempotencyKey!==null&&!IDEMPOTENCY.test(idempotencyKey))throw Error('invalid_stripe_idempotency_key');
  let response;
  try{
   response=await request({method,path,headers:Object.freeze({
    authorization:`Bearer ${credential}`,'stripe-version':apiVersion,
    'content-type':'application/x-www-form-urlencoded',
    ...(idempotencyKey?{'idempotency-key':idempotencyKey}:null)
   }),...(method==='POST'?{body:encode(fields)}:{})});
  }catch(error){throw new StripeAmbiguousResultError();}
  if(!response||typeof response!=='object'||Array.isArray(response))throw new StripeAmbiguousResultError();
  if(response.error){
   const code=typeof response.error.code==='string'&&/^[a-z0-9_]{1,80}$/.test(response.error.code)?
    response.error.code:'stripe_request_failed';
   return Object.freeze({outcome:'failed',errorCode:code});
  }
  return response;
 };
 return Object.freeze({
  async retrieve({providerIntentId}={}){
   if(!INTENT.test(providerIntentId??''))throw Error('invalid_stripe_reconciliation');
   const value=await call(`/v1/payment_intents/${providerIntentId}`,{method:'GET'});
   if(value.outcome==='failed')return value;
   if(!INTENT.test(value.id??'')||value.id!==providerIntentId)throw new StripeAmbiguousResultError();
   if(value.status==='requires_capture'){
    const deadline=captureBefore(value);
    if(!deadline)throw new StripeAmbiguousResultError('stripe_capture_deadline_missing');
    return Object.freeze({outcome:'authorized',providerIntentId:value.id,captureBefore:deadline});
   }
   if(value.status==='succeeded'){
    const id=chargeId(value);
    if(!CHARGE.test(id??''))throw new StripeAmbiguousResultError();
    return Object.freeze({outcome:'captured',providerIntentId:value.id,providerChargeId:id});
   }
   if(['requires_action','requires_confirmation','requires_payment_method'].includes(value.status))
    return Object.freeze({outcome:'requires_action',providerIntentId:value.id,
     clientSecret:typeof value.client_secret==='string'?value.client_secret:null});
   if(value.status==='canceled')return Object.freeze({outcome:'failed',errorCode:'payment_intent_canceled'});
   throw new StripeAmbiguousResultError();
  },
  async authorize({orderId,amountCents,idempotencyKey}={}){
   if(!UUID.test(orderId??'')||!Number.isSafeInteger(amountCents)||amountCents<1)
    throw Error('invalid_stripe_authorization');
   const value=await call('/v1/payment_intents',{idempotencyKey,fields:{amount:amountCents,currency:'eur',
    capture_method:'manual','automatic_payment_methods[enabled]':'true','metadata[sabora_order_id]':orderId,
    'expand[]':'latest_charge'}});
   if(value.outcome==='failed')return value;
   if(!INTENT.test(value.id??''))throw new StripeAmbiguousResultError();
   if(value.status==='requires_capture'){
    const deadline=captureBefore(value);
    if(!deadline)throw new StripeAmbiguousResultError('stripe_capture_deadline_missing');
    return Object.freeze({outcome:'authorized',providerIntentId:value.id,captureBefore:deadline});
   }
   if(['requires_action','requires_confirmation','requires_payment_method'].includes(value.status))
    return Object.freeze({outcome:'requires_action',providerIntentId:value.id,
     clientSecret:typeof value.client_secret==='string'?value.client_secret:null});
   if(value.status==='canceled')return Object.freeze({outcome:'failed',errorCode:'payment_intent_canceled'});
   throw new StripeAmbiguousResultError();
  },
  async capture({providerIntentId,idempotencyKey}={}){
   if(!INTENT.test(providerIntentId??''))throw Error('invalid_stripe_capture');
   const value=await call(`/v1/payment_intents/${providerIntentId}/capture`,{idempotencyKey,
    fields:{'expand[]':'latest_charge'}});
   if(value.outcome==='failed')return value;
   const id=chargeId(value);
   if(value.status==='succeeded'&&CHARGE.test(id??''))
    return Object.freeze({outcome:'captured',providerChargeId:id});
   if(value.status==='canceled')return Object.freeze({outcome:'failed',errorCode:'capture_canceled'});
   throw new StripeAmbiguousResultError();
  },
  async release({providerIntentId,idempotencyKey}={}){
   if(!INTENT.test(providerIntentId??''))throw Error('invalid_stripe_release');
   const value=await call(`/v1/payment_intents/${providerIntentId}/cancel`,{idempotencyKey});
   if(value.outcome==='failed')return value;
   if(value.status==='canceled')return Object.freeze({outcome:'released'});
   throw new StripeAmbiguousResultError();
  },
  async refund({refundAttemptId,providerChargeId,amountCents,idempotencyKey}={}){
   if(!UUID.test(refundAttemptId??'')||!CHARGE.test(providerChargeId??'')||
      !Number.isSafeInteger(amountCents)||amountCents<1)
    throw Error('invalid_stripe_refund');
   const value=await call('/v1/refunds',{idempotencyKey,fields:{charge:providerChargeId,amount:amountCents,
    'metadata[sabora_refund_attempt_id]':refundAttemptId}});
   if(value.outcome==='failed')return value;
   if(!REFUND.test(value.id??''))throw new StripeAmbiguousResultError();
   if(value.status==='succeeded')return Object.freeze({outcome:'succeeded',providerRefundId:value.id});
   if(value.status==='failed')return Object.freeze({outcome:'failed',errorCode:'refund_failed'});
   throw new StripeAmbiguousResultError();
  }
 });
}
