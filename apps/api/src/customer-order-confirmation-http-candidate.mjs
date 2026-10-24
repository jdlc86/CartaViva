// Opt-in customer order confirmation HTTP candidate. Not registered in server.mjs.
// Durable QR, visit and customer-session authorization occurs inside confirm()
// under the same PostgreSQL transaction as idempotency and order persistence.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validResult=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export function registerCustomerOrderConfirmationRoute(app,{confirm}={}){
 if(!app||typeof app.post!=='function'||typeof confirm!=='function')
  throw Error('invalid_customer_order_route_configuration');
 app.post('/api/v1/customer/orders/confirm',{bodyLimit:65536},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  const body=request.body;
  if(!validResult(body)||Object.keys(body).length>16)
   return reply.code(400).send({error:'invalid_confirmation_input'});
  try{
   const result=await confirm(body);
   if(!validResult(result))throw Error('invalid_confirmation_result');
   if(result.status==='acceptance_required'){
    if(!validResult(result.decision)||result.decision.requiresAcceptance!==true)
     throw Error('invalid_confirmation_result');
    // Do not serialize internal decision/evidence or signed token until a
    // versioned, reviewed public repricing DTO is approved.
    return reply.code(409).send({error:'acceptance_required'});
   }
   if(!['confirmed','replayed'].includes(result.status)||
      !validResult(result.result)||!uuid.test(result.result.orderId))
    throw Error('invalid_confirmation_result');
   return reply.code(result.status==='confirmed'?201:200).send({
    status:result.status,orderId:result.result.orderId
   });
  }catch(error){
   if(error?.message==='invalid_confirmation_input')
    return reply.code(400).send({error:'invalid_confirmation_input'});
   if(error?.message==='order_context_forbidden')
    return reply.code(403).send({error:'order_context_forbidden'});
   if(error?.message==='order_idempotency_conflict')
    return reply.code(409).send({error:'order_idempotency_conflict'});
   if(['order_catalog_unavailable','order_previous_quote_unavailable',
     'order_displayed_quote_invalid','catalog_order_context_changed'].includes(error?.message))
    return reply.code(409).send({error:'order_confirmation_conflict'});
   return reply.code(503).send({error:'order_confirmation_unavailable'});
  }
 });
}
