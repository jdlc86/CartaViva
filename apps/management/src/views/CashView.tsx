import {useCallback,useEffect,useRef,useState} from 'react';
import {ConnectionNotice,EmptyState,ErrorState,LoadingState,PageHeader,StatusBadge} from '../components/Primitives';
import type {CashAccount,CashAccountSnapshot,OrderOperationsGateway} from '../order-operations-gateway.js';
import {ThirdPartyCashDesk} from './ThirdPartyCashDesk';

const euro=(cents:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(cents/100);
const centsFromInput=(raw:string):number|null=>{
 const normalized=raw.trim();
 const parsed=/^([0-9]{1,9})(?:[,.]([0-9]{1,2}))?$/.exec(normalized);
 if(!parsed)return null;
 const amount=Number(parsed[1])*100+Number((parsed[2]??'').padEnd(2,'0'));
 return Number.isSafeInteger(amount)&&amount>0?amount:null;
};
const eurosForInput=(cents:number)=>String(Math.floor(cents/100))+','+String(cents%100).padStart(2,'0');
type CashAttempt=Readonly<{accountId:string;amountCents:number;correlationId:string}>;
const correlation=()=>`ui_cash_${crypto.randomUUID().replaceAll('-','_')}`;

export function CashView({gateway}:{gateway?:OrderOperationsGateway|null}){
 const [snapshot,setSnapshot]=useState<CashAccountSnapshot|null>(null);
 const [phase,setPhase]=useState<'idle'|'loading'|'ready'|'error'>(gateway?'loading':'idle');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [amount,setAmount]=useState('');
 const [acknowledged,setAcknowledged]=useState(false);
 const [refreshRequired,setRefreshRequired]=useState(false);
 const readEpoch=useRef(0);
 const pendingCash=useRef<CashAttempt|null>(null);
 const [pageAfter,setPageAfter]=useState<string|null>(null);
 const load=useCallback(async(after:string|null=null,append=false)=>{
  if(!gateway)return;
  const current=++readEpoch.current;
  setPhase('loading');
  try{
   const page=await gateway.listCashAccounts({after,limit:50});
   if(readEpoch.current!==current)return;
   setSnapshot(previous=>append&&previous?{...page,items:[...previous.items,...page.items]}:page);
   setPageAfter(page.nextAfter);
   setRefreshRequired(false);
   setPhase('ready');
   setMessage(null);
  }catch{
   if(readEpoch.current!==current)return;
   setPhase('error');
   setRefreshRequired(true);
   setMessage('No se ha podido leer el saldo confirmado. No se permite registrar efectivo a ciegas.');
  }
 },[gateway]);
 useEffect(()=>{
  void load();
  return()=>{readEpoch.current+=1;};
 },[load]);
 const chosen=snapshot?.items.find(a=>a.accountId===selectedId)??null;
 const select=(account:CashAccount)=>{
  setSelectedId(account.accountId);setAmount(eurosForInput(account.outstandingCents));
  setAcknowledged(false);setMessage(null);
 };
 const refresh=async()=>{setAcknowledged(false);await load();};
 const parsed=centsFromInput(amount);
 const canSettle=Boolean(chosen&&chosen.canSettle&&parsed!==null&&parsed<=chosen.outstandingCents&&
  acknowledged&&!busy&&!refreshRequired&&phase==='ready'&&
  (pendingCash.current===null||pendingCash.current.accountId===chosen.accountId&&
   pendingCash.current.amountCents===parsed));
 const settle=async()=>{
  if(!gateway||!chosen||!canSettle||parsed===null)return;
  const request=pendingCash.current??Object.freeze({accountId:chosen.accountId,
   amountCents:parsed,correlationId:correlation()});
  pendingCash.current=request;
  setBusy(true);setMessage(null);
  try{
   const result=await gateway.settleCash(request);
   if(typeof result.outstandingCents!=='number'||!Number.isSafeInteger(result.outstandingCents)||
      result.accountId!==request.accountId)throw Error('invalid_cash_receipt');
   pendingCash.current=null;
   setMessage('Cobro registrado por el servidor. La cuenta no se cierra automáticamente.');
   setAcknowledged(false);
   setRefreshRequired(true);
   await load();
  }catch{
   setRefreshRequired(true);
   setMessage('Resultado del registro incierto. No repitas con otra operación: conserva este intento y solicita conciliación.');
  }finally{setBusy(false);}
 };
 const retryPending=async()=>{
  if(!gateway||!pendingCash.current||busy)return;
  const request=pendingCash.current;
  setBusy(true);
  try{
   const result=await gateway.settleCash(request);
   if(result.accountId!==request.accountId||!Number.isSafeInteger(result.outstandingCents))
    throw Error('invalid_cash_receipt');
   pendingCash.current=null;
   setMessage('El intento anterior ha sido confirmado o recuperado sin crear otro cobro.');
   await load();
  }catch{
   setMessage('El intento sigue incierto; no se ha creado una nueva clave de cobro.');
  }finally{setBusy(false);}
 };
 const close=async()=>{
  if(!gateway||!chosen||chosen.state!=='open'||chosen.outstandingCents!==0||
     busy||refreshRequired||phase!=='ready'||pendingCash.current)return;
  setBusy(true);setMessage(null);
  try{
   await gateway.closeCashAccount({accountId:chosen.accountId,
    correlationId:'ui_close_'+crypto.randomUUID().replaceAll('-','_')});
   setMessage('Cierre económico registrado. La recogida de cocina no acredita una entrega física.');
   setSelectedId(null);await load();
  }catch{
   setRefreshRequired(true);
   setMessage('No está confirmado el cierre. Puede existir una incidencia, ronda o devolución pendiente; verificar antes de reintentar.');
  }finally{setBusy(false);}
 };
 if(!gateway)return <div className="view-stack"><PageHeader eyebrow="Sala" title="Caja por comensal"
  description="Cobros presenciales y cierre de cuentas individuales."/>
  <ConnectionNotice>La caja requiere autenticación de personal y un backend aislado con permisos mínimos.</ConnectionNotice></div>;
 return <div className="view-stack">
  <PageHeader eyebrow="Sala" title="Caja por comensal" description="Saldo individual confirmado; pago parcial, devolución presencial y cierre económico son operaciones diferentes."/>
  <section className="panel" aria-label="Estado de caja" aria-busy={phase==='loading'}>
   <div className="panel-heading"><h2>Cuentas abiertas</h2>
    <button type="button" className="button" disabled={busy||phase==='loading'} onClick={()=>void refresh()}>Actualizar saldos</button></div>
   {phase==='loading'&&!snapshot?<LoadingState title="Consultando cuentas" description="Comprobando los saldos autorizados del restaurante."/>:null}
   {phase==='error'?<ErrorState title="Lectura no disponible" description="No se puede cobrar sin saldo actualizado." onRetry={()=>void refresh()}/>:null}
   {phase!=='error'&&snapshot?.items.length===0?<EmptyState icon="tables" title="Sin cuentas pendientes" description="No hay cuentas abiertas en la lectura autorizada."/>:null}
   {snapshot?.items.length?<div className="cash-account-grid">{snapshot.items.map(account=><button
     type="button" key={account.accountId}
     className={selectedId===account.accountId?'cash-account-card cash-account-card--active':'cash-account-card'}
     onClick={()=>select(account)} disabled={busy}>
     <strong>Mesa {account.tableNumber} · {account.customerCode}</strong>
     <span>Saldo: {euro(account.outstandingCents)}</span>
     <small>Abonado en efectivo: {euro(account.cashSettledCents)}</small>
     {account.paymentUncertain?<StatusBadge tone="danger">Pago digital incierto: caja bloqueada</StatusBadge>:
       account.state==='blocked'?<StatusBadge tone="warning">Cuenta bloqueada</StatusBadge>:
       <StatusBadge tone={account.paymentMode==='pay_at_end'?'brand':'neutral'}>
        {account.paymentMode==='pay_at_end'?'Pagar al terminar':
        account.paymentMode==='pay_now'?'Pagar ahora':'Solo rondas gratuitas'}
       </StatusBadge>}
     {account.refundPending?<span>Devolución digital pendiente</span>:null}
    </button>)}</div>:null}
   {pageAfter&&phase==='ready'?<button type="button" className="button" disabled={busy}
    onClick={()=>void load(pageAfter,true)}>Mostrar más cuentas</button>:null}
  </section>
  {chosen?<section className="panel" aria-label="Operación de caja">
   <div className="panel-heading"><h2>Mesa {chosen.tableNumber} · {chosen.customerCode}</h2>
    <StatusBadge tone={chosen.paymentUncertain?'danger':'neutral'}>{chosen.state==='open'?'Cuenta abierta':'Cuenta bloqueada'}</StatusBadge></div>
   <p><strong>Deuda exigible: {euro(chosen.outstandingCents)}</strong></p>
   <p className="honest-operational-note">«Pagar al terminar» es una modalidad, no un cobro acreditado. Comprueba la entrega física del efectivo antes de registrarlo.</p>
   {chosen.canSettle?<div className="cash-capture-controls">
    <label>Importe recibido en efectivo (EUR)<input inputMode="decimal" autoComplete="off" value={amount}
      disabled={busy||Boolean(pendingCash.current)} onChange={event=>{setAmount(event.target.value);setAcknowledged(false);}}/></label>
    <label><input type="checkbox" checked={acknowledged} disabled={busy||Boolean(pendingCash.current)}
      onChange={event=>setAcknowledged(event.target.checked)}/> Confirmo que he recibido físicamente este importe.</label>
    <button type="button" className="button button--primary" disabled={!canSettle}
      onClick={()=>void settle()}>Registrar cobro en efectivo</button>
   </div>:<p className="honest-operational-note">No existe un cobro presencial habilitado para esta cuenta. La modalidad, el saldo o un pago pendiente lo impiden.</p>}
   {chosen.state==='open'&&chosen.outstandingCents===0?<div className="cash-close-controls">
    <p>El saldo es cero. El cierre requiere además que el servidor valide rondas, cocina, devoluciones e incidencias.</p>
    <button type="button" className="button" disabled={busy||refreshRequired||phase!=='ready'||Boolean(pendingCash.current)}
      onClick={()=>void close()}>Solicitar cierre de cuenta</button>
   </div>:null}
  </section>:null}
  <ThirdPartyCashDesk gateway={gateway}/>
  {message?<p className="honest-operational-note" role="status">{message}</p>:null}
  {pendingCash.current?<button type="button" className="button" disabled={busy}
    onClick={()=>void retryPending()}>Verificar de nuevo el mismo cobro (sin nueva clave)</button>:null}
  <p className="privacy-copy">No se liquidan deudas con autorizaciones Stripe inciertas; la pantalla no sustituye la conciliación del proveedor ni la revisión de caja.</p>
 </div>;
}
