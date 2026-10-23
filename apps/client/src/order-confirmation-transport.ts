// Candidate client-side order confirmation transport. Never persists bearer
// credentials, quotes or acceptance evidence and never silently retries POST.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorCodes: Record<number, ReadonlySet<string>>={
 400:new Set(['invalid_confirmation_input']),
 403:new Set(['order_context_forbidden']),
 409:new Set(['order_idempotency_conflict','order_confirmation_conflict','acceptance_required']),
 503:new Set(['order_confirmation_unavailable'])
};
const plain=(value: unknown): value is Record<string, unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||
  Object.getPrototypeOf(value)===null);
const validKeys=(obj: unknown,keys: string[])=>plain(obj)&&Object.keys(obj).length===keys.length&&
 keys.every(key=>Object.hasOwn(obj,key));
export async function confirmCustomerOrder({fetchImpl=globalThis.fetch,
 endpoint='/api/v1/customer/orders/confirm',payload,signal}: {
 fetchImpl?: typeof fetch;endpoint?: string;payload: Record<string, unknown>;
 signal?: AbortSignal;
}): Promise<{status:'confirmed'|'replayed';orderId:string}|{status:'rejected';error:string}|{status:'unavailable'}>{
 if(typeof fetchImpl!=='function'||typeof endpoint!=='string'||
    !endpoint.startsWith('/')||endpoint.startsWith('//')||
    endpoint.includes('#')||endpoint.includes('?')||
    !plain(payload)||typeof payload.requestKey!=='string')
  throw Error('invalid_customer_confirmation_transport');
 let response: Response;
 try{
  response=await fetchImpl(endpoint,{
   method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
   headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify(payload),...(signal===undefined?{}:{signal})
  });
 }catch{
  return Object.freeze({status:'unavailable'});
 }
 try{
  if(!response||!Number.isInteger(response.status)||
     !response.headers||typeof response.headers.get!=='function'||
     !String(response.headers.get('content-type')||'').toLowerCase()
      .startsWith('application/json'))
   return Object.freeze({status:'unavailable'});
  const data=await response.json();
  if((response.status===200||response.status===201)&&
     validKeys(data,['status','orderId'])&&
     data.status===(response.status===201?'confirmed':'replayed')&&
     typeof data.orderId==='string'&&uuid.test(data.orderId))
   return Object.freeze({status:data.status,orderId:data.orderId});
  if([400,403,409,503].includes(response.status)&&
     validKeys(data,['error'])&&typeof data.error==='string'&&
     errorCodes[response.status]?.has(data.error))
   return Object.freeze({status:'rejected',error:data.error});
 }catch{ /* malformed or unexpected responses fail closed */ }
 return Object.freeze({status:'unavailable'});
}
