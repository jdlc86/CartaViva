import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const PROOF=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));
const json=request=>/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??'');
const sealed=reply=>reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');
function failure(reply,error){
 const code=typeof error?.message==='string'?error.message:'';
 if(['third_party_scope_forbidden','third_party_cash_forbidden','third_party_refund_forbidden',
  'third_party_refund_proof_invalid','third_party_refund_unavailable'].includes(code))
  return reply.code(403).send({error:'forbidden'});
 if(['third_party_cash_conflict','third_party_debt_unavailable','third_party_idempotency_conflict',
  'third_party_refund_exceeds_funding','h6_idempotency_conflict','third_party_payer_proof_required'].includes(code))
  return reply.code(409).send({error:'third_party_cash_conflict'});
 if(['invalid_third_party_intent','invalid_third_party_scope','invalid_third_party_cash_operation'].includes(code))
  return reply.code(400).send({error:'invalid_third_party_request'});
 return reply.code(503).send({error:'third_party_cash_unavailable'});
}
const staff=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});
const customer=request=>readCustomerCookie(request.headers.cookie);
export function registerThirdPartyCashHttp(app,{cookieAuth,forRoles,payer,operations}={}){
 if(!app||typeof app.register!=='function'||!cookieAuth||
  typeof cookieAuth.authenticate!=='function'||typeof cookieAuth.requireSameOrigin!=='function'||
  typeof forRoles!=='function'||!payer||!operations)
  throw Error('invalid_third_party_cash_http');
 app.register(async scope=>{
  scope.addHook('preHandler',async(request,reply)=>{
   if(request.method!=='GET'&&!cookieAuth.requireSameOrigin(request,reply))return;
   await cookieAuth.authenticate(request,reply);
  });
  scope.post('/debts',{bodyLimit:1024},async(request,reply)=>{
   sealed(reply);
   if(!json(request)||!exact(request.body,['tableId','visitId'])||
    !UUID.test(request.body.tableId)||!KEY.test(request.body.visitId))
    return reply.code(400).send({error:'invalid_third_party_request'});
   try{return reply.send(await payer.debts({...request.body,customerSessionToken:customer(request)}));}
   catch(error){return failure(reply,error);}
  });
  scope.post('/intents',{bodyLimit:4096},async(request,reply)=>{
   sealed(reply);
   const body=request.body;
   if(!json(request)||!exact(body,['tableId','visitId','consent','rounds','requestKey'])||
    body.consent!==true||!Array.isArray(body.rounds)||body.rounds.length<1||body.rounds.length>10||
    !body.rounds.every(x=>exact(x,['roundId','amountCents'])&&UUID.test(x.roundId)&&
     Number.isSafeInteger(x.amountCents)&&x.amountCents>0)||
    !UUID.test(body.tableId)||!KEY.test(body.visitId)||!KEY.test(body.requestKey))
    return reply.code(400).send({error:'invalid_third_party_request'});
   try{const result=await payer.intent({...body,customerSessionToken:customer(request)});
    return reply.code(result.repeated?200:201).send(result);}
   catch(error){return failure(reply,error);}
  });
  scope.get('/refunds',async(request,reply)=>{
   sealed(reply);
   try{return reply.send(await payer.refunds({customerSessionToken:customer(request)}));}
   catch(error){return failure(reply,error);}
  });
  scope.post('/refunds/:incidentId/proof',{bodyLimit:512},async(request,reply)=>{
   sealed(reply);
   if(!json(request)||!UUID.test(request.params?.incidentId??'')||
    !exact(request.body,[]))return reply.code(400).send({error:'invalid_third_party_request'});
   try{return reply.code(201).send(await payer.issueRefundProof({
    customerSessionToken:customer(request),incidentId:request.params.incidentId}));}
   catch(error){return failure(reply,error);}
  });
 },{prefix:'/api/v1/customer/third-party/cash'});
 const floor=forRoles(['admin','root','waiter']);
 app.get('/api/v1/operations/third-party/cash/pending',{preHandler:floor},
  async(request,reply)=>{
   sealed(reply);
   try{return reply.send(await operations.pending(staff(request)));}
   catch(error){return failure(reply,error);}
  });
 app.post('/api/v1/operations/third-party/cash/:intentId/settle',
  {preHandler:floor,bodyLimit:512},async(request,reply)=>{
   sealed(reply);
   const body=request.body;
   if(!json(request)||!UUID.test(request.params?.intentId??'')||
    !exact(body,['correlationId','received'])||body.received!==true||
    !KEY.test(body.correlationId))return reply.code(400).send({error:'invalid_third_party_request'});
   try{return reply.code(201).send(await operations.settle(staff(request),{
    intentId:request.params.intentId,correlationId:body.correlationId}));}
   catch(error){return failure(reply,error);}
  });
 app.post('/api/v1/operations/third-party/refunds/:incidentId',
  {preHandler:floor,bodyLimit:1024},async(request,reply)=>{
   sealed(reply);
   const body=request.body;
   if(!json(request)||!UUID.test(request.params?.incidentId??'')||
    !exact(body,['claimId','proof','correlationId','handedOver'])||
    !UUID.test(body.claimId)||!PROOF.test(body.proof)||!KEY.test(body.correlationId)||
    body.handedOver!==true)return reply.code(400).send({error:'invalid_third_party_request'});
   try{return reply.code(201).send(await operations.refund(staff(request),{
    incidentId:request.params.incidentId,claimId:body.claimId,
    proof:body.proof,correlationId:body.correlationId}));}
   catch(error){return failure(reply,error);}
  });
}
