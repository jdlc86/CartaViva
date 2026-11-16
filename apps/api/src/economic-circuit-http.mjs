import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const json=request=>/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']??'');
const sealed=reply=>reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');
const staff=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});
const failure=(reply,error)=>{
 const code=typeof error?.message==='string'?error.message:'';
 if(code.includes('forbidden'))return reply.code(403).send({error:'forbidden'});
 if(code.includes('not_found'))return reply.code(404).send({error:'economic_not_found'});
 if(code.includes('conflict')||code.includes('unavailable')||code.includes('mismatch')||
  code.includes('transition')||code.includes('unresolved'))
  return reply.code(409).send({error:'economic_conflict'});
 if(code.startsWith('invalid_'))return reply.code(400).send({error:'invalid_economic_request'});
 return reply.code(503).send({error:'economic_circuit_unavailable'});
};

export function registerEconomicCircuitHttp(app,{cookieAuth,forRoles,customer,staffRepository,service}={}){
 if(!app||typeof app.register!=='function'||!cookieAuth||typeof forRoles!=='function'||
  !customer||!staffRepository||!service)throw Error('invalid_economic_circuit_http');
 app.register(async scope=>{
  scope.addHook('preHandler',async(request,reply)=>{
   if(request.method!=='GET'&&!cookieAuth.requireSameOrigin(request,reply))return;
   await cookieAuth.authenticate(request,reply);
  });
  scope.post('/consumption',{bodyLimit:1024},async(request,reply)=>{
   sealed(reply);const body=request.body;
   if(!json(request)||!exact(body,['tableId','visitId'])||!UUID.test(body.tableId)||!KEY.test(body.visitId))
    return reply.code(400).send({error:'invalid_economic_request'});
   try{return reply.send(await customer.consumption({...body,
    customerSessionToken:readCustomerCookie(request.headers.cookie)}));}
   catch(error){return failure(reply,error);}
  });
  scope.post('/settlements',{bodyLimit:8192},async(request,reply)=>{
   sealed(reply);const body=request.body;
   if(!json(request)||!exact(body,['tableId','visitId','requestKey','channel','allocations'])||
    !UUID.test(body.tableId)||!KEY.test(body.visitId)||!KEY.test(body.requestKey)||
    !['stripe','external'].includes(body.channel)||!Array.isArray(body.allocations)||
    body.allocations.length<1||body.allocations.length>50||!body.allocations.every(x=>
     exact(x,['roundId','amountCents'])&&UUID.test(x.roundId)&&Number.isSafeInteger(x.amountCents)&&x.amountCents>0))
    return reply.code(400).send({error:'invalid_economic_request'});
   try{
    const created=await customer.create({...body,
     customerSessionToken:readCustomerCookie(request.headers.cookie)});
    const result=created.channel==='stripe'
     ?await service.authorizeAndCapture(created):created;
    return reply.code(created.repeated?200:201).send(result);
   }catch(error){return failure(reply,error);}
  });
 },{prefix:'/api/v1/customer/economic'});
 const floor=forRoles(['admin','root','waiter']);
 app.get('/api/v1/operations/economic/accounts',{preHandler:floor},async(request,reply)=>{
  sealed(reply);try{return reply.send(await staffRepository.read(staff(request)));}
  catch(error){return failure(reply,error);}
 });
 app.post('/api/v1/operations/economic/settlements/:intentId/external-verification',
  {preHandler:floor,bodyLimit:512},async(request,reply)=>{
   sealed(reply);const body=request.body;
   if(!json(request)||!UUID.test(request.params?.intentId??'')||
    !exact(body,['correlationId','verifiedOutsideSabora'])||!KEY.test(body.correlationId)||
    body.verifiedOutsideSabora!==true)return reply.code(400).send({error:'invalid_economic_request'});
   try{return reply.code(200).send(await staffRepository.verifyExternal(staff(request),{
    intentId:request.params.intentId,correlationId:body.correlationId}));}
   catch(error){return failure(reply,error);}
  });
 app.post('/api/v1/operations/economic/tables/:tableId/sessions/:sessionId/close',
  {preHandler:floor,bodyLimit:512},async(request,reply)=>{
   sealed(reply);const body=request.body;
   if(!json(request)||!UUID.test(request.params?.tableId??'')||!UUID.test(request.params?.sessionId??'')||
    !exact(body,['correlationId','operationalOnly'])||!KEY.test(body.correlationId)||
    body.operationalOnly!==true)return reply.code(400).send({error:'invalid_economic_request'});
   try{return reply.code(200).send(await staffRepository.closeTable(staff(request),{
    tableId:request.params.tableId,sessionId:request.params.sessionId,
    correlationId:body.correlationId}));}
   catch(error){return failure(reply,error);}
  });
}
