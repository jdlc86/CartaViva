const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export type CustomerEvent=Readonly<{id:number;type:string;payload:Record<string,unknown>;createdAt:string}>;
export function subscribeCustomerEvents({tableId,visitId,accountId,onEvent,onResync,onUnavailable,
 EventSourceImpl=globalThis.EventSource}:{tableId:string;visitId:string;accountId:string;
 onEvent:(event:CustomerEvent)=>void;onResync:()=>void;onUnavailable:()=>void;
 EventSourceImpl?:typeof EventSource}){
 if(!UUID.test(tableId)||!KEY.test(visitId)||!UUID.test(accountId)||typeof onEvent!=='function'||
    typeof onResync!=='function'||typeof onUnavailable!=='function'||typeof EventSourceImpl!=='function')
  throw Error('invalid_customer_event_subscription');
 const url=`/api/v1/customer/events?${new URLSearchParams({tableId,visitId,accountId})}`;
 const source=new EventSourceImpl(url,{withCredentials:true});
 const seen=new Set<string>();
 const receive=(event:MessageEvent)=>{
  try{
   const value=JSON.parse(event.data) as unknown,id=Number(event.lastEventId);
   if(!Number.isSafeInteger(id)||id<1||!plain(value)||typeof value.eventKey!=='string'||
      !UUID.test(value.eventKey)||!plain(value.payload)||typeof value.createdAt!=='string'||
      !Number.isFinite(Date.parse(value.createdAt))||seen.has(value.eventKey))return;
   seen.add(value.eventKey);if(seen.size>500)seen.delete(seen.values().next().value!);
   onEvent(Object.freeze({id,type:event.type,payload:value.payload,createdAt:value.createdAt}));
  }catch{/* malformed stream frames are ignored; server state is not inferred */}
 };
 const names=['sabora.round.confirmed','sabora.payment.authorized','sabora.payment.requires_action',
  'sabora.payment.authorization_unknown','sabora.payment.capture_requested','sabora.payment.captured',
  'sabora.payment.capture_unknown','sabora.kitchen.dispatch_acknowledged','sabora.order_line.preparing',
  'sabora.order_line.ready','sabora.order_line.picked_up','sabora.incident.awaiting_admin',
  'sabora.incident.refund_due','sabora.incident.adjusted','sabora.incident.resolved',
  'sabora.incident.cash_refund_due','sabora.refund.cash_recorded',
  'sabora.payment.compensation_required','sabora.refund.succeeded','sabora.refund.failed',
  'sabora.refund.unknown','sabora.account.cash_settled','sabora.stripe.webhook_applied'];
 for(const name of names)source.addEventListener(name,receive as EventListener);
 source.addEventListener('resync-required',()=>onResync());
 source.addEventListener('access-revoked',()=>{onUnavailable();source.close();});
 source.onerror=()=>onUnavailable();
 return()=>source.close();
}
