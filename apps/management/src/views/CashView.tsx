import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ConnectionNotice,EmptyState,ErrorState,LoadingState,PageHeader,StatusBadge} from '../components/Primitives';
import type {EconomicAccountSnapshot,OrderOperationsGateway} from '../order-operations-gateway.js';

const euro=(cents:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(cents/100);
const correlation=()=>`ui_external_verify_${crypto.randomUUID().replaceAll('-','_')}`;
const closeCorrelation=()=>`ui_operational_close_${crypto.randomUUID().replaceAll('-','_')}`;
const tableCloseCorrelation=()=>`ui_table_operational_close_${crypto.randomUUID().replaceAll('-','_')}`;
const unresolvedSettlement=(state:string)=>['external_pending','stripe_authorization_requested',
 'stripe_requires_action','stripe_authorized','stripe_authorization_unknown',
 'stripe_capture_requested','stripe_capture_unknown','stripe_refund_pending'].includes(state);

export function CashView({gateway}:{gateway?:OrderOperationsGateway|null}){
 const [snapshot,setSnapshot]=useState<EconomicAccountSnapshot|null>(null);
 const [phase,setPhase]=useState<'idle'|'loading'|'ready'|'error'>(gateway?'loading':'idle');
 const [busy,setBusy]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const [ack,setAck]=useState<ReadonlySet<string>>(new Set());
 const [closeAck,setCloseAck]=useState<ReadonlySet<string>>(new Set());
 const [tableCloseAck,setTableCloseAck]=useState<ReadonlySet<string>>(new Set());
 const epoch=useRef(0);
 const load=useCallback(async()=>{
  if(!gateway)return;const current=++epoch.current;setPhase('loading');
  try{const value=await gateway.listEconomicAccounts();if(current!==epoch.current)return;
   setSnapshot(value);setPhase('ready');setMessage(null);
  }catch{if(current!==epoch.current)return;setPhase('error');
   setMessage('No se ha podido leer el consumo operativo. No se permite inferir cobros ni cierres.');}
 },[gateway]);
 useEffect(()=>{void load();return()=>{epoch.current+=1;};},[load]);
 const verify=async(intentId:string)=>{
  if(!gateway||busy||!ack.has(intentId))return;setBusy(intentId);setMessage(null);
  try{await gateway.verifyExternalSettlement({intentId,correlationId:correlation()});
   setAck(current=>{const next=new Set(current);next.delete(intentId);return next;});
   await load();
   setMessage('Verificación externa registrada. No acredita cobro, devolución, recaudación ni factura.');
  }catch{setMessage('La verificación no quedó confirmada. No se ha alterado el saldo operativo.');}
  finally{setBusy(null);}
 };
 const closeOperational=async(accountId:string)=>{
  if(!gateway||busy||!closeAck.has(accountId))return;setBusy(accountId);setMessage(null);
  try{await gateway.closeOperationalAccount({accountId,correlationId:closeCorrelation()});
   setCloseAck(current=>{const next=new Set(current);next.delete(accountId);return next;});
   await load();
   setMessage('Cuenta cerrada operativamente con identidad y hora del personal. No se ha registrado dinero.');
  }catch{setMessage('El cierre operativo no quedó confirmado. Comprueba pendientes y reintenta sin inferir cobros.');}
  finally{setBusy(null);}
 };
 const closeTable=async(tableId:string,sessionId:string)=>{
  const key=`${tableId}:${sessionId}`;
  if(!gateway||busy||!tableCloseAck.has(key))return;setBusy(key);setMessage(null);
  try{await gateway.closeEconomicTable({tableId,sessionId,correlationId:tableCloseCorrelation()});
   setTableCloseAck(current=>{const next=new Set(current);next.delete(key);return next;});
   await load();
   setMessage('Mesa cerrada operativamente con actor y hora. No se ha registrado caja externa como dinero.');
  }catch{setMessage('El cierre de mesa no quedó confirmado. No se ha inferido ningún cobro. Revisa todas las cuentas.');}
  finally{setBusy(null);}
 };
 const totals=useMemo(()=>snapshot?.items.reduce((sum,item)=>({
  gross:sum.gross+item.grossConsumptionCents,cancelled:sum.cancelled+item.cancelledCents,
  net:sum.net+item.netConsumptionCents,captured:sum.captured+item.stripeCapturedCents,
  refunded:sum.refunded+item.stripeRefundedCents,stripeNet:sum.stripeNet+item.stripeNetCents
 }),{gross:0,cancelled:0,net:0,captured:0,refunded:0,stripeNet:0})??null,[snapshot]);
 const tableSessions=useMemo(()=>{
  const values=new Map<string,{tableId:string;sessionId:string;accounts:EconomicAccountSnapshot['items'][number][]}>();
  for(const account of snapshot?.items??[]){const key=`${account.tableId}:${account.sessionId}`;
   const group=values.get(key)??{tableId:account.tableId,sessionId:account.sessionId,accounts:[]};
   group.accounts.push(account);values.set(key,group);}
  return [...values.entries()];
 },[snapshot]);
 return <div className="view-stack">
  <PageHeader eyebrow="Operación económica" title="Consumo y cierre operativo"
   description="Stripe es el único movimiento monetario acreditado por Sabora. Caja o terminal externos se verifican solo para liberar y cerrar operativamente."/>
  <ConnectionNotice title={gateway?'Proyección económica restringida.':'Circuito económico no conectado.'}
   tone={gateway?'brand':'warning'}>
   {gateway?'Los datos proceden de capacidades firmadas de sala.':'No se mostrarán ni inferirán consumos o liquidaciones.'}
  </ConnectionNotice>
  <section className="honest-operational-note" aria-label="Límite contable">
   <strong>Consumo operativo, no recaudación ni facturación acreditada.</strong>
   <span> Una cancelación reduce consumo. Nunca demuestra una devolución realizada fuera de Sabora.</span>
  </section>
  {message?<p role="status" className="honest-operational-note">{message}</p>:null}
  {phase==='loading'?<LoadingState title="Leyendo consumos" description="Comprobando confirmaciones operativas y Stripe."/>:null}
  {phase==='error'?<ErrorState title="Proyección económica no disponible" description={message??'Sin datos verificables.'} onRetry={()=>void load()}/>:null}
  {phase==='ready'&&snapshot?.items.length===0?<EmptyState icon="orders" title="Sin cuentas operativas" description="Todavía no hay consumos abiertos o conciliados para esta sesión."/>:null}
  {phase==='ready'&&snapshot?.items.length?<section className="data-panel" aria-label="Cuentas por persona y mesa">
   <div className="panel-heading"><div><span className="eyebrow">Sala</span><h2>Personas y cuentas</h2></div>
    <button type="button" onClick={()=>void load()} disabled={Boolean(busy)}>Actualizar</button></div>
   {totals?<div className="metric-grid" aria-label="Resumen económico separado">
    <article className="metric-card"><span>Consumo bruto</span><strong>{euro(totals.gross)}</strong><p>Magnitud operativa; no acredita recaudación.</p></article>
    <article className="metric-card"><span>Cancelaciones</span><strong>{euro(totals.cancelled)}</strong><p>Ajustes aprobados de consumo no servido.</p></article>
    <article className="metric-card"><span>Consumo neto</span><strong>{euro(totals.net)}</strong><p>Bruto menos cancelaciones; no es una liquidación fiscal.</p></article>
    <article className="metric-card"><span>Stripe acreditado neto</span><strong>{euro(totals.stripeNet)}</strong><p>Capturas {euro(totals.captured)} menos devoluciones ejecutadas {euro(totals.refunded)}.</p></article>
   </div>:null}
   <div className="operation-list" aria-label="Cierre operativo por mesa">{tableSessions.map(([key,group])=>{
    const closable=group.accounts.every(account=>account.outstandingCents===0&&
     !account.settlements.some(item=>unresolvedSettlement(item.state)))&&
     group.accounts.some(account=>account.operationalState!=='settled');
    if(!closable)return null;
    return <article className="operation-card" key={key}><div><strong>Cierre conjunto de mesa</strong>
     <p>{group.accounts.length} cuenta(s) conciliadas. La operación es atómica y no acredita dinero externo.</p></div>
     <label><input type="checkbox" checked={tableCloseAck.has(key)} disabled={Boolean(busy)}
      onChange={event=>setTableCloseAck(current=>{const next=new Set(current);if(event.target.checked)next.add(key);else next.delete(key);return next;})}/>
      He comprobado el estado operativo de todas las cuentas de esta sesión de mesa.</label>
     <button type="button" className="button button--primary" disabled={Boolean(busy)||!tableCloseAck.has(key)}
      onClick={()=>void closeTable(group.tableId,group.sessionId)}>{busy===key?'Cerrando mesa…':'Cerrar mesa operativamente'}</button>
    </article>;
   })}</div>
   <ul className="operation-list">{snapshot.items.map(account=>{
    const hasUnresolved=account.settlements.some(item=>unresolvedSettlement(item.state));
    const tone=account.outstandingCents>0||hasUnresolved?'warning':'brand';
    return <li key={account.accountId} className="operation-card">
     <div><strong>{account.customerAlias} · {account.customerCode}</strong>
      <p>Bruto {euro(account.grossConsumptionCents)} · cancelado {euro(account.cancelledCents)} · neto {euro(account.netConsumptionCents)}</p>
      <p>Stripe: capturado {euro(account.stripeCapturedCents)} · devuelto {euro(account.stripeRefundedCents)} · neto {euro(account.stripeNetCents)}</p>
      <p>Pendiente operativo: {euro(account.outstandingCents)} · modalidad {account.paymentTiming==='pay_now'?'al pedir':'al final'} · canales y verificaciones detallados por liquidación</p></div>
     <StatusBadge tone={tone}>{account.outstandingCents>0?'SALDO OPERATIVO PENDIENTE':hasUnresolved?'LIQUIDACIÓN O DEVOLUCIÓN PENDIENTE':'SALDO OPERATIVO CERO'}</StatusBadge>
     {account.settlements.length?<ul className="operation-list" aria-label={`Liquidaciones de ${account.customerAlias}`}>
      {account.settlements.map(item=>{
       const pendingExternal=item.channel==='external'&&item.state==='external_pending';
       const refundPending=item.state==='stripe_refund_pending';
       const label=pendingExternal?'EXTERNO PENDIENTE':item.state==='external_verified'?'EXTERNO VERIFICADO':
        refundPending?'STRIPE CAPTURADO · DEVOLUCIÓN PENDIENTE':
        item.state==='stripe_partially_refunded'?'STRIPE · DEVOLUCIÓN PARCIAL':
        item.state==='stripe_refunded'?'STRIPE · DEVUELTO':
        item.state==='stripe_captured'?'STRIPE CONFIRMADO':
        item.state==='stripe_requires_action'?'STRIPE · ACCIÓN PENDIENTE':
        item.channel==='stripe'?'STRIPE · SIN CONFIRMAR':'EXTERNO · SIN VERIFICAR';
       return <li key={item.intentId} className="honest-operational-note">
        <div><strong>{item.channel==='stripe'?'Stripe':'Caja/terminal externa'} · {euro(item.allocatedCents)}</strong>
         <span> Identificador de liquidación: {item.intentId.slice(0,8)}</span></div>
        <StatusBadge tone={pendingExternal||refundPending?'warning':item.providerConfirmed||item.externalVerified?'brand':'neutral'}>
         {label}
        </StatusBadge>
        {pendingExternal?<div className="button-row">
         <label><input type="checkbox" checked={ack.has(item.intentId)} disabled={Boolean(busy)}
          onChange={event=>setAck(current=>{const next=new Set(current);if(event.target.checked)next.add(item.intentId);else next.delete(item.intentId);return next;})}/>
          He comprobado físicamente que el cliente pasó por la caja o terminal externa. Sabora no registra dinero.</label>
         <button className="button button--primary" type="button" disabled={Boolean(busy)||!ack.has(item.intentId)}
          onClick={()=>void verify(item.intentId)}>{busy===item.intentId?'Verificando…':'Verificar y liberar operativamente'}</button>
        </div>:null}
       </li>;
      })}
     </ul>:<p className="honest-operational-note">No hay liquidaciones al final individualizadas en esta cuenta. Los importes Stripe históricos se muestran arriba, sin inferir canal externo.</p>}
     {account.outstandingCents===0&&!hasUnresolved&&account.operationalState!=='settled'?<div className="button-row">
      <label><input type="checkbox" checked={closeAck.has(account.accountId)} disabled={Boolean(busy)}
       onChange={event=>setCloseAck(current=>{const next=new Set(current);if(event.target.checked)next.add(account.accountId);else next.delete(account.accountId);return next;})}/>
       He comprobado el estado del canal correspondiente. Este cierre es operativo y no registra ni entrega dinero.</label>
      <button type="button" className="button button--primary" disabled={Boolean(busy)||!closeAck.has(account.accountId)}
       onClick={()=>void closeOperational(account.accountId)}>{busy===account.accountId?'Cerrando…':'Cerrar cuenta operativamente'}</button>
     </div>:null}
    </li>;
   })}</ul>
  </section>:null}
 </div>;
}
