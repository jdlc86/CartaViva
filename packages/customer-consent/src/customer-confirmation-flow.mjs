// Candidate customer PWA integration: transport + consent controller + panel.
// Caller supplies a trusted, session-bound request and explicit UI container.
// No automatic retry, no production route registration, no persistent tokens.
import {createCustomerOrderConfirmationTransport} from './customer-confirmation-transport.mjs';
import {createRepricingConsentController} from './repricing-consent.mjs';
import {mountRepricingConsentPanel} from './repricing-consent-panel.mjs';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export function createCustomerConfirmationFlow({
 fetchImpl,document,container,onOutcome,clock=Date.now
}={}){
 if(typeof onOutcome!=='function')throw Error('invalid_customer_confirmation_flow');
 const transport=createCustomerOrderConfirmationTransport({fetchImpl});
 const controller=createRepricingConsentController({submit:transport,clock});
 let panel=null;
 let busy=false;
 let disposed=false;
 let generation=0;
 const close=()=>{panel?.destroy();panel=null;};
 const notify=event=>{if(!disposed)onOutcome(event);};
 const show=()=>{
  close();
  panel=mountRepricingConsentPanel({document,container,controller,onOutcome:event=>{
   if(event.type==='declined'){generation++;close();notify(event);}
   else if(event.type==='submitted'){
    if(controller.status==='awaiting_explicit_acceptance'){
     panel?.refresh();notify({type:'repricing_required'});
    }else{close();notify({type:'submitted',result:event.result});}
   }else if(event.type==='failed'){
    close();notify(event);
   }
  }});
 };
 return Object.freeze({
  get status(){return disposed?'disposed':busy?'submitting':controller.status;},
  async confirm(request){
   if(disposed)throw Error('confirmation_flow_disposed');
   if(busy||controller.status==='awaiting_explicit_acceptance')
    throw Error('confirmation_flow_busy');
   if(!plain(request)||Object.hasOwn(request,'acceptanceToken'))
    throw Error('invalid_confirmation_request');
   busy=true;
   const requestGeneration=++generation;
   try{
    const result=await transport(request);
    if(disposed||generation!==requestGeneration)return result;
    if(result.error==='acceptance_required'){
     controller.present(result,request);
     show();notify({type:'repricing_required',comparison:controller.comparison});
    }else notify({type:'submitted',result});
    return result;
   }catch(error){
    if(!disposed&&generation===requestGeneration)
     notify({type:'failed',error:error instanceof Error?error.message:'confirmation_failed'});
    throw error;
   }finally{busy=false;}
  },
  decline(){if(disposed)throw Error('confirmation_flow_disposed');
   if(busy)throw Error('confirmation_flow_busy');
   generation++;controller.decline();close();notify({type:'declined'});
  },
  destroy(){generation++;disposed=true;controller.decline();close();}
 });
}
