type FetchLike=typeof fetch;
type Json=Record<string,unknown>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_ID=/^SB-[23456789ABCDEFGHJKLMNPQRSTUVWXY]{12}$/;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const QR_TOKEN=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const plain=(value:unknown):value is Json=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

export class CustomerFlowTransportError extends Error{
 readonly status:number;
 readonly details:Json|null;
 constructor(message:string,status:number,details:Json|null=null){super(message);this.name='CustomerFlowTransportError';this.status=status;this.details=details;}
}

async function jsonRequest(fetchImpl:FetchLike,path:string,method:'GET'|'POST',body?:unknown){
 let response:Response;
 try{response=await fetchImpl(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',
  headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});}
 catch{throw new CustomerFlowTransportError('customer_flow_unavailable',503);}
 let value:unknown;
 try{
  if(!String(response.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw Error();
  value=await response.json();
 }catch{throw new CustomerFlowTransportError('customer_flow_unavailable',503);}
 if(!response.ok){
  const error=plain(value)&&typeof value.error==='string'?value.error:'customer_flow_unavailable';
  throw new CustomerFlowTransportError(error,response.status,plain(value)?value:null);
 }
 if(!plain(value))throw new CustomerFlowTransportError('customer_flow_unavailable',503);
 return value;
}

export function createCustomerFlowTransport({fetchImpl=globalThis.fetch}:{fetchImpl?:FetchLike}={}){
 if(typeof fetchImpl!=='function')throw Error('invalid_customer_flow_transport');
 return Object.freeze({
  async session(){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/session','GET');
   if(value.authenticated!==true||typeof value.publicId!=='string'||!PUBLIC_ID.test(value.publicId)||
      typeof value.alias!=='string'||!value.alias.trim()||
      (value.company!==null&&typeof value.company!=='string'))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({publicId:value.publicId,alias:value.alias,company:value.company as string|null});
  },
  async register(profile:{alias:string;company:string|null}){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/register','POST',profile);
   if(typeof value.publicId!=='string'||!PUBLIC_ID.test(value.publicId)||
      typeof value.alias!=='string'||!value.alias.trim()||
      (value.company!==null&&typeof value.company!=='string'))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({publicId:value.publicId,alias:value.alias,company:value.company as string|null});
  },
  async logout(){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/logout','POST',{});
   if(typeof value.revoked!=='boolean')throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return value.revoked;
  },
  async requestTableChange(){
   // The destination must never be part of the request payload.
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/table-change/requests','POST',{});
   if(typeof value.id!=='string'||!UUID.test(value.id)||
      typeof value.sourceTableId!=='string'||!UUID.test(value.sourceTableId)||
      value.status!=='pending'||
      !Number.isSafeInteger(value.createdAtMs)||!Number.isSafeInteger(value.expiresAtMs)||
      (value.expiresAtMs as number)<=(value.createdAtMs as number))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({requestId:value.id,sourceTableId:value.sourceTableId,
    status:'pending' as const,createdAtMs:value.createdAtMs as number,
    expiresAtMs:value.expiresAtMs as number});
  },
  async authorizeVisit(input:{tableId:string;qrToken:string}){
   if(!UUID.test(input.tableId)||typeof input.qrToken!=='string'||!QR_TOKEN.test(input.qrToken))
    throw Error('invalid_customer_visit_transport');
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/visits','POST',input);
   if(value.tableId!==input.tableId||typeof value.visitId!=='string'||!KEY.test(value.visitId)||
      typeof value.basketId!=='string'||!KEY.test(value.basketId)||
      typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||
      (value.paymentPolicy!==undefined&&(!plain(value.paymentPolicy)||
       typeof value.paymentPolicy.requirePayAsOrdered!=='boolean'||
       !Number.isSafeInteger(value.paymentPolicy.version)||(value.paymentPolicy.version as number)<1)))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({tableId:value.tableId as string,visitId:value.visitId,
    basketId:value.basketId,expiresAt:value.expiresAt,
    paymentPolicy:value.paymentPolicy===undefined?null:Object.freeze({
     requirePayAsOrdered:value.paymentPolicy.requirePayAsOrdered as boolean,
     version:value.paymentPolicy.version as number})});
  },
  async quote(input:Json){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/quotes','POST',input);
   if(!Array.isArray(value.lines)||value.lines.length<1||value.lines.length>50||
      !value.lines.every(line=>plain(line)&&typeof line.quoteId==='string'&&UUID.test(line.quoteId)&&
       typeof line.itemId==='string'&&UUID.test(line.itemId)&&Number.isSafeInteger(line.totalCents)&&
       (line.totalCents as number)>=0&&typeof line.expiresAt==='string'&&Number.isFinite(Date.parse(line.expiresAt))))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({lines:Object.freeze(value.lines.map(line=>Object.freeze({
    quoteId:line.quoteId as string,itemId:line.itemId as string,totalCents:line.totalCents as number,
    expiresAt:line.expiresAt as string
   })))});
  },
  async lookupConfirmation(input:{tableId:string;qrToken:string;visitId:string;
   basketId:string;requestKey:string}){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/orders/lookup','POST',input);
   if(value.status==='not_found')return Object.freeze({status:'not_found' as const});
   if(value.status!=='confirmed'||typeof value.orderId!=='string'||!UUID.test(value.orderId)||
      typeof value.grouping!=='string')
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({status:'confirmed' as const,orderId:value.orderId,grouping:value.grouping});
  },
  async confirm(input:Json){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/orders/confirm','POST',input);
   if(!['confirmed','replayed'].includes(String(value.status))||typeof value.orderId!=='string'||
      !UUID.test(value.orderId)||typeof value.grouping!=='string'||
      (value.accountId!==undefined&&(
       typeof value.accountId!=='string'||!UUID.test(value.accountId)||typeof value.roundId!=='string'||
       !UUID.test(value.roundId)||!Number.isSafeInteger(value.amountCents)||(value.amountCents as number)<0||
       !['pay_now','pay_at_end',null].includes(value.paymentMode as never)||typeof value.roundState!=='string'||
       typeof value.requiresPaymentAction!=='boolean'||
       (value.clientSecret!==undefined&&typeof value.clientSecret!=='string'))))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({
    status:value.status as 'confirmed'|'replayed',orderId:value.orderId as string,
    grouping:value.grouping as string,
    accountId:value.accountId as string|undefined,roundId:value.roundId as string|undefined,
    amountCents:value.amountCents as number|undefined,
    paymentMode:value.paymentMode as 'pay_now'|'pay_at_end'|null|undefined,
    roundState:value.roundState as string|undefined,paymentState:value.paymentState as string|null|undefined,
    requiresPaymentAction:value.requiresPaymentAction as boolean|undefined,
    clientSecret:value.clientSecret as string|undefined
   });
  }
 });
}
