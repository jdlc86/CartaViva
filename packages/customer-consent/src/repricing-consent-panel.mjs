// Presentation-only customer consent panel for the candidate PWA.
// No HTML injection, no persistence and no implicit acceptance.
// DOM and controller are injected so this module remains testable offline.
export function mountRepricingConsentPanel({document,container,controller,onOutcome,locale='es-ES',currency='EUR'}={}){
 if(!document||typeof document.createElement!=='function'||!container||
    typeof container.replaceChildren!=='function'||!controller||
    typeof controller.accept!=='function'||typeof controller.decline!=='function'||
    typeof onOutcome!=='function')
  throw Error('invalid_repricing_panel');
 const money=new Intl.NumberFormat(locale,{style:'currency',currency});
 let busy=false;
 let disposed=false;
 const element=(tag,text)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const render=()=>{
  if(disposed)return;
  const comparison=controller.comparison;
  if(!comparison){container.replaceChildren();return;}
  const section=element('section');
  section.setAttribute('role','dialog');
  section.setAttribute('aria-modal','true');
  section.setAttribute('aria-labelledby','sabora-repricing-title');
  section.setAttribute('aria-describedby','sabora-repricing-description');
  const title=element('h2','El precio del pedido ha cambiado');
  title.id='sabora-repricing-title';
  const description=element('p','Revisa el importe antes de confirmar. No realizaremos el pedido sin tu aceptación.');
  description.id='sabora-repricing-description';
  const previous=element('p','Precio anterior: '+money.format(comparison.previousTotalCents/100));
  const current=element('p','Precio actual: '+money.format(comparison.currentTotalCents/100));
  const diff=element('p','Diferencia: '+money.format(comparison.differenceCents/100));
  const revision=element('p','Versión anterior: '+comparison.previousPublishedRevision+
   '. Versión actual: '+comparison.currentPublishedRevision+'.');
  const accept=element('button','Acepto el nuevo importe y confirmo el pedido');
  accept.type='button';
  const decline=element('button','No aceptar; volver al pedido');
  decline.type='button';
  const disable=()=>{accept.disabled=busy;decline.disabled=busy;};
  accept.addEventListener('click',async()=>{
   if(busy||disposed)return;
   busy=true;disable();
   try{
    const outcome=await controller.accept();
    if(!disposed){render();onOutcome({type:'submitted',result:outcome});}
   }catch(error){
    if(!disposed){render();onOutcome({type:'failed',error:
     error instanceof Error?error.message:'repricing_acceptance_failed'});}
   }finally{busy=false;if(!disposed)render();}
  });
  decline.addEventListener('click',()=>{
   if(busy||disposed)return;
   controller.decline();render();onOutcome({type:'declined'});
  });
  section.append(title,description,previous,current,diff,revision,accept,decline);
  container.replaceChildren(section);
  disable();
  accept.focus();
 };
 render();
 return Object.freeze({refresh:render,destroy(){
  disposed=true;container.replaceChildren();
 }});
}
