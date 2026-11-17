import {useRef,useState} from 'react';
import {formatPrice} from '../catalog';
import type {Locale} from '../client-state';
import type {createCustomerFlowTransport} from '../customer-flow-transport';

type Transport=ReturnType<typeof createCustomerFlowTransport>;
type Round=Readonly<{roundId:string;amountCents:number;customerCode:string;customerAlias:string;own:boolean}>;
type Pending=Readonly<{requestKey:string;channel:'stripe'|'external';allocations:readonly {roundId:string;amountCents:number}[]}>;
type Receipt=Readonly<{intentId:string;state:string;amountCents:number;clientSecret?:string}>;
type Recovery=Pending&Readonly<{intentId:string;state:string;amountCents:number;createdAt:string}>;
const money=(cents:number,locale:Locale)=>formatPrice(cents,locale==='es'?'es-ES':'en-IE');
const makeKey=()=>`economic_settlement_${crypto.randomUUID().replaceAll('-','_')}`;
const recoverableStripe=(state:string)=>['stripe_authorization_requested','stripe_requires_action','stripe_authorized',
 'stripe_authorization_unknown','stripe_capture_requested','stripe_capture_unknown'].includes(state);

export function EconomicSettlementPanel({locale,tableId,visitId,transport,confirmStripePayment=null}:{
 locale:Locale;tableId:string;visitId:string;transport:Transport;
 confirmStripePayment?:((clientSecret:string)=>Promise<void>)|null;
}){
 const es=locale==='es';
 const [rounds,setRounds]=useState<readonly Round[]>([]);
 const [selected,setSelected]=useState<ReadonlySet<string>>(new Set());
 const [channel,setChannel]=useState<'stripe'|'external'>('stripe');
 const [consent,setConsent]=useState(false);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [receipt,setReceipt]=useState<Receipt|null>(null);
 const [recoveries,setRecoveries]=useState<readonly Recovery[]>([]);
 const pending=useRef<Pending|null>(null);
 const total=rounds.filter(r=>selected.has(r.roundId)).reduce((sum,r)=>sum+r.amountCents,0);
 const read=async()=>{
  if(loading||pending.current)return;setLoading(true);setMessage(null);setReceipt(null);
  try{const value=await transport.economicConsumption({tableId,visitId});
   setRecoveries(value.pendingSettlements);
   setRounds(value.items.flatMap(account=>account.rounds.map(round=>({...round,
    customerCode:account.customerCode,customerAlias:account.customerAlias,own:account.own}))));
   setSelected(new Set());setConsent(false);
   if(!value.items.some(x=>x.rounds.length)&&!value.pendingSettlements.length)
    setMessage(es?'No hay consumos pendientes elegibles.':'No eligible consumption is pending.');
  }catch{setMessage(es?'No se ha podido verificar el consumo. No se iniciará ninguna liquidación.':'Consumption could not be verified. No settlement will start.');}
  finally{setLoading(false);}
 };
 const submit=async(recovery:Recovery|null=null)=>{
  if(loading||(!recovery&&!pending.current&&(!consent||selected.size===0)))return;
  const previous=recovery?null:receipt;
  const request=recovery?{requestKey:recovery.requestKey,channel:recovery.channel,
   allocations:recovery.allocations}:pending.current??{requestKey:makeKey(),channel,
   allocations:rounds.filter(r=>selected.has(r.roundId)).map(({roundId,amountCents})=>({roundId,amountCents}))};
  pending.current=request;setLoading(true);setMessage(null);
  try{
   if(previous?.state==='stripe_requires_action'){
    if(!previous.clientSecret||!confirmStripePayment)throw Error('stripe_component_unavailable');
    await confirmStripePayment(previous.clientSecret);
   }
   const value=await transport.createEconomicSettlement({tableId,visitId,...request});
   setReceipt(value);pending.current=recoverableStripe(value.state)?request:null;
   setRecoveries(current=>recoverableStripe(value.state)
    ?current.map(item=>item.intentId===value.intentId?{...item,state:value.state}:item)
    :current.filter(item=>item.intentId!==value.intentId));
   if(value.state!=='stripe_failed'&&!recoverableStripe(value.state)){
    const settled=new Set(request.allocations.map(item=>item.roundId));
    setRounds(current=>current.filter(item=>!settled.has(item.roundId)));
    setSelected(new Set());setConsent(false);
   }else if(value.state==='stripe_failed')setConsent(false);
   setMessage(value.channel==='external'
    ?(es?'Elección externa registrada. El personal debe comprobarla físicamente; Sabora no acredita dinero.':'External choice recorded. Staff must verify it physically; Sabora does not accredit money.')
    :value.state==='stripe_captured'
     ?(es?'Captura Stripe confirmada por el proveedor.':'Stripe capture confirmed by the provider.')
     :value.state==='stripe_failed'
      ?(es?'Stripe confirmó el fallo. No se acredita dinero; puedes iniciar una solicitud nueva o elegir el canal externo.':'Stripe confirmed failure. No money is accredited; you can start a new request or choose the external channel.')
      :value.state==='stripe_requires_action'
       ?(confirmStripePayment?(es?'Stripe requiere confirmación del cliente. Completa la acción y concilia la misma solicitud.':'Stripe requires customer confirmation. Complete the action and reconcile the same request.'):
        (es?'Esta instalación no tiene el componente Stripe autorizado. No se acredita dinero; pide ayuda al personal.':'This installation has no authorized Stripe component. No money is accredited; ask staff for help.'))
       :(es?'Resultado Stripe aún desconocido. Concilia la misma solicitud; no inicies otra.':'Stripe result is still unknown. Reconcile the same request; do not start another.'));
  }catch{setMessage(es?'Resultado incierto. Reintenta exactamente la misma solicitud; no cambies canal ni consumos.':'Unknown result. Retry the exact same request; do not change channel or consumption.');}
  finally{setLoading(false);}
 };
 const disabled=loading||Boolean(pending.current);
 return <div className="modal-copy" aria-busy={loading}>
  <p>{es?'Liquida al final consumos propios o de otras personas de esta mesa. La selección no revela pedidos ni historial privado.':'Settle your own or other diners’ consumption at this table. Selection does not reveal private orders or history.'}</p>
  <p className="honest-status"><strong>{es?'Stripe es el único dinero acreditado dentro de Sabora.':'Stripe is the only money accredited inside Sabora.'}</strong> {es?'La caja o terminal externa solo genera una comprobación operativa.':'An external cash desk or terminal creates only an operational verification.'}</p>
  <button type="button" disabled={disabled} onClick={()=>void read()}>{es?'Consultar consumo pendiente':'View pending consumption'}</button>
  {recoveries.length?<section className="prose-card" aria-label={es?'Liquidaciones pendientes':'Pending settlements'}>
   <h3>{es?'Solicitudes pendientes recuperadas':'Recovered pending requests'}</h3>
   {recoveries.map(item=><div key={item.intentId} className="honest-status"><strong>{item.channel==='stripe'?'Stripe':(es?'Canal externo':'External channel')} · {money(item.amountCents,locale)}</strong><br/><code>{item.intentId}</code><br/><span>{item.state}</span>
    {item.channel==='stripe'&&recoverableStripe(item.state)?<><br/><button type="button" disabled={disabled} onClick={()=>void submit(item)}>{es?'Reconciliar esta misma solicitud':'Reconcile this same request'}</button></>:null}
   </div>)}
  </section>:null}
  {rounds.length?<fieldset className="payment-choice"><legend>{es?'Selecciona consumos':'Select consumption'}</legend>
   {rounds.map(round=><label key={round.roundId}><input type="checkbox" checked={selected.has(round.roundId)} disabled={disabled}
    onChange={event=>{setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(round.roundId);else next.delete(round.roundId);return next;});setConsent(false);}}/>
    <span><strong>{round.own?(es?'Mi consumo':'My consumption'):round.customerAlias} · {money(round.amountCents,locale)}</strong><small>{round.customerCode}</small></span></label>)}
  </fieldset>:null}
  {selected.size?<fieldset className="payment-choice"><legend>{es?'Canal de liquidación':'Settlement channel'}</legend>
   <label><input type="radio" name="economic-channel" checked={channel==='stripe'} disabled={disabled} onChange={()=>{setChannel('stripe');setConsent(false);}}/><span><strong>Stripe</strong><small>{es?'Confirmación monetaria del proveedor':'Provider-confirmed money'}</small></span></label>
   <label><input type="radio" name="economic-channel" checked={channel==='external'} disabled={disabled} onChange={()=>{setChannel('external');setConsent(false);}}/><span><strong>{es?'Caja o terminal externa':'External cash desk or terminal'}</strong><small>{es?'Elección y verificación operativa, sin libro de dinero':'Operational choice and verification, no money ledger'}</small></span></label>
  </fieldset>:null}
  {selected.size&&!pending.current?<><div className="checkout-total"><span>{es?'Consumo neto seleccionado':'Selected net consumption'}</span><strong>{money(total,locale)}</strong></div>
   <label className="honest-status"><input type="checkbox" checked={consent} disabled={disabled} onChange={e=>setConsent(e.target.checked)}/> {es?'Confirmo esta selección y el canal indicado.':'I confirm this selection and channel.'}</label>
   <button className="primary-action" type="button" disabled={loading||!consent} onClick={()=>void submit()}>{es?'Iniciar liquidación':'Start settlement'}</button></>:null}
  {receipt?<section className="prose-card" role="status"><h3>{es?'Solicitud registrada':'Request recorded'}</h3><p><code>{receipt.intentId}</code></p><p>{money(receipt.amountCents,locale)} · {receipt.state}</p></section>:null}
  {pending.current?<button className="primary-action" type="button" disabled={loading} onClick={()=>void submit()}>{receipt?.state==='stripe_requires_action'&&confirmStripePayment?(es?'Completar Stripe y conciliar':'Complete Stripe and reconcile'):(es?'Reconciliar la misma solicitud':'Reconcile the same request')}</button>:null}
  {message?<p className="honest-status" role="status">{message}</p>:null}
 </div>;
}
