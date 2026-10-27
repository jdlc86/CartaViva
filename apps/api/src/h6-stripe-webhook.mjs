import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

const EVENT=/^evt_[A-Za-z0-9]{8,128}$/;
const OBJECT=/^(pi|ch|re)_[A-Za-z0-9]{8,128}$/;
const TYPES=new Set(['payment_intent.amount_capturable_updated','payment_intent.payment_failed',
 'payment_intent.succeeded','payment_intent.canceled','charge.refunded','refund.updated']);

const signatures=value=>{
 if(typeof value!=='string'||value.length>4096)return null;
 let timestamp=null;const v1=[];
 for(const part of value.split(',')){
  const [key,item]=part.split('=',2);
  if(key==='t'&&/^[0-9]{10,13}$/.test(item??''))timestamp=Number(item);
  if(key==='v1'&&/^[0-9a-f]{64}$/.test(item??''))v1.push(item);
 }
 return timestamp!==null&&v1.length?{timestamp,v1}:null;
};

export function verifyH6StripeWebhook({rawBody,signatureHeader,secret,nowMs=Date.now(),toleranceSeconds=300}={}){
 if(!(rawBody instanceof Uint8Array)||rawBody.byteLength<2||rawBody.byteLength>1024*1024||
    typeof secret!=='string'||!/^whsec_[A-Za-z0-9_]{16,}$/.test(secret)||
    !Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(toleranceSeconds)||
    toleranceSeconds<1||toleranceSeconds>300)throw Error('invalid_stripe_webhook_input');
 const parsed=signatures(signatureHeader);
 if(!parsed||Math.abs(Math.floor(nowMs/1000)-parsed.timestamp)>toleranceSeconds)
  throw Error('invalid_stripe_webhook_signature');
 const body=Buffer.from(rawBody);
 const expected=createHmac('sha256',secret).update(String(parsed.timestamp)).update('.').update(body).digest();
 if(!parsed.v1.some(candidate=>timingSafeEqual(expected,Buffer.from(candidate,'hex'))))
  throw Error('invalid_stripe_webhook_signature');
 let event;
 try{event=JSON.parse(body.toString('utf8'));}catch{throw Error('invalid_stripe_webhook_payload');}
 const object=event?.data?.object;
 if(!EVENT.test(event?.id??'')||!TYPES.has(event?.type)||!OBJECT.test(object?.id??'')||
    !Number.isSafeInteger(event?.created)||event.created<1)
  throw Error('invalid_stripe_webhook_payload');
 let providerChargeId=null;
 let captureBefore=null;
 let refundAttemptId=null,refundStatus=null;
 if(event.type==='payment_intent.succeeded'){
  providerChargeId=typeof object.latest_charge==='string'?object.latest_charge:object.latest_charge?.id;
  if(typeof providerChargeId!=='string'||!/^ch_[A-Za-z0-9]{8,128}$/.test(providerChargeId))
   throw Error('invalid_stripe_webhook_payload');
 }
 if(event.type==='payment_intent.amount_capturable_updated'){
  const raw=object?.latest_charge?.payment_method_details?.card?.capture_before;
  if(!Number.isSafeInteger(raw)||raw<1)throw Error('invalid_stripe_webhook_payload');
  captureBefore=new Date(raw*1000);
 }
 if(event.type==='refund.updated'){
  refundAttemptId=object?.metadata?.sabora_refund_attempt_id;
  refundStatus=object?.status;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refundAttemptId??'')||
     !['pending','requires_action','succeeded','failed','canceled'].includes(refundStatus))
   throw Error('invalid_stripe_webhook_payload');
 }
 return Object.freeze({eventId:event.id,eventType:event.type,providerObjectId:object.id,
  providerCreatedAt:new Date(event.created*1000),payloadSha256:createHash('sha256').update(body).digest(),
  providerChargeId,captureBefore,refundAttemptId,refundStatus});
}

export function createH6StripeWebhookHandler({secret,providerRepository,clock=Date.now}={}){
 if(typeof secret!=='string'||!providerRepository||typeof providerRepository.ingestWebhook!=='function'||
    typeof clock!=='function')throw Error('invalid_h6_stripe_webhook_handler');
 return async({rawBody,signatureHeader}={})=>providerRepository.ingestWebhook(
  verifyH6StripeWebhook({rawBody,signatureHeader,secret,nowMs:clock()}));
}
