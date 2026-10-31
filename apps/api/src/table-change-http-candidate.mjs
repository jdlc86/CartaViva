// F12 candidate staff HTTP surface. Mount only with the authenticated operations
// composition and an explicit waiter/admin role guard; never expose anonymously.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS=new Set(['approved','rejected']);
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 const names=Reflect.ownKeys(value);
 return names.length===keys.length&&names.every(key=>
  typeof key==='string'&&keys.includes(key)&&
  Object.prototype.propertyIsEnumerable.call(value,key)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}
export function registerTableChangeStaffHttp(app,{forRoles,service}={}){
 if(!app||typeof app.post!=='function'||typeof forRoles!=='function'||
  !service||typeof service.decide!=='function')
  throw Error('invalid_table_change_staff_http_configuration');
 const authorized=forRoles(['admin','waiter']);
 if(typeof authorized!=='function')throw Error('invalid_table_change_staff_http_configuration');
 app.post('/api/v1/operations/table-change/decisions',
  {preHandler:authorized,bodyLimit:1024},async(request,reply)=>{
   reply.header('Cache-Control','no-store');
   reply.header('X-Content-Type-Options','nosniff');
   if(typeof request.headers['content-type']!=='string'||
    !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type']))
    return reply.code(415).send({error:'unsupported_media_type'});
   if(!exact(request.body,['requestId','decision'])||
    !UUID.test(request.body.requestId)||!DECISIONS.has(request.body.decision))
    return reply.code(400).send({error:'invalid_table_change_decision'});
   if(!request.verifiedIdentity||!request.verifiedStaff)
    return reply.code(403).send({error:'forbidden'});
   try{
    const result=await service.decide({
     verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff,
     requestId:request.body.requestId,decision:request.body.decision
    });
    // Explicit public projection: never serialize a store result verbatim.
    // The request source, customer/account IDs and audit internals stay private.
    if(!result||!result.request||result.request.id!==request.body.requestId||
     result.request.status!==request.body.decision)
     throw Error('invalid_table_change_decision_result');
    return reply.code(200).send({
     requestId:result.request.id,status:result.request.status
    });
   }catch(error){
    if(error?.message==='table_change_unauthorized')
     return reply.code(403).send({error:'forbidden'});
    if(error?.message==='table_change_request_not_found')
     return reply.code(404).send({error:'table_change_request_not_found'});
    if(error?.message==='table_change_request_not_pending')
     return reply.code(409).send({error:'table_change_request_not_pending'});
    return reply.code(503).send({error:'table_change_unavailable'});
   }
  });
}
