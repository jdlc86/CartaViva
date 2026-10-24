// Candidate HTTP adapter for the customer PWA. No credentials, tokens or request
// bodies are persisted. Caller provides the authenticated session context.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const data=(v,k)=>{const d=Object.getOwnPropertyDescriptor(v,k);
 return !!d&&d.enumerable&&own(d,'value');};
const validUuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function createCustomerOrderConfirmationTransport({fetchImpl,endpoint='/api/v1/customer/orders/confirm'}={}){
 if(typeof fetchImpl!=='function'||endpoint!=='/api/v1/customer/orders/confirm')
  throw Error('invalid_customer_confirmation_transport');
 return async function submit(request,{signal}={}){
  if(!plain(request)||!data(request,'requestKey')||
     typeof request.requestKey!=='string'||request.requestKey.length<8||
     request.requestKey.length>128)
   throw Error('invalid_confirmation_request');
  // The authorized reader normally supplies a validated snapshot. This
  // transport still rejects accessor-backed DTOs before serialization.
  if(Reflect.ownKeys(request).some(k=>typeof k!=='string'||!data(request,k)))
   throw Error('invalid_confirmation_request');
  const body=JSON.stringify(request);
  if(new TextEncoder().encode(body).length>65536)
   throw Error('invalid_confirmation_request');
  let response;
  try{
   response=await fetchImpl(endpoint,{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    cache:'no-store',redirect:'error',body,signal});
  }catch{
   // Ambiguous network failure: do not invent success or rotate requestKey.
   throw Error('confirmation_network_unknown');
  }
  if(!response||!Number.isSafeInteger(response.status)||
     ![200,201,400,403,409,503].includes(response.status))
   throw Error('confirmation_unexpected_response');
  let result;
  try{result=await response.json();}catch{throw Error('confirmation_unexpected_response');}
  if(!plain(result)||(!data(result,'error')&&!data(result,'status'))||
     (data(result,'error')&&typeof result.error!=='string')||
     (data(result,'status')&&typeof result.status!=='string'))
   throw Error('confirmation_unexpected_response');
  if(response.status===409&&data(result,'error')&&
     result.error==='acceptance_required'){
   // The consent controller validates the full repricing DTO before display.
   return result;
  }
  if([200,201].includes(response.status)){
   if(!data(result,'status')||(response.status===201&&result.status!=='confirmed')||
      (response.status===200&&result.status!=='replayed')||
      !data(result,'orderId')||!validUuid(result.orderId))
    throw Error('confirmation_unexpected_response');
   return Object.freeze({status:result.status,orderId:result.orderId});
  }
  const allowed=new Set(['invalid_confirmation_input','order_context_forbidden',
   'order_idempotency_conflict','order_confirmation_conflict',
   'order_catalog_unavailable','order_previous_quote_unavailable',
   'order_displayed_quote_invalid','order_selection_changed',
   'order_confirmation_unavailable']);
  return Object.freeze({error:data(result,'error')&&allowed.has(result.error)?result.error:
   'order_confirmation_unavailable'});
 };
}
