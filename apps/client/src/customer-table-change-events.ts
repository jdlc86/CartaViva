// Candidate B3: authenticated EventSource with H6 outbox cursor replay.
// The current SQL state remains authoritative for ordering and account scope.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENTS=['sabora.table_change.approved','sabora.table_change.rejected'] as const;
export type TableChangeStreamState=Readonly<{
 state:'unbound'|'bound'|'pending'|'approved'|'rejected';
 boundTableId:string|null;expiresAtMs:number|null;serverNowMs:number;
}>;
export type TableChangeDecisionEvent=Readonly<{
 id:number;eventKey:string;requestId:string;expiresAtMs:number;createdAt:string;
 type:(typeof EVENTS)[number];
}>;
function validState(value:unknown):value is TableChangeStreamState{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 if(!['unbound','bound','pending','approved','rejected'].includes(row.state as string)||
    !Number.isSafeInteger(row.serverNowMs))return false;
 if(row.state==='unbound'?row.boundTableId!==null:
   typeof row.boundTableId!=='string'||!UUID.test(row.boundTableId))return false;
 return row.state==='pending'||row.state==='rejected'?
  Number.isSafeInteger(row.expiresAtMs)&&(row.expiresAtMs as number)>(row.serverNowMs as number):
  row.expiresAtMs===null;
}
export function subscribeCustomerTableChange({
 onState,onDecision,onResync,onRevoked,afterCursor=0,
 EventSourceImpl=globalThis.EventSource
}:{
 onState:(state:TableChangeStreamState)=>void;
 onDecision?:(event:TableChangeDecisionEvent)=>void;
 onResync?:(maxAvailableCursor:number|null)=>void;
 onRevoked:()=>void;afterCursor?:number;EventSourceImpl?:typeof EventSource;
}){
 if(typeof onState!=='function'||typeof onRevoked!=='function'||
    typeof EventSourceImpl!=='function'||!Number.isSafeInteger(afterCursor)||afterCursor<0||
    (onDecision!==undefined&&typeof onDecision!=='function')||
    (onResync!==undefined&&typeof onResync!=='function'))
  throw Error('invalid_customer_table_change_subscription');
 const url='/api/v1/customer/table-change/events'+
  (afterCursor>0?'?after='+afterCursor:'');
 const source=new EventSourceImpl(url,{withCredentials:true});
 source.addEventListener('sabora.table_change.state',event=>{
  try{
   const payload=JSON.parse((event as MessageEvent).data) as unknown;
   if(validState(payload))onState(Object.freeze(payload));
  }catch{/* Untrusted frames cannot grant table or payment access. */}
 });
 for(const type of EVENTS)source.addEventListener(type,event=>{
  try{
   const raw=JSON.parse((event as MessageEvent).data) as unknown;
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
   const value=raw as Record<string,unknown>;
   const id=Number((event as MessageEvent).lastEventId);
   if(!Number.isSafeInteger(id)||id<=0||
      !UUID.test(value.eventKey as string)||!UUID.test(value.requestId as string)||
      !Number.isSafeInteger(value.expiresAtMs)||
      typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))return;
   onDecision?.(Object.freeze({id,type,eventKey:value.eventKey as string,
    requestId:value.requestId as string,expiresAtMs:value.expiresAtMs as number,
    createdAt:value.createdAt}));
  }catch{/* Invalid H6 frames are ignored, never used for authorization. */}
 });
 source.addEventListener('resync-required',event=>{
  try{
   const raw=JSON.parse((event as MessageEvent).data) as unknown;
   if(!raw||typeof raw!=='object')return;
   const value=(raw as Record<string,unknown>).maxAvailableCursor;
   if(value===null||(Number.isSafeInteger(value)&&(value as number)>=0))
    onResync?.(value as number|null);
  }catch{/* No arbitrary cursor may be stored. */}
 });
 source.addEventListener('access-revoked',()=>{onRevoked();source.close();});
 return()=>source.close();
}
