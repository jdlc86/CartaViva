// Candidate-only: EventSource reconnects and replays the sealed server snapshot.
// Never treat a browser message as authority for account binding or payment.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type TableChangeStreamState=Readonly<{
 state:'unbound'|'bound'|'pending'|'approved'|'rejected';
 boundTableId:string|null;expiresAtMs:number|null;serverNowMs:number;
}>;
function valid(value:unknown):value is TableChangeStreamState{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 if(!['unbound','bound','pending','approved','rejected'].includes(row.state as string)||
    !Number.isSafeInteger(row.serverNowMs))return false;
 if(row.state==='unbound' ? row.boundTableId!==null :
   typeof row.boundTableId!=='string'||!UUID.test(row.boundTableId))return false;
 return row.state==='pending'||row.state==='rejected'?
  Number.isSafeInteger(row.expiresAtMs)&&(row.expiresAtMs as number)>(row.serverNowMs as number):
  row.expiresAtMs===null;
}
export function subscribeCustomerTableChange({
 onState,onRevoked,EventSourceImpl=globalThis.EventSource
}:{
 onState:(state:TableChangeStreamState)=>void;onRevoked:()=>void;
 EventSourceImpl?:typeof EventSource;
}){
 if(typeof onState!=='function'||typeof onRevoked!=='function'||
    typeof EventSourceImpl!=='function')throw Error('invalid_customer_table_change_subscription');
 const source=new EventSourceImpl('/api/v1/customer/table-change/events',{withCredentials:true});
 source.addEventListener('sabora.table_change.state',event=>{
  try{
   const payload=JSON.parse((event as MessageEvent).data) as unknown;
   if(valid(payload))onState(Object.freeze(payload));
  }catch{/* Malformed transport data cannot change security state. */}
 });
 source.addEventListener('access-revoked',()=>{onRevoked();source.close();});
 return()=>source.close();
}
