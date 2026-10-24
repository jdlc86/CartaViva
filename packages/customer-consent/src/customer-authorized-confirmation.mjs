// Candidate integration of authorized request reader, in-memory idempotency
// identity and confirmation flow. Not mounted until session and basket APIs exist.
import {createAuthorizedCustomerRequestReader} from './customer-authorized-request.mjs';
import {createCustomerRequestKeyRegistry} from './customer-request-key-registry.mjs';
import {createCustomerConfirmationFlow} from './customer-confirmation-flow.mjs';
import {validateCustomerConfirmationRequest} from './customer-authorized-request.mjs';
export function createAuthorizedCustomerConfirmation({
 readContext,readBasket,createRequestKey,fetchImpl,document,container,onOutcome,clock
}={}){
 const keys=createCustomerRequestKeyRegistry({createKey:createRequestKey});
 const readRequest=createAuthorizedCustomerRequestReader({
  readContext,readBasket,createRequestKey:basket=>keys.forBasket(basket)
 });
 let settled=false;
 const flow=createCustomerConfirmationFlow({fetchImpl,document,container,clock,
  onOutcome:event=>{
   if(event.type==='submitted'&&['confirmed','replayed'].includes(event.result?.status))settled=true;
   if(!disposed)onOutcome?.(event);
  }});
 let disposed=false;
 let active=false;
 return Object.freeze({
  get status(){return disposed?'disposed':settled?'completed':active?'submitting':flow.status;},
  async confirm(){
   if(disposed)throw Error('confirmation_flow_disposed');
   if(active||settled||flow.status!=='idle')throw Error('confirmation_flow_busy');
   active=true;
   try{
    const request=await readRequest();
    if(disposed)throw Error('confirmation_flow_disposed');
    keys.begin();
    // Re-read the authoritative basket immediately before sending. If it
    // changed while the session/request snapshot was assembled, fail closed.
    const [latest,latestContext]=await Promise.all([readBasket(),readContext()]);
    if(disposed)throw Error('confirmation_flow_disposed');
    const ownValue=(name)=>{
     const d=latest&&typeof latest==='object'?
      Object.getOwnPropertyDescriptor(latest,name):null;
     return d&&d.enumerable&&Object.hasOwn(d,'value')?d.value:undefined;
    };
    const contextValue=(name)=>{
     const d=latestContext&&typeof latestContext==='object'?
      Object.getOwnPropertyDescriptor(latestContext,name):null;
     return d&&d.enumerable&&Object.hasOwn(d,'value')?d.value:undefined;
    };
    const revision=ownValue('revision');
    let sameLine=false;
    try{
     const candidate=validateCustomerConfirmationRequest({
      ...request,itemId:ownValue('itemId'),selection:ownValue('selection'),
      quantity:ownValue('quantity')
     });
     const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&
      !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
     sameLine=candidate.itemId===request.itemId&&
      candidate.quantity===request.quantity&&
      canonical(candidate.selection)===canonical(request.selection);
    }catch{sameLine=false;}

    if(!sameLine||ownValue('basketId')!==request.basketId||
       !Number.isSafeInteger(revision)||
       keys.identity!==request.basketId+':'+revision||
       ownValue('confirmable')!==true||
       contextValue('authorized')!==true||contextValue('canOrder')!==true||
       ['tableId','visitId','actorId','qrToken','customerSessionToken']
        .some(name=>contextValue(name)!==request[name]))
     throw Error('customer_basket_changed_before_confirmation');
    const result=await flow.confirm(request);
    if(!disposed&&['confirmed','replayed'].includes(result?.status)){
     keys.resolve();settled=true;
    }
    // A 503 is not proof that the transaction failed before COMMIT.
    if(!disposed&&result?.error==='order_confirmation_unavailable')
     keys.markUnresolved();
    return result;
   }catch(error){
    if(error instanceof Error&&['confirmation_network_unknown',
       'confirmation_unexpected_response'].includes(error.message))
     keys.markUnresolved();
    throw error;
   }finally{
    keys.end();active=false;
   }
  },
  decline(){if(disposed)throw Error('confirmation_flow_disposed');
   if(active)throw Error('confirmation_flow_busy');
   flow.decline();
  },
  resetForNewBasket(){
   if(disposed)throw Error('confirmation_flow_disposed');
   if(active||flow.status!=='idle')throw Error('confirmation_flow_busy');
   keys.reset();settled=false;
  },
  destroy(){disposed=true;flow.destroy();}
 });
}
