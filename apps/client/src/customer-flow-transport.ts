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
 constructor(message:string,status:number){super(message);this.name='CustomerFlowTransportError';this.status=status;}
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
  throw new CustomerFlowTransportError(error,response.status);
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
  async authorizeVisit(input:{tableId:string;qrToken:string}){
   if(!UUID.test(input.tableId)||typeof input.qrToken!=='string'||!QR_TOKEN.test(input.qrToken))
    throw Error('invalid_customer_visit_transport');
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/visits','POST',input);
   if(value.tableId!==input.tableId||typeof value.visitId!=='string'||!KEY.test(value.visitId)||
      typeof value.basketId!=='string'||!KEY.test(value.basketId)||
      typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt)))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({tableId:value.tableId as string,visitId:value.visitId,
    basketId:value.basketId,expiresAt:value.expiresAt});
  },
  async quote(input:Json){return jsonRequest(fetchImpl,'/api/v1/customer/quotes','POST',input);},
  async confirm(input:Json){return jsonRequest(fetchImpl,'/api/v1/customer/orders/confirm','POST',input)}
 });
}
