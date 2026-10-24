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
 const flow=createCustomerConfirmationFlow({fetchImpl,document,container,onOutcome,clock});
 let disposed=false;
 let active=false;
 return Object.freeze({
  get status(){return disposed?'disposed':active?'submitting':flow.status;},
  async confirm(){
   if(disposed)throw Error('confirmation_flow_disposed');
   if(active||flow.status!=='idle')throw Error('confirmation_flow_busy');
   active=true;
   try{
    const request=await readRequest();
    if(disposed)throw Error('confirmation_flow_disposed');
    keys.begin();
    return await flow.confirm(request);
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
   keys.reset();
  },
  destroy(){disposed=true;flow.destroy();}
 });
}
