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
const validSelection=(v,depth=0)=>{
 if(depth>8)return false;
 if(v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=1024||
    typeof v==='number'&&Number.isSafeInteger(v))return true;
 if(Array.isArray(v))return v.length<=128&&v.every(x=>validSelection(x,depth+1));
 if(!plain(v)||Object.keys(v).length>64)return false;
 return Object.keys(v).every(k=>!['__proto__','prototype','constructor'].includes(k)&&
  k.length<=128&&validSelection(v[k],depth+1));
};
export function validateCustomerConfirmationRequest(input){
 if(!plain(input)||Object.keys(input).length>12||
    Object.keys(input).some(k=>!allowed.has(k))||
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
 return Object.freeze({...input});
}
export function createAuthorizedCustomerRequestReader({readContext,readBasket,createRequestKey}={}){
 if(typeof readContext!=='function'||typeof readBasket!=='function'||
    typeof createRequestKey!=='function')
  throw Error('invalid_customer_request_reader');
 return async()=>{
  const [context,basket]=await Promise.all([readContext(),readBasket()]);
  if(!plain(context)||context.authorized!==true||context.canOrder!==true||
     !plain(basket)||basket.confirmable!==true)
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
