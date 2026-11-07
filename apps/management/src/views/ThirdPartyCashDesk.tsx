import {useCallback,useEffect,useRef,useState} from 'react';
import type {OrderOperationsGateway} from '../order-operations-gateway.js';

type Intent=Readonly<{intentId:string;payerCode:string;totalCents:number;
 rounds:readonly Readonly<{roundId:string;accountId:string;amountCents:number}>[];createdAt:string}>;
type CashAttempt=Readonly<{intentId:string;correlationId:string}>;
type RefundAttempt=Readonly<{incidentId:string;claimId:string;proof:string;correlationId:string}>;
const euro=(cents:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(cents/100);
const correlation=()=>`tp_staff_${crypto.randomUUID().replaceAll('-','_')}`;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROOF=/^[0-9a-f]{64}$/;

export function ThirdPartyCashDesk({gateway}:{gateway:OrderOperationsGateway}){
 const [intents,setIntents]=useState<readonly Intent[]>([]);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading');
 const [busy,setBusy]=useState(false);
 const [receipt,setReceipt]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const [incidentId,setIncidentId]=useState('');
 const [claimId,setClaimId]=useState('');
 const [proof,setProof]=useState('');
 const [refunded,setRefunded]=useState(false);
 const cashPending=useRef<CashAttempt|null>(null);
 const refundPending=useRef<RefundAttempt|null>(null);
 const load=useCallback(async()=>{
  setPhase('loading');setMessage(null);
  try{setIntents((await gateway.listThirdPartyCashPending()).items);setPhase('ready');}
  catch{setPhase('error');setMessage('Las intenciones de terceros no están verificadas. Cobro bloqueado.');}
 },[gateway]);
 useEffect(()=>{void load();},[load]);
 const chosen=intents.find(x=>x.intentId===selected)??null;
 const settle=async()=>{
  if(!chosen||!receipt||busy||phase!=='ready')return;
  const request=cashPending.current??{intentId:chosen.intentId,correlationId:correlation()};
  if(request.intentId!==chosen.intentId)return;
  cashPending.current=request;setBusy(true);setMessage(null);
  try{
   const result=await gateway.settleThirdPartyCash(request);
   if(result.intentId!==chosen.intentId||result.state!=='paid')
    throw Error('unverified_cash_receipt');
   cashPending.current=null;setReceipt(false);setSelected(null);
   setMessage('Cobro presencial confirmado en el servidor: importes aplicados a sus cuentas beneficiarias.');
   await load();
  }catch{setMessage('Resultado incierto. Conserva el intento; reintenta exactamente la misma operación tras conciliar.');}
  finally{setBusy(false);}
 };
 const refund=async()=>{
  const available=UUID.test(incidentId)&&UUID.test(claimId)&&PROOF.test(proof);
  if(!available||!refunded||busy)return;
  const request=refundPending.current??{incidentId,claimId,proof,correlationId:correlation()};
  if(request.incidentId!==incidentId||request.claimId!==claimId||request.proof!==proof)return;
  refundPending.current=request;setBusy(true);setMessage(null);
  try{
   const result=await gateway.refundThirdPartyCash(request);
   if(result.incidentId!==incidentId||result.state!=='resolved')
    throw Error('unverified_original_payer_refund');
   refundPending.current=null;setIncidentId('');setClaimId('');setProof('');setRefunded(false);
   setMessage('Devolución presencial registrada contra la prueba del pagador original.');
  }catch{setMessage('No está confirmado el reintegro. No vuelvas a entregar efectivo sin conciliar el mismo intento.');}
  finally{setBusy(false);}
 };
 return <section className="panel" aria-label="Cobros y devoluciones de terceros">
  <div className="panel-heading"><h2>Pagos de terceros · caja presencial</h2>
   <button className="button" type="button" disabled={busy||phase==='loading'}
    onClick={()=>void load()}>Actualizar solicitudes</button>
  </div>
  <p className="honest-operational-note">Solo se registran deudas que el pagador seleccionó y autorizó en su sesión. El personal debe recibir físicamente el importe antes de confirmarlo; una intención no es un cobro.</p>
  {phase==='error'?<p role="alert">Lectura no disponible. No se puede cobrar a ciegas.</p>:null}
  {phase==='ready'&&!intents.length?<p>Sin solicitudes pendientes de cobro por terceros.</p>:null}
  {phase==='ready'?<div className="cash-account-grid">
   {intents.map(intent=><button type="button" key={intent.intentId}
    className={intent.intentId===selected?'cash-account-card cash-account-card--active':'cash-account-card'}
    disabled={busy||(cashPending.current!==null&&cashPending.current.intentId!==intent.intentId)}
    onClick={()=>{setSelected(intent.intentId);setReceipt(false);}}>
    <strong>{intent.payerCode} · {euro(intent.totalCents)}</strong>
    <small>{intent.rounds.length} consumiciones asignadas · solicitud {intent.intentId}</small>
   </button>)}
  </div>:null}
  {chosen?<div className="cash-capture-controls">
   <p>Pagador: <strong>{chosen.payerCode}</strong></p>
   <p>Importe exacto autorizado: <strong>{euro(chosen.totalCents)}</strong></p>
   <ul>{chosen.rounds.map(x=><li key={x.roundId}>{euro(x.amountCents)} · cuenta {x.accountId}</li>)}</ul>
   <label><input type="checkbox" checked={receipt} disabled={busy}
    onChange={event=>setReceipt(event.target.checked)}/>
    Confirmo que he recibido físicamente del pagador el importe completo seleccionado.</label>
   <button type="button" className="button button--primary"
    disabled={busy||!receipt||phase!=='ready'}
    onClick={()=>void settle()}>{cashPending.current?'Reconciliar el mismo cobro':'Registrar cobro recibido'}</button>
  </div>:null}
  <div className="cash-close-controls">
   <h3>Devolución presencial al pagador original</h3>
   <p className="honest-operational-note">El pagador debe generar la prueba desde su propia sesión. No basta mostrar el QR de una mesa o la cuenta beneficiaria. Esta acción certifica una entrega física que debe realizar el personal.</p>
   <label>Identificador de incidencia<input value={incidentId} disabled={busy||Boolean(refundPending.current)}
    autoComplete="off" onChange={e=>setIncidentId(e.target.value.trim())}/></label>
   <label>Identificador de prueba del pagador<input value={claimId} disabled={busy||Boolean(refundPending.current)}
    autoComplete="off" onChange={e=>setClaimId(e.target.value.trim())}/></label>
   <label>Código temporal del pagador<input value={proof} disabled={busy||Boolean(refundPending.current)}
    autoComplete="off" onChange={e=>setProof(e.target.value.trim())}/></label>
   <label><input type="checkbox" checked={refunded} disabled={busy}
    onChange={e=>setRefunded(e.target.checked)}/>
    Confirmo que he entregado físicamente el importe debido a quien ha presentado la prueba vigente.</label>
   <button className="button button--primary" type="button"
    disabled={busy||!refunded||!UUID.test(incidentId)||!UUID.test(claimId)||!PROOF.test(proof)}
    onClick={()=>void refund()}>{refundPending.current?'Verificar la misma devolución':'Registrar devolución presencial'}</button>
  </div>
  {message?<p role="status" className="honest-operational-note">{message}</p>:null}
  <p className="privacy-copy">Ningún pago ni devolución se confirma por una captura de pantalla o un resultado no verificado. Las operaciones quedan vinculadas al identificador de pagador y su prueba original.</p>
 </section>;
}
