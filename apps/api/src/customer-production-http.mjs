import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';

const json=request=>typeof request.headers['content-type']==='string'&&
 /^application\/json(?:\s*;|$)/i.test(request.headers['content-type']);
const code=error=>{
 if(!error||typeof error!=='object')return '';
 const descriptor=Object.getOwnPropertyDescriptor(error,'message');
 return descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'?
  descriptor.value:'';
};
const replyFailure=(reply,error)=>{
 const failure=code(error);
 if(['invalid_customer_flow_input','invalid_customer_visit_input'].includes(failure))
  return reply.code(400).send({error:'invalid_customer_request'});
 if(['customer_session_forbidden','customer_table_forbidden','customer_order_context_forbidden']
    .includes(failure))return reply.code(403).send({error:'customer_context_forbidden'});
 if(failure==='customer_order_idempotency_conflict')
  return reply.code(409).send({error:'order_idempotency_conflict'});
 if(['payment_mode_required','invalid_payment_mode'].includes(failure))
  return reply.code(400).send({error:'payment_mode_required'});
 if(['table_requires_pay_now','payment_mode_conflict','payment_policy_conflict',
     'payment_outcome_unknown'].includes(failure))
  return reply.code(409).send({error:'payment_policy_conflict'});
 if(['customer_quote_unavailable','customer_quote_context_changed',
     'customer_order_confirmation_conflict','customer_order_quote_invalid',
     'customer_order_evidence_invalid','order_displayed_quote_invalid',
     'order_selection_changed','customer_order_context_changed',
     'customer_order_acceptance_invalid'].includes(failure))
  return reply.code(409).send({error:'customer_order_conflict'});
 return reply.code(503).send({error:'customer_flow_unavailable'});
};

// Explicit opt-in adapter. Cookie authentication and same-origin enforcement
// are injected and apply before any QR, quote or order capability runs.
export function registerCustomerProductionFlowHttp(app,{cookieAuth,flow,tableChange=null}={}){
 if(!app||typeof app.register!=='function'||!cookieAuth||
    typeof cookieAuth.authenticate!=='function'||typeof cookieAuth.requireSameOrigin!=='function'||
    typeof cookieAuth.logout!=='function'||!flow||typeof flow.authorizeVisit!=='function'||
    typeof flow.quote!=='function'||typeof flow.confirm!=='function')
  throw Error('invalid_customer_production_http_configuration');
 return app.register(async scope=>{
  scope.addHook('preHandler',async(request,reply)=>{
   if(request.method!=='GET'&&!cookieAuth.requireSameOrigin(request,reply))return;
   if(request.method==='POST'&&request.url.split('?')[0].endsWith('/logout'))return;
   await cookieAuth.authenticate(request,reply);
  });
  scope.get('/session',async request=>({authenticated:true,
   publicId:request.customerIdentity.publicId,alias:request.customerIdentity.alias,
   company:request.customerIdentity.company}));
  scope.post('/logout',cookieAuth.logout);
  scope.post('/visits',{bodyLimit:4096},async(request,reply)=>{
   if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
   try{
    const result=await flow.authorizeVisit({...request.body,
     customerSessionToken:readCustomerCookie(request.headers.cookie)});
    return reply.code(201).send(result);
   }catch(error){return replyFailure(reply,error);}
  });
  if(tableChange&&typeof tableChange.request==='function'){
   scope.post('/table-change/requests',{bodyLimit:1024},async(request,reply)=>{
    if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
    if(!request.body||typeof request.body!=='object'||Array.isArray(request.body)||
       Object.keys(request.body).length!==0)return reply.code(400).send({error:'invalid_customer_request'});
    try{
     const result=await tableChange.request({customerSessionToken:readCustomerCookie(request.headers.cookie)});
     return reply.header('Cache-Control','no-store').code(201).send(result);
    }catch(error){
     const failure=code(error);
     if(failure==='table_change_request_locked')return reply.code(409).send({error:'table_change_request_locked'});
     if(['table_change_unauthorized','table_change_account_forbidden'].includes(failure))
      return reply.code(403).send({error:'customer_context_forbidden'});
     return reply.code(503).send({error:'customer_flow_unavailable'});
    }
   });
  }
  scope.post('/quotes',{bodyLimit:65536},async(request,reply)=>{
   if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
   try{
    const result=await flow.quote({...request.body,
     customerSessionToken:readCustomerCookie(request.headers.cookie)});
    return reply.code(201).send(result);
   }catch(error){return replyFailure(reply,error);}
  });
  if(typeof flow.lookupConfirmation==='function')scope.post('/orders/lookup',{bodyLimit:4096},async(request,reply)=>{
   if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
   try{
    const result=await flow.lookupConfirmation({...request.body,
     customerSessionToken:readCustomerCookie(request.headers.cookie)});
    return reply.header('Cache-Control','no-store').send(result);
   }catch(error){return replyFailure(reply,error);}
  });
  scope.post('/orders/confirm',{bodyLimit:65536},async(request,reply)=>{
   if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
   try{
    const result=await flow.confirm({...request.body,
     customerSessionToken:readCustomerCookie(request.headers.cookie)});
    if(result.status==='acceptance_required')return reply.code(409).send({
     error:'acceptance_required',changes:result.changes,
     acceptanceToken:result.acceptance.token,expiresAt:result.acceptance.expiresAt
    });
    return reply.code(result.status==='confirmed'?201:200).send({status:result.status,
     orderId:result.orderId,grouping:result.grouping,
     ...(result.accountId?{accountId:result.accountId,roundId:result.roundId,
      amountCents:result.amountCents,paymentMode:result.paymentMode,
      roundState:result.roundState,paymentState:result.paymentState??null,
      requiresPaymentAction:typeof result.clientSecret==='string'}:null),
     ...(result.clientSecret?{clientSecret:result.clientSecret}:null)});
   }catch(error){return replyFailure(reply,error);}
  });
 },{prefix:'/api/v1/customer'});
}
