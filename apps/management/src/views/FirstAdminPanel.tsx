import {useCallback,useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {StaffFirstAdminGateway,FirstAdminState} from '../staff-management-gateway.js';

const label={invited:'Invitación pendiente',accepted:'Invitación aceptada',registered:'Passkey registrada',active:'Acceso activado'} as const;
export function FirstAdminPanel({gateway,revision,onActivated}:{gateway:StaffFirstAdminGateway;revision:number;onActivated:()=>void}){
 const [snapshot,setSnapshot]=useState<FirstAdminState|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [givenName,setGivenName]=useState(''),[familyName,setFamilyName]=useState(''),[email,setEmail]=useState(''),[reason,setReason]=useState('');
 const [error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
 const epoch=useRef(0),attempt=useRef<{intent:string;correlationId:string}|null>(null);
 const refresh=useCallback(async()=>{
  const current=++epoch.current;setLoading(true);setSnapshot(null);setError(null);
  try{const result=await gateway.read();if(current===epoch.current)setSnapshot(result);}
  catch{if(current===epoch.current)setError('No se pudo verificar el arranque. No se permiten cambios.');}
  finally{if(current===epoch.current)setLoading(false);}
 },[gateway]);
 useEffect(()=>{void refresh();return()=>{epoch.current++;};},[refresh,revision]);
 const perform=async(action:'invite'|'resend'|'activate'|'revoke',event?:FormEvent)=>{
  event?.preventDefault();if(busy||loading||!snapshot)return;
  const member=snapshot.member;
  if(action==='invite'?snapshot.phase!=='empty':!member)return;
  if(action==='revoke'&&!reason.trim())return;
  const intent=JSON.stringify(action==='invite'?{action,givenName,familyName,email}:{action,id:member?.enrollmentId,reason:action==='revoke'?reason.trim():null});
  const current=attempt.current?.intent===intent?attempt.current:{intent,correlationId:crypto.randomUUID().replaceAll('-','_')};
  attempt.current=current;setBusy(true);setError(null);setNotice(null);
  try{
   if(action==='invite')await gateway.invite({givenName,familyName,email,correlationId:current.correlationId});
   else if(member){
    const input={enrollmentId:member.enrollmentId,correlationId:current.correlationId};
    if(action==='resend')await gateway.resendInvitation(input);
    else if(action==='activate')await gateway.activateAccess(input);
    else await gateway.revokeAccess({...input,reason});
   }
   attempt.current=null;setReason('');
   if(action==='invite'){setGivenName('');setFamilyName('');setEmail('');}
   setNotice(action==='invite'||action==='resend'?'Invitación en cola. Entrega no confirmada.':action==='activate'?'Acceso activado. Asigna la titularidad en el panel de gobierno.':'Acceso revocado.');
   await refresh();if(action==='activate'||action==='revoke')onActivated();
  }catch{await refresh();setError('La operación no quedó confirmada. Comprueba el estado antes de repetirla.');}
  finally{setBusy(false);}
 };
 return <section className="panel staff-enrollment" aria-labelledby="first-admin-title">
  <div className="panel-heading"><div><span className="eyebrow">Arranque excepcional</span><h2 id="first-admin-title">Primer ADMIN</h2></div></div>
  <p>ROOT solo puede incorporar al primer ADMIN antes de asignar la titularidad. Después, esta excepción queda cerrada.</p>
  <button type="button" className="filter-button" disabled={busy||loading} onClick={()=>void refresh()}>Actualizar arranque</button>
  {loading?<p role="status">Comprobando arranque…</p>:null}
  {error?<p role="alert" className="field-error">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  {!loading&&snapshot?.phase==='closed'?<p role="status">Arranque cerrado. La gestión ordinaria corresponde al ADMIN titular.</p>:null}
  {!loading&&snapshot?.phase==='blocked'?<p role="alert">El estado de arranque no permite una nueva invitación. Revisa la incidencia sin modificar el personal.</p>:null}
  {!loading&&snapshot?.phase==='empty'?<form className="staff-enrollment__form" onSubmit={e=>void perform('invite',e)}>
   <label>Nombre<input required maxLength={80} value={givenName} onChange={e=>setGivenName(e.target.value)} disabled={busy}/></label>
   <label>Apellidos<input required maxLength={160} value={familyName} onChange={e=>setFamilyName(e.target.value)} disabled={busy}/></label>
   <label>Correo de invitación<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
   <button className="button button--primary" disabled={busy} type="submit">Invitar primer ADMIN</button>
  </form>:null}
  {!loading&&snapshot?.phase==='current'?<div className="view-stack">
   <div className="staff-directory-detail"><h3>{snapshot.member.givenName} {snapshot.member.familyName}</h3>
    <p>{snapshot.member.email} · {snapshot.member.operationalDisplayId}</p><p role="status">{label[snapshot.member.state]}</p></div>
   {snapshot.member.state==='invited'?<button className="button button--secondary" disabled={busy} type="button" onClick={()=>void perform('resend')}>Reenviar invitación</button>:null}
   {snapshot.member.state==='registered'?<button className="button button--primary" disabled={busy} type="button" onClick={()=>void perform('activate')}>Activar acceso</button>:null}
   {snapshot.member.state==='active'?<p>Usa el panel Titularidad de escritura para asignar el ADMIN activo.</p>:null}
   <form onSubmit={e=>void perform('revoke',e)}><label>Motivo de revocación<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
    <button type="submit" className="button button--danger" disabled={busy||!reason.trim()}>Revocar acceso</button></form>
  </div>:null}
 </section>;
}
