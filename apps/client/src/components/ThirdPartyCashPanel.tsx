import {useState,useRef} from 'react';
import {formatPrice} from '../catalog';
import type {Locale} from '../client-state';
import type {createCustomerFlowTransport} from '../customer-flow-transport';

type Transport=ReturnType<typeof createCustomerFlowTransport>;
type Debt=Readonly<{roundId:string;accountId:string;customerCode:string;amountCents:number}>;
type Refund=Readonly<{incidentId:string;amountCents:number}>;
type Intent=Readonly<{intentId:string;totalCents:number;state:'pending'|'paid'}>;
type Proof=Readonly<{claimId:string;incidentId:string;proof:string;amountCents:number;expiresAt:string}>;

const amount=(cents:number,locale:Locale)=>formatPrice(cents,locale==='es'?'es-ES':'en-IE');
const key=()=>`tp_cash_${crypto.randomUUID().replaceAll('-','_')}`;

export function ThirdPartyCashPanel({locale,tableId,visitId,transport}:{
 locale:Locale;tableId:string;visitId:string;transport:Transport
}){
 const es=locale==='es';
 const [debts,setDebts]=useState<readonly Debt[]>([]);
 const [selected,setSelected]=useState<readonly string[]>([]);
 const [consent,setConsent]=useState(false);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [intent,setIntent]=useState<Intent|null>(null);
 const [refunds,setRefunds]=useState<readonly Refund[]>([]);
 const [proof,setProof]=useState<Proof|null>(null);
 const pending=useRef<{requestKey:string;rounds:{roundId:string;amountCents:number}[]}|null>(null);
 const total=debts.filter(d=>selected.includes(d.roundId)).reduce((sum,d)=>sum+d.amountCents,0);
 const read=async()=>{
  if(loading||pending.current)return;
  setLoading(true);setMessage(null);setConsent(false);setSelected([]);setDebts([]);
  try{const result=await transport.thirdPartyCashDebts({tableId,visitId});
   setDebts(result.items);
   setMessage(result.items.length===0?(es?'No hay deudas ajenas disponibles para este flujo presencial.':'No eligible third-party debts for this in-person flow.'):null);
  }catch{setMessage(es?'No se pueden comprobar las deudas autorizadas. No se realizará ningún cargo.':'Unable to verify authorized debts. No payment will be made.');}
  finally{setLoading(false);}
 };
 const toggle=(id:string)=>{
  setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=10?prev:[...prev,id]);
  setConsent(false);setMessage(null);
 };
 const submit=async()=>{
  if(loading||!consent||selected.length<1||intent)return;
  const rounds=debts.filter(d=>selected.includes(d.roundId)).map(({roundId,amountCents})=>({roundId,amountCents}));
  if(rounds.length!==selected.length)return;
  const request=pending.current??{requestKey:key(),rounds};
  pending.current=request;setLoading(true);setMessage(null);
  try{const result=await transport.createThirdPartyCashIntent({tableId,visitId,consent:true,rounds:request.rounds,requestKey:request.requestKey});
   setIntent({intentId:result.intentId,totalCents:result.totalCents,state:result.state});
   pending.current=null;
   setMessage(es?'Solicitud registrada. Todavía NO se ha cobrado: presenta esta intención en caja y entrega el efectivo al personal.':'Request recorded. It has NOT been paid: present the request at the cashier and hand the cash to staff.');
  }catch{setMessage(es?'El resultado de la intención no está confirmado. Usa «Reintentar la misma solicitud»; no generes otra clave.':'Request outcome is uncertain. Retry the SAME request; do not generate another key.');}
  finally{setLoading(false);}
 };
 const showRefunds=async()=>{
  if(loading)return;setLoading(true);setProof(null);setMessage(null);
  try{setRefunds((await transport.thirdPartyCashRefunds()).items);}
  catch{setMessage(es?'No se pueden verificar las devoluciones.':'Unable to verify your refunds.');}
  finally{setLoading(false);}
 };
 const issueProof=async(incidentId:string)=>{
  if(loading)return;setLoading(true);setProof(null);setMessage(null);
  try{setProof(await transport.thirdPartyCashRefundProof(incidentId));}
  catch{setMessage(es?'No se ha podido acreditar al pagador original. No entregues ningún código antiguo.':'Original payer could not be verified. Do not use any previous code.');}
  finally{setLoading(false);}
 };
 return <div className="modal-copy" aria-busy={loading}>
  <p>{es?'Puedes pagar voluntariamente consumos concretos de otros comensales de esta mesa. Solo se muestran los importes indispensables; nunca sus pedidos ni datos privados.':'You can voluntarily pay selected debts of other diners at this table. Only minimum amounts are shown, not their orders or private details.'}</p>
  <p className="honest-status">{es?'Este circuito registra una intención de pago EN EFECTIVO. No cobra digitalmente ni salda deuda hasta que el personal confirme que recibió el dinero.':'This is a CASH payment request. No digital charge or settlement occurs until staff confirms physical cash receipt.'}</p>
  {!intent?<section aria-label={es?'Elegir deudas ajenas':'Select third-party debts'}>
   <button type="button" disabled={loading||Boolean(pending.current)} onClick={()=>void read()}>{es?'Consultar deudas disponibles':'View eligible debts'}</button>
   {debts.length>0?<fieldset className="payment-choice">
    <legend>{es?'Selecciona las deudas que quieres pagar':'Select debts to pay'}</legend>
    {debts.map(d=><label key={d.roundId}>
     <input type="checkbox" checked={selected.includes(d.roundId)}
      disabled={loading||Boolean(pending.current)}
      onChange={()=>toggle(d.roundId)}/>
     <span><strong>{d.customerCode} · {amount(d.amountCents,locale)}</strong></span>
    </label>)}
   </fieldset>:null}
   {selected.length>0?<div className="checkout-total" role="status">
    <span>{es?'Importe seleccionado':'Selected amount'}</span><strong>{amount(total,locale)}</strong>
   </div>:null}
   {selected.length>0?<label className="honest-status">
    <input type="checkbox" disabled={loading||Boolean(pending.current)}
     checked={consent} onChange={event=>setConsent(event.target.checked)}/>
    {es?' Consiento expresamente pagar estos importes de las cuentas indicadas. La deuda y los pedidos siguen siendo de sus titulares.':' I expressly agree to pay these specific debts. The orders and accounts remain with their owners.'}
   </label>:null}
   <button className="primary-action" type="button"
    disabled={loading||(!pending.current&&(!consent||selected.length===0))}
    onClick={()=>void submit()}>
    {pending.current?(es?'Reintentar la misma solicitud':'Retry same request'):
     (es?'Registrar intención para caja':'Submit cashier payment request')}
   </button>
  </section>:<section className="prose-card" role="status">
   <h3>{es?'Intención de pago registrada':'Payment request registered'}</h3>
   <p><strong>{intent.intentId}</strong></p>
   <p>{amount(intent.totalCents,locale)}</p>
   <p>{es?'Estado de la última respuesta: ':'Last reported state: '}{intent.state==='paid'?(es?'Confirmado por caja':'Confirmed by staff'):(es?'Pendiente de caja':'Awaiting cashier')}</p>
   <p>{es?'Presenta este identificador al personal. No indica que el dinero se haya recibido.':'Show this reference to staff. It does not prove receipt of funds.'}</p>
  </section>}
  {message?<p className="honest-status" role="status">{message}</p>:null}
  <section className="prose-card" aria-label={es?'Devoluciones al pagador original':'Refunds to original payer'}>
   <h3>{es?'Devoluciones de pagos que realizaste':'Refunds for payments you made'}</h3>
   <p>{es?'Si se anuló un consumo ajeno que pagaste, solicita una prueba temporal. El personal debe comprobarla y entregarte presencialmente el importe correspondiente.':'If a charge you paid for another diner was canceled, request a time-limited proof. Staff must verify it before physically handing you the refund.'}</p>
   <button type="button" disabled={loading} onClick={()=>void showRefunds()}>
    {es?'Consultar mis devoluciones pendientes':'View my pending refunds'}
   </button>
   {refunds.map(item=><div key={item.incidentId} className="honest-status">
    <p>{es?'Devolución pendiente':'Refund due'} · {amount(item.amountCents,locale)}</p>
    <button type="button" disabled={loading} onClick={()=>void issueProof(item.incidentId)}>
     {es?'Generar prueba para caja':'Generate cashier verification'}
    </button>
   </div>)}
   {proof?<div className="honest-status" role="status">
    <strong>{es?'Prueba temporal para tu devolución':'Time-limited refund proof'}</strong>
    <p>{amount(proof.amountCents,locale)}</p>
    <p>{es?'Identificador: ':'Claim ID: '}{proof.claimId}</p>
    <p>{es?'Código de verificación: ':'Verification code: '}<code>{proof.proof}</code></p>
    <p>{es?'Caduca: ':'Expires: '}{new Date(proof.expiresAt).toLocaleString(es?'es-ES':'en-GB')}</p>
    <p>{es?'Entrégalo únicamente al personal autorizado al recibir el dinero. No compartas capturas ni mensajes.':'Present it only to authorized staff as you receive the refund. Do not share screenshots or messages.'}</p>
   </div>:null}
  </section>
  <p className="privacy-copy">{es?'El QR no autoriza por sí solo consultar cuentas ajenas. La devolución de efectivo es presencial; este comprobante no acredita una transferencia bancaria.':'QR alone does not authorize reading others’ accounts. Cash refunds are in person; this proof is not a bank transfer.'}</p>
 </div>;
}
