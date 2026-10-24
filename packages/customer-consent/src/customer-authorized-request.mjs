// Candidate customer PWA request boundary, matching the backend coordinator's
// required fields. Never derive actor identity or visit from display preferences.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v);
const token=v=>typeof v==='string'&&v.length>=32&&v.length<=512;
const fields=['tableId','visitId','basketId','actorId','itemId','selection',
 'quantity','requestKey','qrToken','customerSessionToken'];
const allowed=new Set([...fields,'acceptanceToken']);
// Adapter DTOs must be own, enumerable data fields; never invoke getters
// while evaluating authorization or constructing a confirmation request.
const dataFields=(value,names)=>plain(value)&&names.every(name=>{
 const d=Object.getOwnPropertyDescriptor(value,name);
 return !!d&&d.enumerable&&own(d,'value');
});
const validSelection=(v,depth=0,seen=new Set())=>{
 if(depth>8)return false;
 if(v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=1024||
    typeof v==='number'&&Number.isSafeInteger(v))return true;
 if(!Array.isArray(v)&&!plain(v)||seen.has(v))return false;
 const keys=Reflect.ownKeys(v).filter(k=>k!=='length'||!Array.isArray(v));
 if(keys.length>128||(Array.isArray(v)&&keys.length!==v.length))return false;
 seen.add(v);
 const valid=keys.every(k=>{
  if(typeof k!=='string'||k.length>128||['__proto__','prototype','constructor'].includes(k))return false;
  const d=Object.getOwnPropertyDescriptor(v,k);
  return !!d&&d.enumerable&&own(d,'value')&&validSelection(d.value,depth+1,seen);
 });
 seen.delete(v);
 return valid;
};
export function validateCustomerConfirmationRequest(input){
 const descriptors=plain(input)?Object.getOwnPropertyDescriptors(input):null;
 if(!descriptors||Reflect.ownKeys(input).length>12||
    Reflect.ownKeys(input).some(k=>typeof k!=='string'||!allowed.has(k)||
     !descriptors[k]?.enumerable||!own(descriptors[k],'value'))||
    fields.some(k=>!own(input,k))||
    !id(input.tableId)||!id(input.visitId)||!id(input.basketId)||
    !id(input.actorId)||!id(input.itemId)||!key(input.requestKey)||
    !token(input.qrToken)||!token(input.customerSessionToken)||
    !Number.isSafeInteger(input.quantity)||input.quantity<1||
    !validSelection(input.selection)||
    own(input,'acceptanceToken')&&
     (typeof input.acceptanceToken!=='string'||input.acceptanceToken.length>4096))
  throw Error('invalid_customer_confirmation_request');
 const encoded=JSON.stringify(input);
 if(new TextEncoder().encode(encoded).length>16384)
  throw Error('invalid_customer_confirmation_request');
 return Object.freeze(structuredClone(input));
}
export function createAuthorizedCustomerRequestReader({readContext,readBasket,createRequestKey}={}){
 if(typeof readContext!=='function'||typeof readBasket!=='function'||
    typeof createRequestKey!=='function')
  throw Error('invalid_customer_request_reader');
 return async()=>{
  const [context,basket]=await Promise.all([readContext(),readBasket()]);
  if(!dataFields(context,['authorized','canOrder','tableId','visitId',
       'actorId','qrToken','customerSessionToken'])||
     !dataFields(basket,['confirmable','basketId','itemId',
       'selection','quantity'])||
     context.authorized!==true||context.canOrder!==true||
     basket.confirmable!==true)
   throw Error('customer_session_not_authorized');
  const request={
   tableId:context.tableId,visitId:context.visitId,actorId:context.actorId,
   qrToken:context.qrToken,customerSessionToken:context.customerSessionToken,
   basketId:basket.basketId,itemId:basket.itemId,selection:basket.selection,
   quantity:basket.quantity,requestKey:createRequestKey(basket)
  };
  return validateCustomerConfirmationRequest(request);
 };
}
