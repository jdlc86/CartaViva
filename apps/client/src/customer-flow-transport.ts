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
  async readWaiterCall(tableId:string){
   if(!UUID.test(tableId))throw Error('invalid_waiter_call_transport');
   const value=await jsonRequest(fetchImpl,
    '/api/v1/customer/waiter-calls?'+new URLSearchParams({tableId}),'GET');
   if(value.version!==1||!['none','pending','attended'].includes(value.state as string)||
      (value.id!==null&&!UUID.test(value.id as string))||
      ((value.state==='none')!==(value.id===null))||
      !Number.isSafeInteger(value.tableNumber)||typeof value.repeated!=='boolean')
    throw new CustomerFlowTransportError('waiter_call_unavailable',503);
   return Object.freeze({id:value.id as string|null,
    state:value.state as 'none'|'pending'|'attended',
    tableNumber:value.tableNumber as number});
  },
  async requestWaiterCall(tableId:string,requestId:string){
   if(!UUID.test(tableId)||!UUID.test(requestId))
    throw Error('invalid_waiter_call_transport');
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/waiter-calls','POST',
    {tableId,requestId});
   if(value.version!==1||!UUID.test(value.id as string)||
      !['pending','attended'].includes(value.state as string)||
      !Number.isSafeInteger(value.tableNumber)||typeof value.repeated!=='boolean')
    throw new CustomerFlowTransportError('waiter_call_unavailable',503);
   return Object.freeze({id:value.id as string,
    state:value.state as 'pending'|'attended',
    tableNumber:value.tableNumber as number,repeated:value.repeated});
  },
  async tableChangeState(){
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/table-change/state','GET');
   if(!['unbound','bound','pending','approved','rejected'].includes(value.state as string)||
      (value.boundTableId!==null&&
       (typeof value.boundTableId!=='string'||!UUID.test(value.boundTableId)))||
      !Number.isSafeInteger(value.serverNowMs)||
      (['pending','rejected'].includes(value.state as string)?
       !Number.isSafeInteger(value.expiresAtMs)||
        (value.expiresAtMs as number)<=(value.serverNowMs as number):
       value.expiresAtMs!==null))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   if((value.state==='unbound')!==(value.boundTableId===null))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({state:value.state as 'unbound'|'bound'|'pending'|'approved'|'rejected',
    boundTableId:value.boundTableId as string|null,
    expiresAtMs:value.expiresAtMs as number|null,serverNowMs:value.serverNowMs as number});
  },
  async requestTableChange(){
   // The destination must never be part of the request payload.
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/table-change/requests','POST',{});
   if(typeof value.id!=='string'||!UUID.test(value.id)||
      (value.sourceTableId!==undefined&&
       (typeof value.sourceTableId!=='string'||!UUID.test(value.sourceTableId)))||
      value.status!=='pending'||!Number.isSafeInteger(value.expiresAtMs)||
      (value.expiresAtMs as number)<=0||
      (value.createdAtMs!==undefined&&
       (!Number.isSafeInteger(value.createdAtMs)||(value.createdAtMs as number)<0||
        (value.expiresAtMs as number)<=(value.createdAtMs as number))))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({requestId:value.id,status:'pending' as const,
    expiresAtMs:value.expiresAtMs as number,
    ...(value.sourceTableId===undefined?{}:{sourceTableId:value.sourceTableId as string}),
    ...(value.createdAtMs===undefined?{}:{createdAtMs:value.createdAtMs as number})});
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
  async paymentPolicy(input:{tableId:string;visitId:string}){
   if(!UUID.test(input.tableId)||!KEY.test(input.visitId))
    throw Error('invalid_customer_payment_policy_transport');
   const query=new URLSearchParams({tableId:input.tableId,visitId:input.visitId});
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/payment-policy?'+query,'GET');
   if(![null,'pay_now','pay_at_end'].includes(value.selectedMode as string|null)||
      typeof value.requirePayAsOrdered!=='boolean'||
      !Number.isSafeInteger(value.version)||(value.version as number)<1)
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({selectedMode:value.selectedMode as 'pay_now'|'pay_at_end'|null,
    requirePayAsOrdered:value.requirePayAsOrdered as boolean,version:value.version as number});
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
  async paymentState(input:{tableId:string;visitId:string;orderId:string}){
    if(!UUID.test(input.tableId)||!UUID.test(input.orderId)||!KEY.test(input.visitId))
     throw Error('invalid_customer_payment_state_transport');
    const params=new URLSearchParams({tableId:input.tableId,visitId:input.visitId});
    const value=await jsonRequest(fetchImpl,
     `/api/v1/customer/orders/${input.orderId}/payment-state?${params}`,'GET');
    if(value.orderId!==input.orderId||
       ![null,'pay_now','pay_at_end'].includes(value.paymentMode as never)||
       !['free_grouping','awaiting_authorization','grouping','payment_unknown',
         'capture_requested','captured','awaiting_external_verification','dispatch_requested','kitchen_acknowledged',
         'payment_failed','cancelled','compensation_required'].includes(value.roundState as string))
     throw new CustomerFlowTransportError('customer_flow_unavailable',503);
    return Object.freeze({orderId:input.orderId,
     paymentMode:value.paymentMode as 'pay_now'|'pay_at_end'|null,
     roundState:value.roundState as string});
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
       !['stripe','external',null].includes(value.paymentChannel as never)||
       typeof value.requiresPaymentAction!=='boolean'||
       (value.clientSecret!==undefined&&typeof value.clientSecret!=='string'))))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({
    status:value.status as 'confirmed'|'replayed',orderId:value.orderId as string,
    grouping:value.grouping as string,
    accountId:value.accountId as string|undefined,roundId:value.roundId as string|undefined,
    amountCents:value.amountCents as number|undefined,
    paymentMode:value.paymentMode as 'pay_now'|'pay_at_end'|null|undefined,
    paymentChannel:value.paymentChannel as 'stripe'|'external'|null|undefined,
    roundState:value.roundState as string|undefined,paymentState:value.paymentState as string|null|undefined,
    requiresPaymentAction:value.requiresPaymentAction as boolean|undefined,
    clientSecret:value.clientSecret as string|undefined
   });
  },
  async economicConsumption(input:{tableId:string;visitId:string}){
   if(!UUID.test(input.tableId)||!KEY.test(input.visitId))throw Error('invalid_economic_transport');
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/economic/consumption','POST',input);
   if(value.version!==2||typeof value.notice!=='string'||!Array.isArray(value.items)||value.items.length>250||
    !Array.isArray(value.pendingSettlements)||value.pendingSettlements.length>25||
    !value.pendingSettlements.every(x=>plain(x)&&UUID.test(x.intentId as string)&&KEY.test(x.requestKey as string)&&
     ['stripe','external'].includes(x.channel as string)&&typeof x.state==='string'&&
     Number.isSafeInteger(x.amountCents)&&(x.amountCents as number)>0&&
     typeof x.createdAt==='string'&&Number.isFinite(Date.parse(x.createdAt as string))&&
     Array.isArray(x.allocations)&&(x.allocations as Json[]).length>0&&
     (x.allocations as Json[]).every(a=>plain(a)&&UUID.test(a.roundId as string)&&
      Number.isSafeInteger(a.amountCents)&&(a.amountCents as number)>0))||
    !value.items.every(x=>plain(x)&&UUID.test(x.accountId as string)&&
     typeof x.customerCode==='string'&&typeof x.customerAlias==='string'&&typeof x.own==='boolean'&&
     Number.isSafeInteger(x.netConsumptionCents)&&(x.netConsumptionCents as number)>=0&&
     Array.isArray(x.rounds)&&x.rounds.every(r=>plain(r)&&UUID.test(r.roundId as string)&&
      Number.isSafeInteger(r.amountCents)&&(r.amountCents as number)>0)))
    throw new CustomerFlowTransportError('economic_circuit_unavailable',503);
   return Object.freeze({notice:value.notice,
    pendingSettlements:Object.freeze((value.pendingSettlements as Json[]).map(x=>Object.freeze({
     intentId:x.intentId as string,requestKey:x.requestKey as string,
     channel:x.channel as 'stripe'|'external',state:x.state as string,
     amountCents:x.amountCents as number,createdAt:x.createdAt as string,
     allocations:Object.freeze((x.allocations as Json[]).map(a=>Object.freeze({
      roundId:a.roundId as string,amountCents:a.amountCents as number})))
    }))),
    items:Object.freeze(value.items.map(x=>Object.freeze({accountId:x.accountId as string,
     customerCode:x.customerCode as string,customerAlias:x.customerAlias as string,own:x.own as boolean,
     netConsumptionCents:x.netConsumptionCents as number,outstandingCents:x.outstandingCents as number,
     rounds:Object.freeze((x.rounds as Json[]).map(r=>Object.freeze({roundId:r.roundId as string,
      amountCents:r.amountCents as number}))) })))});
  },
  async createEconomicSettlement(input:{tableId:string;visitId:string;requestKey:string;
   channel:'stripe'|'external';allocations:readonly {roundId:string;amountCents:number}[]}){
   if(!UUID.test(input.tableId)||!KEY.test(input.visitId)||!KEY.test(input.requestKey)||
    !['stripe','external'].includes(input.channel)||input.allocations.length<1||
    input.allocations.length>50||!input.allocations.every(x=>UUID.test(x.roundId)&&
     Number.isSafeInteger(x.amountCents)&&x.amountCents>0))throw Error('invalid_economic_transport');
   const value=await jsonRequest(fetchImpl,'/api/v1/customer/economic/settlements','POST',input);
   if(value.version!==2||!UUID.test(value.intentId as string)||typeof value.state!=='string')
    throw new CustomerFlowTransportError('economic_circuit_unavailable',503);
   return Object.freeze({intentId:value.intentId as string,state:value.state as string,
    channel:input.channel,amountCents:Number.isSafeInteger(value.amountCents)?value.amountCents as number:
     input.allocations.reduce((sum,x)=>sum+x.amountCents,0),
    clientSecret:typeof value.clientSecret==='string'?value.clientSecret:undefined});
  },
  async readOrderRevision(input:{tableId:string;visitId:string;orderId:string}){
   if(!UUID.test(input.tableId)||!KEY.test(input.visitId)||!UUID.test(input.orderId))
    throw Error('invalid_customer_revision_transport');
   const query=new URLSearchParams({tableId:input.tableId,visitId:input.visitId});
   const value=await jsonRequest(fetchImpl,
    `/api/v1/customer/orders/${input.orderId}/revision?${query}`,'GET');
   if(value.version!==1||value.orderId!==input.orderId||typeof value.roundId!=='string'||
      !UUID.test(value.roundId)||!Number.isSafeInteger(value.revisionNumber)||
      !['current','invalidated','dispatch_requested','acknowledged','failed','compensation_required']
       .includes(String(value.state))||!Number.isSafeInteger(value.amountCents)||
      !Array.isArray(value.lines)||!value.lines.every(line=>plain(line)&&
       Number.isSafeInteger(line.lineNumber)&&typeof line.itemId==='string'&&UUID.test(line.itemId)&&
       typeof line.itemName==='string'&&typeof line.quantity==='number'&&Number.isSafeInteger(line.quantity)&&
       typeof line.totalCents==='number'&&Number.isSafeInteger(line.totalCents)&&typeof line.affected==='boolean'))
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({version:1 as const,orderId:value.orderId as string,roundId:value.roundId as string,
    revisionNumber:value.revisionNumber as number,state:value.state as string,
    amountCents:value.amountCents as number,paymentMode:value.paymentMode as 'pay_now'|'pay_at_end'|null,
    invalidation:plain(value.invalidation)?Object.freeze({...value.invalidation}):null,
    lines:Object.freeze(value.lines.map(line=>Object.freeze({lineNumber:line.lineNumber as number,
     itemId:line.itemId as string,itemName:line.itemName as string,quantity:line.quantity as number,
     totalCents:line.totalCents as number,affected:line.affected as boolean})))
   });
  },
  async resubmitOrderRevision(orderId:string,input:Json){
   if(!UUID.test(orderId))throw Error('invalid_customer_revision_transport');
   const value=await jsonRequest(fetchImpl,`/api/v1/customer/orders/${orderId}/revisions`,'POST',input);
   if(value.status!=='resubmitted'||value.version!==1||value.orderId!==orderId||
      typeof value.roundId!=='string'||!UUID.test(value.roundId)||
      !Number.isSafeInteger(value.revisionNumber)||!Number.isSafeInteger(value.amountCents)||
      !Number.isSafeInteger(value.differenceCents)||typeof value.state!=='string'||
      typeof value.dispatchId!=='string'||!UUID.test(value.dispatchId)||
      typeof value.dispatchState!=='string'||typeof value.captureRequired!=='boolean'||
      typeof value.repeated!=='boolean')
    throw new CustomerFlowTransportError('customer_flow_unavailable',503);
   return Object.freeze({...value,status:'resubmitted' as const});
  }
 });
}
