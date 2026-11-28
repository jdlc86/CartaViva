import {useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {StaffRecoveryAdminGateway,RecoveryClassification} from '../staff-recovery-admin-gateway';
import {EnrollmentError} from '../staff-enrollment-gateway';

export function StaffRecoveryAdminPanel({gateway}:{gateway:StaffRecoveryAdminGateway}){
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false);
 const [match,setMatch]=useState<Extract<RecoveryClassification,{outcome:'recoverable'}>|null>(null);
 const [confirm,setConfirm]=useState(false),[notice,setNotice]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const attempt=useRef<{email:string;enrollmentId:string;requestId:string}|null>(null),pending=useRef(false);
 const invalidate=()=>{setMatch(null);setConfirm(false);setNotice(null);setError(null);};
 const classify=async(event:FormEvent)=>{
  event.preventDefault();if(pending.current)return;
  pending.current=true;setBusy(true);invalidate();
  try{
   const result=await gateway.classify(email.trim());
   if(result.outcome==='recoverable')setMatch(result);
   else setNotice('No corresponde a una recuperación de una cuenta existente. Comprueba el correo o usa el alta o reenvío ordinario si procede.');
  }catch(e){setError(e instanceof EnrollmentError&&e.status===403?'No se autoriza la recuperación de esta cuenta.':'No se pudo comprobar la cuenta.');}
  finally{pending.current=false;setBusy(false);}
 };
 const authorize=async()=>{
  if(pending.current||!match||!confirm)return;
  pending.current=true;setBusy(true);setError(null);setNotice(null);
  const target=email.trim(),previous=attempt.current;
  const request=previous?.email===target&&previous.enrollmentId===match.enrollmentId?previous:
   {email:target,enrollmentId:match.enrollmentId,requestId:crypto.randomUUID()};
  attempt.current=request;
  try{
   const result=await gateway.authorize(request.email,request.enrollmentId,request.requestId);
   attempt.current=null;setMatch(null);setConfirm(false);
   setNotice('Invitación de recuperación en cola. Entrega aún no confirmada. Vigencia hasta '+new Date(result.expiresAt).toLocaleString('es-ES')+'.');
  }catch(e){
   if(e instanceof EnrollmentError&&[400,403,409].includes(e.status)){
    attempt.current=null;setMatch(null);setConfirm(false);
    setError('La autorización ya no es válida. Comprueba la cuenta de nuevo.');
   }else setError('No se pudo confirmar el encolado. Si repites la misma autorización se conservará el identificador de la solicitud.');
  }finally{pending.current=false;setBusy(false);}
 };
 return <section className="panel staff-enrollment" aria-labelledby="staff-recovery-admin-title">
  <div className="panel-heading"><div><span className="eyebrow">Seguridad del equipo</span><h2 id="staff-recovery-admin-title">Recuperar acceso del personal</h2></div></div>
  <p>Autoriza una invitación para recuperar una cuenta existente. No crea usuarios ni cambia roles o titularidad.</p>
  <form className="view-stack" onSubmit={event=>void classify(event)}>
   <label htmlFor="staff-recovery-target-email">Correo de la cuenta existente</label>
   <input id="staff-recovery-target-email" type="email" autoComplete="off" maxLength={254} required disabled={busy}
    value={email} onChange={event=>{setEmail(event.target.value);invalidate();}}/>
   <button className="button button--secondary" type="submit" disabled={busy||!email.trim()}>Comprobar cuenta</button>
  </form>
  {match?<div className="view-stack">
   <p role="status">Cuenta recuperable. Estado: {match.state==='active'?'activo':'suspendido'}.</p>
   <label className="confirmation-check"><input type="checkbox" checked={confirm} disabled={busy} onChange={event=>setConfirm(event.target.checked)}/>
    <span>Confirmo la recuperación de esta cuenta. Las credenciales anteriores se revocarán al registrar la nueva passkey.</span></label>
   <button className="button button--primary" type="button" disabled={busy||!confirm} onClick={()=>void authorize()}>Autorizar recuperación</button>
  </div>:null}
  {notice?<p role="status">{notice}</p>:null}
  {error?<p role="alert" className="field-error">{error}</p>:null}
 </section>;
}
