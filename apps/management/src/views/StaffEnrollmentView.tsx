import React,{useRef,useState} from 'react';

const ROOT='/api/v1/staff/enrollment';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{32,512}$/;
type Invitation={enrollmentId:string;inviteToken:string;authProof:string};
type State='invite'|'ready'|'accepting'|'registering'|'registered'|'unavailable'|'invalid'|'cancelling';
export function takeStaffEnrollmentInvitation():Invitation|null {
  const hash=window.location.hash;
  // Consume the fragment before rendering, never copy secrets to storage,
  // a query string, DOM, logs or navigation history.
  window.history.replaceState(null,'',window.location.pathname+'#enrolamiento');
  if(!hash.startsWith('#enrolamiento?'))return null;
  const params=new URLSearchParams(hash.slice('#enrolamiento?'.length));
  if([...params.keys()].length!==3||!['enrollmentId','token','proof'].every(k=>params.getAll(k).length===1))return null;
  const enrollmentId=params.get('enrollmentId')??'',inviteToken=params.get('token')??'',authProof=params.get('proof')??'';
  return UUID.test(enrollmentId)&&TOKEN.test(inviteToken)&&TOKEN.test(authProof)
    ?{enrollmentId:enrollmentId.toLowerCase(),inviteToken,authProof}:null;
}
class EnrollmentError extends Error{
  constructor(readonly status:number){super('staff_enrollment_failed');}
}
async function request(action:string,body:unknown){
  const response=await fetch(ROOT+'/'+action,{method:'POST',credentials:'same-origin',
    cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new EnrollmentError(response.status);
  return response.status===204?null:response.json();
}
const supportsRegistration=()=>window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON==='function'&&
  typeof PublicKeyCredential.prototype.toJSON==='function';

export function StaffEnrollmentView({invitation}:{invitation:Invitation|null}){
  const material=useRef(invitation);
  const current=useRef<string|null>(null);
  const busy=useRef(false);
  const [state,setState]=useState<State>(invitation?'invite':'invalid');
  const [message,setMessage]=useState(invitation
    ?'Acepta la invitación para registrar tu passkey. El acceso requiere activación del administrador.'
    :'Este enlace no es válido o ya se ha abierto. Solicita ayuda al administrador.');
  const update=(next:State,text:string)=>{setState(next);setMessage(text);};
  const fail=(error:unknown)=>{
    update('unavailable',error instanceof EnrollmentError&&[401,403,409].includes(error.status)
      ?'La invitación o la sesión ya no es válida. Contacta con el administrador.'
      :'No se pudo confirmar la operación. Contacta con el administrador antes de volver a intentarlo.');
  };
  const accept=async()=>{
    if(busy.current||!material.current)return;
    if(!supportsRegistration()){
      update('invite','Abre la invitación en un navegador compatible con passkeys.');
      return;
    }
    busy.current=true;
    const payload=material.current;material.current=null;
    update('accepting','Comprobando la invitación.');
    try{
      const result=await request('accept',{...payload,correlationId:crypto.randomUUID()});
      if(result?.enrollmentId!==payload.enrollmentId||result?.state!=='accepted')throw new EnrollmentError(503);
      current.current=result.enrollmentId;
      update('ready','Invitación aceptada. Registra la passkey de este dispositivo.');
    }catch(error){fail(error);}finally{busy.current=false;}
  };
  const register=async()=>{
    if(busy.current||!current.current)return;
    busy.current=true;
    update('registering','Completa la verificación en tu dispositivo.');
    let submitted=false;
    try{
      const result=await request('options',{});
      if(result?.options?.rp?.id!==window.location.hostname||
        result.options?.authenticatorSelection?.userVerification!=='required'||
        typeof result.ticket!=='string')throw new EnrollmentError(503);
      const publicKey=PublicKeyCredential.parseCreationOptionsFromJSON(result.options);
      const credential=await navigator.credentials.create({publicKey});
      if(!(credential instanceof PublicKeyCredential))throw new DOMException('cancelled','NotAllowedError');
      submitted=true;
      const registered=await request('register',{ticket:result.ticket,credential:credential.toJSON(),
        correlationId:crypto.randomUUID()});
      if(registered?.enrollmentId!==current.current||registered?.state!=='registered')throw new EnrollmentError(503);
      current.current=null;
      update('registered','Passkey registrada. Tu cuenta está pendiente de activación administrativa.');
    }catch(error){
      if(!submitted&&error instanceof DOMException&&error.name==='NotAllowedError'){
        update('ready','Se canceló el registro. Puedes volver a intentarlo.');
      }else{fail(error);}
    }finally{busy.current=false;}
  };
  const exit=async()=>{
    if(busy.current)return;
    busy.current=true;material.current=null;current.current=null;
    update('cancelling','Cerrando el enrolamiento.');
    try{await request('cancel',{});}catch{
      // The local screen is left, not a claim of remote logout or revocation.
    }
    window.location.replace(window.location.pathname);
  };
  const loading=state==='accepting'||state==='registering'||state==='cancelling';
  return <main className="management-shell">
    <section className="management-detail" aria-labelledby="staff-enrollment-heading" aria-busy={loading}>
      <h1 id="staff-enrollment-heading">Alta de personal en Sabora Gestión</h1>
      <p role={state==='unavailable'||state==='invalid'?'alert':'status'}>{message}</p>
      {state==='invite'&&<button type="button" className="button button--primary" onClick={()=>void accept()}>Aceptar invitación</button>}
      {state==='ready'&&<button type="button" className="button button--primary" onClick={()=>void register()}>Registrar passkey</button>}
      <button type="button" className="button" disabled={loading} onClick={()=>void exit()}>
        {state==='registered'?'Volver al acceso':'Salir del enrolamiento'}
      </button>
    </section>
  </main>;
}
