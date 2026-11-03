// Candidate-only server-side Stripe webhook verifier. Never mount by default.
// A signature-authenticated event is not a settlement until the sealed H6
// provider SQL validates the persisted intent/attempt and its transition.
// Use unmodified raw request bytes. Do not trust parsed JSON from a client.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

const EVENT=/^evt_[A-Za-z0-9]{8,128}$/;
const PROVIDER=/^(pi|ch|re)_[A-Za-z0-9]{8,128}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPORTED=new Set(['payment_intent.succeeded','payment_intent.canceled',
 'payment_intent.payment_failed','refund.updated']);
const fatal=()=>Error('stripe_webhook_unverified');
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const str=value=>typeof value==='string'&&value.length>0;

function validSignature(raw,header,secret,now){
 if(!str(header)||header.length>2000)throw fatal();
 const parts=header.split(','),ts=parts.filter(x=>x.startsWith('t='));
 const signatures=parts.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
 if(ts.length!==1||!/^t=[0-9]{9,12}$/.test(ts[0])||signatures.length<1||
    signatures.length>8)throw fatal();
 const seconds=Number(ts[0].slice(2));
 if(!Number.isSafeInteger(seconds)||Math.abs(Math.floor(now/1000)-seconds)>300)throw fatal();
 const expected=createHmac('sha256',secret)
  .update(String(seconds)+'.').update(raw).digest();
 if(!signatures.some(value=>{
  if(!/^[0-9a-f]{64}$/i.test(value))return false;
  return timingSafeEqual(Buffer.from(value,'hex'),expected);
 }))throw fatal();
}

export function createVerifiedH6StripeWebhookCandidate({
 provider,endpointSecret,expectedLivemode=false,nowMs=Date.now
}={}){
 if(typeof provider?.ingestWebhook!=='function'||!Buffer.isBuffer(endpointSecret)||
    endpointSecret.length<32||endpointSecret.length>256||
    typeof expectedLivemode!=='boolean'||typeof nowMs!=='function')
  throw Error('invalid_stripe_webhook_configuration');
 const key=Buffer.from(endpointSecret);
 return async function ingest({rawBody,stripeSignature}={}){
  const raw=Buffer.isBuffer(rawBody)?rawBody:null;
  if(!raw||raw.length<2||raw.length>262144)throw fatal();
  const clock=nowMs();
  if(!Number.isSafeInteger(clock)||clock<0)throw fatal();
  validSignature(raw,stripeSignature,key,clock);
  let event;
  try{event=JSON.parse(raw.toString('utf8'));}catch{throw fatal();}
  if(!obj(event)||!EVENT.test(event.id??'')||!SUPPORTED.has(event.type)||
     event.livemode!==expectedLivemode||!Number.isSafeInteger(event.created)||
     event.created<=0||event.account!==undefined&&event.account!==null||
     !obj(event.data)||!obj(event.data.object))throw fatal();
  const payment=event.type.startsWith('payment_intent.');
  const value=event.data.object;
  if(value.object!==(payment?'payment_intent':'refund')||
     !PROVIDER.test(value.id??'')||
     !value.id.startsWith(payment?'pi_':'re_'))throw fatal();
  if(event.type==='payment_intent.succeeded'&&
     (value.status!=='succeeded'||!/^ch_[A-Za-z0-9]{8,128}$/.test(value.latest_charge??'')))
   throw fatal();
  if(event.type==='refund.updated'&&
     (!['pending','requires_action','succeeded','failed','canceled'].includes(value.status)||
      !UUID.test(value.metadata?.sabora_refund_attempt_id??'')))throw fatal();
  const args={
   eventId:event.id,eventType:event.type,providerObjectId:value.id,
   providerCreatedAt:new Date(event.created*1000),
   payloadSha256:createHash('sha256').update(raw).digest(),
   ...(event.type==='payment_intent.succeeded'?{providerChargeId:value.latest_charge}:{}),
   ...(event.type==='refund.updated'?{
    refundAttemptId:value.metadata.sabora_refund_attempt_id,refundStatus:value.status}:null)
  };
  return provider.ingestWebhook(args);
 };
}
