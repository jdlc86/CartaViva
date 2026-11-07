import {useRef,useState} from 'react';
import {formatPrice} from '../catalog';
import type {Locale} from '../client-state';
import type {createCustomerFlowTransport} from '../customer-flow-transport';

type Transport=ReturnType<typeof createCustomerFlowTransport>;
type Debt=Readonly<{roundId:string;accountId:string;customerCode:string;amountCents:number}>;
type Refund=Readonly<{incidentId:string;amountCents:number}>;
type Tip=Readonly<{collectionId:string;tipCents:number;collectedAt:string}>;
type TipChoice='none'|'percent5'|'percent10'|'fixed100'|'fixed200'|'fixed500';
type TipProof=Readonly<{collectionId:string;claimId:string;proof:string;tipCents:number;expiresAt:string}>;
type CashProof=Readonly<{claimId:string;incidentId:string;proof:string;amountCents:number;expiresAt:string}>;
type Intent=Readonly<{intentId:string;consumptionCents:number;tipCents:number;totalCents:number;state:'pending'|'paid'}>;
type Pending=Readonly<{requestKey:string;rounds:readonly {roundId:string;amountCents:number}[];tipOption:TipChoice}>;
const money=(cents:number,locale:Locale)=>formatPrice(cents,locale==='es'?'es-ES':'en-IE');
const makeKey=()=>`m4_cash_tip_${crypto.randomUUID().replaceAll('-','_')}`;
const choices:readonly TipChoice[]=['none','percent5','percent10','fixed100','fixed200','fixed500'];
const tipFor=(base:number,choice:TipChoice)=>choice==='percent5'?Math.round(base*0.05):
 choice==='percent10'?Math.round(base*0.10):choice==='fixed100'?100:
 choice==='fixed200'?200:choice==='fixed500'?500:0;

export function ThirdPartyCashPanel({locale,tableId,visitId,transport}:{
 locale:Locale;tableId:string;visitId:string;transport:Transport;
}){
 const es=locale==='es';
 const [debts,setDebts]=useState<readonly Debt[]>([]);
 const [selected,setSelected]=useState<readonly string[]>([]);
 const [choice,setChoice]=useState<TipChoice>('none');
 const [consent,setConsent]=useState(false);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [intent,setIntent]=useState<Intent|null>(null);
 const [refunds,setRefunds]=useState<readonly Refund[]>([]);
 const [cashProof,setCashProof]=useState<CashProof|null>(null);
 const [tips,setTips]=useState<readonly Tip[]>([]);
 const [tipProof,setTipProof]=useState<TipProof|null>(null);
 const pending=useRef<Pending|null>(null);
 const base=debts.filter(d=>selected.includes(d.roundId)).reduce((sum,d)=>sum+d.amountCents,0);
 const tentativeTip=tipFor(base,choice);
 const clear=()=>{setMessage(null);setConsent(false);};
 const read=async()=>{
  if(loading||pending.current)return;
  setLoading(true);setSelected([]);setChoice('none');setDebts([]);clear();
  try{
   const result=await transport.thirdPartyCashDebts({tableId,visitId});
   setDebts(result.items);
   if(!result.items.length)setMessage(es?'No hay consumos disponibles para este pago en caja.':'No consumption is available for cash payment.');
  }catch{setMessage(es?'No se puede comprobar la cuenta. No se realizará ningún cobro.':'Account could not be verified. No payment will be made.');}
  finally{setLoading(false);}
 };
 const toggle=(id:string)=>{
  if(pending.current)return;
  setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=10?prev:[...prev,id]);
  clear();
 };
 const submit=async()=>{
  if(loading||(!pending.current&&(!consent||selected.length===0))||intent)return;
  const rounds=debts.filter(d=>selected.includes(d.roundId))
   .map(({roundId,amountCents})=>({roundId,amountCents}));
  const request=pending.current??{requestKey:makeKey(),rounds,tipOption:choice};
  if(!request.rounds.length||request.rounds.length>10)return;
  pending.current=request;setLoading(true);setMessage(null);
  try{
   const value=await transport.createThirdPartyCashIntent({tableId,visitId,consent:true,
    rounds:request.rounds,requestKey:request.requestKey,tipOption:request.tipOption});
   setIntent({intentId:value.intentId,totalCents:value.totalCents,
    consumptionCents:value.consumptionCents,tipCents:value.tipCents,state:value.state});
   pending.current=null;
   setMessage(es?'Intención registrada. NO se ha recibido ni cobrado dinero. Presenta el importe exacto al personal.':
    'Request recorded. NO money has been collected. Present the exact amount to staff.');
  }catch{setMessage(es?'Resultado incierto: conserva el mismo intento y reintenta sin cambiar la selección.':
   'Uncertain result: retry the same request without changing the selection.');}
  finally{setLoading(false);}
 };
 const showRefunds=async()=>{
  if(loading)return;setLoading(true);setCashProof(null);setMessage(null);
  try{setRefunds((await transport.thirdPartyCashRefunds()).items);}
  catch{setMessage(es?'No se han podido consultar las devoluciones.':'Unable to read refunds.');}
  finally{setLoading(false);}
 };
 const issueCashProof=async(incidentId:string)=>{
  if(loading)return;setLoading(true);setCashProof(null);setMessage(null);
  try{setCashProof(await transport.thirdPartyCashRefundProof(incidentId));}
  catch{setMessage(es?'No se ha podido verificar al pagador original.':'Original payer could not be verified.');}
  finally{setLoading(false);}
 };
 const showTips=async()=>{
  if(loading)return;setLoading(true);setTipProof(null);setMessage(null);
  try{setTips((await transport.myCashTips()).items);}
  catch{setMessage(es?'No se ha podido consultar tu historial de propinas.':'Unable to read your tip history.');}
  finally{setLoading(false);}
 };
 const issueTipProof=async(collectionId:string)=>{
  if(loading)return;setLoading(true);setTipProof(null);setMessage(null);
  try{setTipProof(await transport.cashTipRefundProof(collectionId));}
  catch{setMessage(es?'No se ha podido acreditar la propina original.':'Original tip could not be verified.');}
  finally{setLoading(false);}
 };
 const disableChanges=loading||Boolean(pending.current)||Boolean(intent);
 return <div className="modal-copy" aria-busy={loading}>
  <p>{es?'Puedes pagar consumos concretos de tu cuenta o voluntariamente los de otros comensales de esta mesa. La selección no concede acceso a sus pedidos o historial.':
   'Pay selected items from your own account or voluntarily pay other diners’ balances at this table. This does not grant access to their orders.'}</p>
  <p className="honest-status">{es?'Disponible en este candidato únicamente en efectivo. El pago digital y las propinas digitales requieren Stripe sandbox auténtico.':
   'This candidate supports cash only. Digital payments and tips require real Stripe sandbox validation.'}</p>
  {!intent?<section aria-label={es?'Elegir consumos y propina':'Select consumption and tip'}>
   <button type="button" disabled={disableChanges} onClick={()=>void read()}>
    {es?'Consultar importes autorizados':'View eligible amounts'}
   </button>
   {debts.length>0?<fieldset className="payment-choice">
    <legend>{es?'Selecciona consumos de esta mesa':'Select consumption at this table'}</legend>
    {debts.map(d=><label key={d.roundId}>
     <input type="checkbox" checked={selected.includes(d.roundId)}
      disabled={disableChanges} onChange={()=>toggle(d.roundId)}/>
     <span><strong>{d.customerCode} · {money(d.amountCents,locale)}</strong></span>
    </label>)}
   </fieldset>:null}
   {selected.length>0?<section className="prose-card" aria-label={es?'Propina voluntaria':'Voluntary tip'}>
    <h3>{es?'Propina voluntaria':'Voluntary tip'}</h3>
    <p>{es?'Se destina a los trabajadores; el restaurante gestiona su distribución fuera de Sabora. El importe de consumo ya incluye los descuentos.':
     'Tips are for staff; the restaurant distributes them outside Sabora. Consumption amounts already reflect discounts.'}</p>
    <fieldset className="payment-choice"><legend>{es?'Elige una opción (ninguna positiva viene marcada)':'Choose an option (no positive tip is preselected)'}</legend>
     {choices.map(c=><label key={c}>
      <input type="radio" name="cash-tip-choice" disabled={disableChanges}
       checked={choice===c} onChange={()=>{setChoice(c);clear();}}/>
      <span><strong>{c==='none'?(es?'Sin propina':'No tip'):
       c==='percent5'?'5 %':c==='percent10'?'10 %':
       c==='fixed100'?'1 €':c==='fixed200'?'2 €':'5 €'}</strong>
       <small>{money(tipFor(base,c),locale)}</small></span>
     </label>)}
    </fieldset>
    <div className="checkout-total"><span>{es?'Consumo después de descuentos':'Post-discount consumption'}</span><strong>{money(base,locale)}</strong></div>
    <div className="checkout-total"><span>{es?'Propina separada':'Separate tip'}</span><strong>{money(tentativeTip,locale)}</strong></div>
    <div className="checkout-total"><span>{es?'Total para caja (a validar por servidor)':'Cash total (server validates)'}</span><strong>{money(base+tentativeTip,locale)}</strong></div>
    <p className="privacy-copy">{es?'El servidor recalcula la propina antes de registrar la intención. Una devolución del consumo no devuelve automáticamente la propina.':
     'The server recalculates the tip before creating a request. A consumption refund does not automatically refund your tip.'}</p>
   </section>:null}
   {selected.length>0?<label className="honest-status">
    <input type="checkbox" disabled={disableChanges} checked={consent}
     onChange={e=>setConsent(e.target.checked)}/>
    {es?' Consiento expresamente estos consumos y, si corresponde, la propina seleccionada.':
     ' I expressly agree to pay these balances and my selected tip, if any.'}
   </label>:null}
   <button type="button" className="primary-action"
    disabled={loading||(!pending.current&&(!consent||selected.length===0||Boolean(intent)))}
    onClick={()=>void submit()}>
    {pending.current?(es?'Reintentar la misma intención':'Retry the same request'):
     (es?'Registrar intención de pago en caja':'Submit cashier payment request')}
   </button>
  </section>:<section className="prose-card" role="status">
   <h3>{es?'Solicitud de caja registrada':'Cashier request recorded'}</h3>
   <p><strong>{intent.intentId}</strong></p>
   <p>{es?'Consumo':'Consumption'}: {money(intent.consumptionCents,locale)}</p>
   <p>{es?'Propina':'Tip'}: {money(intent.tipCents,locale)}</p>
   <p><strong>{es?'Total':'Total'}: {money(intent.totalCents,locale)}</strong></p>
   <p>{es?'Estado: ':'Status: '}{intent.state==='paid'?(es?'Cobro confirmado por servidor':'Server-confirmed payment'):
    (es?'Pendiente de recepción por caja':'Awaiting physical cash receipt')}</p>
  </section>}
  {message?<p className="honest-status" role="status">{message}</p>:null}
  <section className="prose-card" aria-label={es?'Devoluciones de consumos ajenos':'Other diner refunds'}>
   <h3>{es?'Devoluciones al pagador original':'Refunds to the original payer'}</h3>
   <button type="button" disabled={loading} onClick={()=>void showRefunds()}>
    {es?'Consultar devoluciones de consumo':'View consumption refunds'}
   </button>
   {refunds.map(r=><div className="honest-status" key={r.incidentId}>
    <p>{money(r.amountCents,locale)}</p>
    <button type="button" disabled={loading} onClick={()=>void issueCashProof(r.incidentId)}>
     {es?'Acreditar pagador original':'Verify original payer'}
    </button>
   </div>)}
   {cashProof?<div className="honest-status" role="status">
    <p>{es?'Incidencia':'Incident'}: {cashProof.incidentId}</p>
    <p>{es?'Prueba':'Proof'}: {cashProof.claimId}</p>
    <p><code>{cashProof.proof}</code></p>
    <p>{es?'Caduca':'Expires'}: {new Date(cashProof.expiresAt).toLocaleString(es?'es-ES':'en-GB')}</p>
   </div>:null}
  </section>
  <section className="prose-card" aria-label={es?'Devolución explícita de propina':'Express tip refund'}>
   <h3>{es?'Devolución explícita de propina':'Express tip refund'}</h3>
   <p>{es?'El reembolso de consumo no devuelve la propina. Una devolución de propina requiere tu prueba temporal y autorización de ADMIN; la entrega en efectivo se verifica presencialmente.':
    'A consumption refund does not refund the tip. Tip refund requires your temporary proof and ADMIN authorization, with physical cash handover.'}</p>
   <button type="button" disabled={loading} onClick={()=>void showTips()}>
    {es?'Consultar mis propinas recaudadas':'View my collected tips'}
   </button>
   {tips.map(t=><div className="honest-status" key={t.collectionId}>
    <p>{money(t.tipCents,locale)} · {new Date(t.collectedAt).toLocaleString(es?'es-ES':'en-GB')}</p>
    <button type="button" disabled={loading} onClick={()=>void issueTipProof(t.collectionId)}>
     {es?'Solicitar prueba para devolución':'Request refund proof'}
    </button>
   </div>)}
   {tipProof?<div className="honest-status" role="status">
    <p>{es?'Propina':'Tip'}: {money(tipProof.tipCents,locale)}</p>
    <p>{es?'Referencia de cobro':'Collection reference'}: <code>{tipProof.collectionId}</code></p>
    <p>{es?'Referencia de prueba':'Proof reference'}: <code>{tipProof.claimId}</code></p>
    <p>{es?'Código temporal':'Temporary code'}: <code>{tipProof.proof}</code></p>
    <p>{es?'Caduca':'Expires'}: {new Date(tipProof.expiresAt).toLocaleString(es?'es-ES':'en-GB')}</p>
   </div>:null}
  </section>
  <p className="privacy-copy">{es?'La prueba de identidad no es un cobro ni una devolución confirmada. Muéstrala solo al personal autorizado.':
   'Identity proof alone does not confirm a charge or refund. Show it only to authorized staff.'}</p>
 </div>;
}
