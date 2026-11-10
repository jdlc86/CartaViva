import {useCallback,useEffect,useRef,useState} from 'react';
import type {OwnershipGovernanceGateway,OwnershipAction,OwnershipProjection,OwnershipEligibleAdmin} from '../ownership-governance-gateway.js';
import {ConnectionNotice} from '../components/Primitives';

const identified=(entry:OwnershipEligibleAdmin)=>Boolean(entry.givenName?.trim()&&
 entry.familyName?.trim()&&entry.operationalDisplayId?.trim());
// Administrative eligibility is determined by durable staff membership. Do not
// require a newer enrollment record from an existing, active ADMIN.
const identityText=(entry:OwnershipEligibleAdmin)=>identified(entry)
 ? entry.givenName+' '+entry.familyName+' · '+entry.operationalDisplayId
 : 'ADMIN activo sin ficha operativa · ID completo '+entry.userId;
const message=(code:string)=>code==='forbidden'?
 'No tienes la titularidad vigente o permisos para esta acción. Consulta el estado actualizado.':
 code==='ownership_conflict'?
 'Esta solicitud ya no coincide con la titularidad actual. Consulta el estado antes de continuar.':
 'No se ha confirmado el resultado. Actualiza el estado y reintenta con la misma referencia si procede.';
type Intent={action:OwnershipAction;proposalId:string|null;targetUserId:string|null;
 reason:string|null;requestId:string};

export function OwnershipPanel({gateway,onOwnershipChanged}:{gateway?:OwnershipGovernanceGateway;onOwnershipChanged?:()=>void}){
 const [snapshot,setSnapshot]=useState<OwnershipProjection|null>(null);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
 const [target,setTarget]=useState(''),[reason,setReason]=useState('');
 const [retry,setRetry]=useState<Intent|null>(null);
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++generation.current;
  setLoading(true);setError(null);
  if(!gateway){setSnapshot(null);setLoading(false);return;}
  try{const next=await gateway.read();
   if(id!==generation.current)return;
   if(!next||!Array.isArray(next.eligibleAdmins)||!Array.isArray(next.proposals)||
      !Array.isArray(next.notifications)||!next.actorUserId||
       !next.eligibleAdmins.every(e=>e&&typeof e.userId==='string'&&
        (e.givenName===null||typeof e.givenName==='string')&&
        (e.familyName===null||typeof e.familyName==='string')&&
        (e.operationalDisplayId===null||typeof e.operationalDisplayId==='string')))
      throw Error('bad_projection');
   setSnapshot(next);
  }catch{if(id===generation.current){setSnapshot(null);
   setError('No se pudo comprobar la titularidad actual; no se permiten decisiones.');}}
  finally{if(id===generation.current)setLoading(false);}
 },[gateway]);
 useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh]);

 const perform=async(action:OwnershipAction,proposalId:string|null=null)=>{
  if(!gateway||!snapshot||busy)return;
  const targetUserId=['offer','force'].includes(action)?target:null;
  const operationReason=action==='force'?reason.trim():null;
  const unchanged=retry?.action===action&&retry.proposalId===proposalId&&
   retry.targetUserId===targetUserId&&retry.reason===operationReason;
  const intent:Intent=unchanged&&retry?retry:{action,proposalId,targetUserId,
   reason:operationReason,requestId:crypto.randomUUID()};
  setRetry(intent);setBusy(true);setError(null);setNotice(null);
  try{
   const result=await gateway.transition(intent);
   setRetry(null);setTarget('');setReason('');
   setNotice(result.replayed?'La operación ya estaba registrada.':
    'La decisión se ha registrado con auditoría.');
   await refresh();
   onOwnershipChanged?.();
  }catch(failure){
   const code=failure&&typeof failure==='object'&&'code'in failure?
    String((failure as {code:unknown}).code):'unavailable';
   setError(message(code));
  }finally{setBusy(false);}
 };
 const identityLabel=(id:string|null)=>{
    if(!id)return 'Sin titular';
    const person=snapshot?.eligibleAdmins.find(e=>e.userId===id);
    return person?identityText(person):'Identidad no disponible';
  };
  const isOwner=snapshot?.role==='admin'&&snapshot.isOwner;
  const selectable=snapshot?.eligibleAdmins.filter(e=>
    e.userId!==snapshot.ownerUserId)??[];
 return <section className="panel" aria-labelledby="ownership-title">
  <div className="panel-heading"><div><span className="eyebrow">Gobierno de accesos</span>
   <h2 id="ownership-title">Titularidad de escritura</h2></div></div>
  <p>Solo un ADMIN activo puede modificar la configuración del restaurante. ROOT recupera o reasigna la titularidad con motivo auditado, sin convertirse en escritor ordinario.</p>
  {!gateway?<ConnectionNotice>Necesitas una sesión verificada y el canal de titularidad activado expresamente para gestionar estos permisos.</ConnectionNotice>:null}
  {gateway?<div className="view-stack">
   <p role="status">{loading?'Comprobando titularidad…':
    snapshot?'Titular: '+identityLabel(snapshot.ownerUserId)+(snapshot.isOwner?' (tu cuenta)':''):
     'No existe titularidad comprobada.'}</p>
   <button type="button" disabled={busy} onClick={()=>void refresh()}>Actualizar estado y avisos</button>
   {error?<p className="field-error" role="alert">{error}</p>:null}
   {notice?<p role="status">{notice}</p>:null}
   {snapshot&&!loading?<>
    {snapshot.role==='admin'&&!isOwner&&snapshot.ownerUserId?
     <button type="button" disabled={busy} onClick={()=>void perform('request')}>
      Solicitar titularidad</button>:null}
    {(isOwner||snapshot.role==='root')?<div className="view-stack">
     <label>{snapshot.role==='root'?'ADMIN destinatario de reasignación':'ADMIN destinatario de cesión'}
      <select value={target} onChange={e=>{setTarget(e.target.value);setRetry(null);}}>
       <option value="">Selecciona un ADMIN activo</option>
       {selectable.map(person=><option key={person.userId} value={person.userId}>
        {identityLabel(person.userId)}</option>)}
      </select>
     </label>
     {selectable.some(person=>!identified(person))?
      <p className="field-help">Los ADMIN activos sin ficha operativa se muestran con su identificador completo facilitado por el servidor. Comprueba el destinatario antes de continuar.</p>:null}
     {selectable.length===0?<p role="status">No hay otros ADMIN activos elegibles para esta decisión.</p>:null}
      {snapshot.role==='root'?<label>Motivo obligatorio
      <textarea value={reason} maxLength={1000} required
       onChange={e=>{setReason(e.target.value);setRetry(null);}}/>
     </label>:null}
     <button type="button" disabled={busy||!selectable.some(person=>person.userId===target)||
      (snapshot.role==='root'&&!reason.trim())}
      onClick={()=>void perform(snapshot.role==='root'?'force':'offer')}>
      {snapshot.role==='root'?'Reasignar forzosamente':'Ofrecer cesión'}</button>
    </div>:null}
    <div className="view-stack"><h3>Solicitudes y ofertas pendientes</h3>
     {snapshot.proposals.length===0?<p>Sin propuestas pendientes.</p>:
      snapshot.proposals.map(p=>{
       const decider=p.kind==='request'?p.fromOwnerId:p.toOwnerId;
       const canDecide=snapshot.role==='admin'&&decider===snapshot.actorUserId;
       const canCancel=snapshot.role==='admin'&&
        (p.kind==='request'?p.toOwnerId:p.fromOwnerId)===snapshot.actorUserId;
       return <div key={p.id} className="panel">
        <p><strong>{p.kind==='request'?'Solicitud':'Oferta'}</strong>:
         {identityLabel(p.fromOwnerId)} → {identityLabel(p.toOwnerId)}</p>
        {canDecide?<>
         <button type="button" disabled={busy} onClick={()=>void perform('accept',p.id)}>Aceptar</button>
         <button type="button" disabled={busy} onClick={()=>void perform('reject',p.id)}>Rechazar</button>
        </>:null}
        {canCancel?<button type="button" disabled={busy} onClick={()=>void perform('cancel',p.id)}>Cancelar</button>:null}
       </div>;
      })}
    </div>
    <div className="view-stack"><h3>Avisos de titularidad</h3>
     {snapshot.notifications.length===0?<p>Sin avisos.</p>:
      snapshot.notifications.map(n=><p key={n.id}>{n.action}:
       {identityLabel(n.previousOwnerId)} → {identityLabel(n.nextOwnerId)}</p>)}
    </div>
   </>:null}
  </div>:null}
 </section>;
}
