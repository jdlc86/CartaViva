import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';
import {registerTableChangeStateStreamCandidate} from './table-change-state-stream-candidate.mjs';

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
 if(['invalid_customer_flow_input','invalid_customer_visit_input','invalid_customer_revision_request',
      'invalid_customer_payment_state_scope'].includes(failure))
  return reply.code(400).send({error:'invalid_customer_request'});
 if(['customer_session_forbidden','customer_table_forbidden','customer_order_context_forbidden','customer_payment_scope_forbidden',
      'customer_round_scope_forbidden']
    .includes(failure))return reply.code(403).send({error:'customer_context_forbidden'});
 if(failure==='customer_revision_scope_forbidden')
  return reply.code(403).send({error:'customer_context_forbidden'});
 if(['table_change_approval_required','h6_account_binding_scope_conflict',
     'h6_multiple_open_accounts_ambiguous','h6_replay_account_scope_conflict'].includes(failure))
  return reply.code(409).send({error:'table_change_confirmation_conflict'});
 if(failure==='customer_order_idempotency_conflict')
  return reply.code(409).send({error:'order_idempotency_conflict'});
 if(failure==='revision_idempotency_conflict')
  return reply.code(409).send({error:'revision_idempotency_conflict'});
 if(['revision_concurrency_conflict','revision_not_correctable','order_revision_not_dispatchable']
    .includes(failure))return reply.code(409).send({error:'revision_state_conflict'});
 if(['revision_payment_adjustment_required','revision_economic_reconciliation_required',
     'revision_payment_mode_required'].includes(failure))
  return reply.code(409).send({error:'revision_payment_review_required'});
 if(['revision_quote_invalid','revision_acceptance_required','invalid_revision_replacements']
    .includes(failure))return reply.code(409).send({error:'revision_correction_conflict'});
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
export function registerCustomerProductionFlowHttp(app,{cookieAuth,flow,tableChange=null,tableChangeNotifier=null,tableChangeObserveFailure=null}={}){
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
  if(typeof flow.readPaymentPolicy==='function')scope.get('/payment-policy',async(request,reply)=>{
   reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');
   // Reject unknown, repeated and forged parameters before entering the SQL reader.
   let params;
   try{params=new URL(request.raw.url,'http://sabora.invalid').searchParams;}
   catch{return reply.code(400).send({error:'invalid_customer_request'});}
   const keys=[...params.keys()];
   if(keys.length!==2||keys.some(k=>!['tableId','visitId'].includes(k))||
      params.getAll('tableId').length!==1||params.getAll('visitId').length!==1)
    return reply.code(400).send({error:'invalid_customer_request'});
   try{return reply.code(200).send(await flow.readPaymentPolicy({
    customerSessionToken:readCustomerCookie(request.headers.cookie),
    tableId:params.get('tableId'),visitId:params.get('visitId')}));}
   catch(error){return replyFailure(reply,error);}
  });
  if(tableChange&&typeof tableChange.readState==='function'){
   scope.get('/table-change/state',async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    reply.header('X-Content-Type-Options','nosniff');
    try{
     const result=await tableChange.readState({
      customerSessionToken:readCustomerCookie(request.headers.cookie)
     });
     if(!result||!['unbound','bound','pending','approved','rejected'].includes(result.state)||
        (result.boundTableId!==null&&typeof result.boundTableId!=='string')||
        !Number.isSafeInteger(result.serverNowMs)||
        (['pending','rejected'].includes(result.state)?
         !Number.isSafeInteger(result.expiresAtMs):result.expiresAtMs!==null))
      throw Error('invalid_table_change_state_result');
     return reply.code(200).send({state:result.state,
      boundTableId:result.boundTableId,expiresAtMs:result.expiresAtMs,
      serverNowMs:result.serverNowMs});
    }catch(error){
     if(['table_change_unauthorized','table_change_account_forbidden'].includes(code(error)))
      return reply.code(403).send({error:'customer_context_forbidden'});
     return reply.code(503).send({error:'customer_flow_unavailable'});
    }
   });
  }
  if(tableChangeNotifier)registerTableChangeStateStreamCandidate(scope,{
   tableChange,subscribeCommitted:tableChangeNotifier.subscribe,
   onFailure:tableChangeObserveFailure
  });
  if(tableChange&&typeof tableChange.request==='function'){
   scope.post('/table-change/requests',{bodyLimit:1024},async(request,reply)=>{
    if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
    if(!request.body||typeof request.body!=='object'||Array.isArray(request.body)||
       Object.keys(request.body).length!==0)return reply.code(400).send({error:'invalid_customer_request'});
    try{
     const result=await tableChange.request({customerSessionToken:readCustomerCookie(request.headers.cookie)});
     // Expose only the request receipt; never return account, customer,
     // session, visit, audit or internal store fields to the browser.
     if(!result||typeof result.id!=='string'||result.status!=='pending'||
        !Number.isSafeInteger(result.expiresAtMs)||result.expiresAtMs<=0||
        (result.sourceTableId!==undefined&&typeof result.sourceTableId!=='string')||
        (result.createdAtMs!==undefined&&
         (!Number.isSafeInteger(result.createdAtMs)||result.createdAtMs<0||
          result.expiresAtMs<=result.createdAtMs)))
      throw Error('invalid_table_change_request_result');
     // The sealed RPC returns only ID, state and deadline. Do not synthesize
     // a creation timestamp or disclose operational table/account bindings.
     return reply.header('Cache-Control','no-store').code(201).send({
      id:result.id,status:'pending',expiresAtMs:result.expiresAtMs,
      ...(result.sourceTableId===undefined?{}:{sourceTableId:result.sourceTableId}),
      ...(result.createdAtMs===undefined?{}:{createdAtMs:result.createdAtMs})
     });
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
  if(typeof flow.readPaymentState==='function')scope.get('/orders/:orderId/payment-state',async(request,reply)=>{
    reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');
    let params;
    try{params=new URL(request.raw.url,'http://sabora.invalid').searchParams;}
    catch{return reply.code(400).send({error:'invalid_customer_request'});}
    const keys=[...params.keys()];
    if(keys.length!==2||keys.some(k=>!['tableId','visitId'].includes(k))||
       params.getAll('tableId').length!==1||params.getAll('visitId').length!==1)
     return reply.code(400).send({error:'invalid_customer_request'});
    try{return reply.code(200).send(await flow.readPaymentState({
     customerSessionToken:readCustomerCookie(request.headers.cookie),
     tableId:params.get('tableId'),visitId:params.get('visitId'),
     orderId:request.params?.orderId}));}
    catch(error){return replyFailure(reply,error);}
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
  if(typeof flow.readOrderRevision==='function')scope.get('/orders/:orderId/revision',async(request,reply)=>{
   reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');
   try{
    const result=await flow.readOrderRevision({customerSessionToken:readCustomerCookie(request.headers.cookie),
     tableId:request.query?.tableId,visitId:request.query?.visitId,orderId:request.params?.orderId});
    return reply.send({...result,lines:result.lines.map(({evidence,...line})=>line)});
   }catch(error){return replyFailure(reply,error);}
  });
  if(typeof flow.resubmitOrderRevision==='function')scope.post('/orders/:orderId/revisions',
   {bodyLimit:65536},async(request,reply)=>{
    if(!json(request))return reply.code(415).send({error:'unsupported_media_type'});
    try{
     const result=await flow.resubmitOrderRevision({...request.body,orderId:request.params?.orderId,
      customerSessionToken:readCustomerCookie(request.headers.cookie)});
     if(result.status==='acceptance_required')return reply.code(409).send({
      error:'revision_acceptance_required',changes:result.changes,
      acceptanceToken:result.acceptance.token,expiresAt:result.acceptance.expiresAt});
     return reply.code(result.repeated?200:201).send(result);
    }catch(error){return replyFailure(reply,error);}
   });
 },{prefix:'/api/v1/customer'});
}
