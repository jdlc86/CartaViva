// Opt-in customer PWA integration point. The host must supply the real
// authenticated request; this module never creates visits, tokens or identities.
import {createCustomerConfirmationFlow} from './customer-confirmation-flow.mjs';
const valid=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function mountCustomerOrderConfirmation({
 document,root,fetchImpl,readRequest,onState,clock=Date.now
}={}){
 if(!document||!root||typeof root.append!=='function'||
    typeof document.createElement!=='function'||
    typeof readRequest!=='function'||typeof onState!=='function')
  throw Error('invalid_customer_confirmation_mount');
 const container=document.createElement('div');
 container.setAttribute('data-sabora-repricing','');
 const button=document.createElement('button');
 button.type='button';
 button.textContent='Confirmar pedido';
 const status=document.createElement('p');
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 root.append(button,status,container);
 let disposed=false;
 let busy=false;
 let settled=false;
 const report=event=>{
  if(disposed)return;
  if(event.type==='repricing_required')status.textContent='Revisa el cambio de precio antes de continuar.';
  if(event.type==='declined')status.textContent='No se ha aceptado el nuevo precio.';
  if(event.type==='failed')status.textContent='No se ha podido verificar el pedido. Comprueba su estado antes de reintentarlo.';
  if(event.type==='submitted'){
   if(event.result?.status==='confirmed'||event.result?.status==='replayed')settled=true;
   status.textContent=event.result?.status==='confirmed'?'Pedido confirmado.':
    event.result?.status==='replayed'?'Pedido ya registrado.':
    'No se ha confirmado el pedido. Revisa su estado.';
  }
  if(!busy&&flow.status==='idle')button.disabled=settled;
  onState(event);
 };
 const flow=createCustomerConfirmationFlow({fetchImpl,document,container,clock,onOutcome:report});
 button.addEventListener('click',async()=>{
  if(disposed||busy||settled||flow.status!=='idle')return;
  busy=true;button.disabled=true;
  try{
   const request=await readRequest();
   if(disposed)return;
   if(!valid(request))throw Error('invalid_confirmation_request');
   await flow.confirm(request);
  }catch(error){
   report({type:'failed',error:error instanceof Error?error.message:'confirmation_failed'});
  }finally{
   busy=false;
   if(!disposed)button.disabled=settled||flow.status!=='idle';
  }
 });
 return Object.freeze({
  get status(){return disposed?'disposed':settled?'completed':flow.status;},
  resetForNewOrder(){
   if(disposed)throw Error('confirmation_mount_disposed');
   if(busy||flow.status!=='idle')throw Error('confirmation_flow_busy');
   settled=false;status.textContent='';button.disabled=false;
  },
  destroy(){
   disposed=true;
   flow.destroy();
   button.remove();status.remove();container.remove();
  }
 });
}
