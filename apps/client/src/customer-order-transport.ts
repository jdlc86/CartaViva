// Standalone customer-side order transport candidate; no PWA wiring.
// Server remains the sole authority for price, identity, QR and order state.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses=new Set(['confirmed','replayed']);
const errors=new Set(['invalid_confirmation_input','order_context_forbidden',
 'order_idempotency_conflict','order_confirmation_conflict',
 'acceptance_required','order_confirmation_unavailable']);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export class CustomerOrderTransportError extends Error{
 constructor(code,httpStatus){
  super(code);
  this.name='CustomerOrderTransportError';
  this.code=code;
  this.httpStatus=httpStatus;
 }
}
export function createCustomerOrderTransport({fetchImpl,baseUrl=''}={}){
 if(typeof fetchImpl!=='function'||typeof baseUrl!=='string'||
    (baseUrl!==''&&!/^https:\/\/[^/?#]+$/.test(baseUrl)))
  throw Error('invalid_customer_order_transport_configuration');
 return Object.freeze({
  async confirm(input){
   if(!record(input)||Reflect.ownKeys(input).length>16)
    throw new CustomerOrderTransportError('invalid_confirmation_input',400);
   let response;
   try{
    response=await fetchImpl(baseUrl+'/api/v1/customer/orders/confirm',{
     method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
     cache:'no-store',credentials:'omit',redirect:'error',
     body:JSON.stringify(input)
    });
   }catch{
    throw new CustomerOrderTransportError('order_confirmation_unavailable',503);
   }
   if(!response||typeof response.status!=='number'||typeof response.json!=='function')
    throw new CustomerOrderTransportError('order_confirmation_unavailable',503);
   let body;
   try{body=await response.json();}catch{
    throw new CustomerOrderTransportError('order_confirmation_unavailable',503);
   }
   if(!record(body))
    throw new CustomerOrderTransportError('order_confirmation_unavailable',503);
   if(response.status===201||response.status===200){
    if(!statuses.has(body.status)||!uuid.test(body.orderId)||
       (response.status===201)!==(body.status==='confirmed'))
     throw new CustomerOrderTransportError('order_confirmation_unavailable',503);
    return Object.freeze({status:body.status,orderId:body.orderId});
   }
   if([400,403,409,503].includes(response.status)&&
      own(body,'error')&&errors.has(body.error))
    throw new CustomerOrderTransportError(body.error,response.status);
   throw new CustomerOrderTransportError('order_confirmation_unavailable',503);
  }
 });
}
