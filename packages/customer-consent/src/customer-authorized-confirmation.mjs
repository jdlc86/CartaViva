// Candidate integration of authorized request reader, in-memory idempotency
// identity and confirmation flow. Not mounted until session and basket APIs exist.
import {createAuthorizedCustomerRequestReader} from './customer-authorized-request.mjs';
import {createCustomerRequestKeyRegistry} from './customer-request-key-registry.mjs';
import {createCustomerConfirmationFlow} from './customer-confirmation-flow.mjs';
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
   onOutcome?.(event);
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
    const result=await flow.confirm(request);
    if(['confirmed','replayed'].includes(result?.status))settled=true;
    return result;
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
