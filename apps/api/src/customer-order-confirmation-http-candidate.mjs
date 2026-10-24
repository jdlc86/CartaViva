// Opt-in customer order confirmation HTTP candidate. Not registered in server.mjs.
// Durable QR, visit and customer-session authorization occurs inside confirm()
// under the same PostgreSQL transaction as idempotency and order persistence.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cents=v=>Number.isSafeInteger(v)&&v>=0;
const revision=v=>Number.isSafeInteger(v)&&v>0;
const validResult=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const data=(v,k)=>{if(!validResult(v))return false;
 const d=Object.getOwnPropertyDescriptor(v,k);
 return !!d&&d.enumerable&&Object.hasOwn(d,'value');};
// A thrown value is untrusted too: never invoke its message getter while
// mapping an internal failure to a public error code.
export const failureCode=error=>{
 if(!error||typeof error!=='object')return null;
 const d=Object.getOwnPropertyDescriptor(error,'message');
 return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'?d.value:null;
};
export function registerCustomerOrderConfirmationRoute(app,{confirm}={}){
 if(!app||typeof app.post!=='function'||typeof confirm!=='function')
  throw Error('invalid_customer_order_route_configuration');
 app.post('/api/v1/customer/orders/confirm',{bodyLimit:65536},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  const body=request.body;
  if(!validResult(body)||Reflect.ownKeys(body).length>16||
     Reflect.ownKeys(body).some(k=>typeof k!=='string'||!data(body,k)))
   return reply.code(400).send({error:'invalid_confirmation_input'});
  try{
   const result=await confirm(body);
   if(!validResult(result))throw Error('invalid_confirmation_result');
   if(!data(result,'status'))throw Error('invalid_confirmation_result');
   if(result.status==='acceptance_required'){
    if(!data(result,'decision')||!data(result.decision,'requiresAcceptance')||
       result.decision.requiresAcceptance!==true||!data(result,'acceptance'))
     throw Error('invalid_confirmation_result');
    const d=result.decision;
    const a=result.acceptance;
    if(['previousTotalCents','currentTotalCents','differenceCents',
        'previousPublishedRevision','currentPublishedRevision'].some(k=>!data(d,k))||
       !data(a,'token')||!data(a,'expiresAt')||
       !cents(d.previousTotalCents)||!cents(d.currentTotalCents)||
       !Number.isSafeInteger(d.differenceCents)||
       d.currentTotalCents-d.previousTotalCents!==d.differenceCents||
       !revision(d.previousPublishedRevision)||!revision(d.currentPublishedRevision)||
       d.previousPublishedRevision===d.currentPublishedRevision||
       !validResult(a)||typeof a.token!=='string'||
       !/^v1\.[0-9]{1,16}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(a.token)||
       !Number.isSafeInteger(a.expiresAt)||a.expiresAt<=0||
       Number(a.token.split('.')[1])!==a.expiresAt)
     throw Error('invalid_confirmation_result');
    // Explicit allowlist: never serialize internal evidence or catalog snapshot.
    return reply.code(409).send({error:'acceptance_required',
     repricing:{schemaVersion:1,previousTotalCents:d.previousTotalCents,
      currentTotalCents:d.currentTotalCents,differenceCents:d.differenceCents,
      previousPublishedRevision:d.previousPublishedRevision,
      currentPublishedRevision:d.currentPublishedRevision,
      acceptanceToken:a.token,expiresAt:a.expiresAt}});
   }
   if(!['confirmed','replayed'].includes(result.status)||
      !data(result,'result')||!data(result.result,'orderId')||
      !uuid.test(result.result.orderId))
    throw Error('invalid_confirmation_result');
   return reply.code(result.status==='confirmed'?201:200).send({
    status:result.status,orderId:result.result.orderId
   });
  }catch(error){
   const code=failureCode(error);
   if(code==='invalid_confirmation_input')
    return reply.code(400).send({error:'invalid_confirmation_input'});
   if(code==='order_context_forbidden')
    return reply.code(403).send({error:'order_context_forbidden'});
   if(error?.message==='order_idempotency_conflict')
    return reply.code(409).send({error:'order_idempotency_conflict'});
   if(['order_catalog_unavailable','order_previous_quote_unavailable',
     'order_displayed_quote_invalid','catalog_order_context_changed'].includes(code))
    return reply.code(409).send({error:'order_confirmation_conflict'});
   return reply.code(503).send({error:'order_confirmation_unavailable'});
  }
 });
}
