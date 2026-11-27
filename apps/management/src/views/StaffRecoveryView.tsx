import React,{useRef,useState} from 'react';
import {EnrollmentError,type StaffRecoveryGateway} from '../staff-enrollment-gateway';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
type Invitation={intentId:string;token:string};
type State='invite'|'accepting'|'ready'|'registering'|'completed'|'invalid'|'unavailable'|'cancelling';
export function takeStaffRecoveryInvitation():Invitation|null{
  const hash=window.location.hash;
  window.history.replaceState(null,'',window.location.pathname+'#recuperacion-personal');
  if(!hash.startsWith('#recuperacion-personal?'))return null;
  const params=new URLSearchParams(hash.slice('#recuperacion-personal?'.length));
  if([...params.keys()].length!==2||!['intentId','token'].every(k=>params.getAll(k).length===1))return null;
  const intentId=params.get('intentId')??'',token=params.get('token')??'';
  return UUID.test(intentId)&&TOKEN.test(token)?{intentId:intentId.toLowerCase(),token}:null;
}
const supportsRegistration=()=>window.isSecureContext&&typeof PublicKeyCredential!=='undefined'&&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON==='function'&&typeof PublicKeyCredential.prototype.toJSON==='function';
export function StaffRecoveryView({invitation,gateway}:{invitation:Invitation|null;gateway:StaffRecoveryGateway}){
  const material=useRef(invitation),busy=useRef(false);
  const [state,setState]=useState<State>(invitation?'invite':'invalid');
  const [message,setMessage]=useState(invitation?'Recupera tu cuenta existente con una nueva passkey. No se creará otro usuario.':
    'Este enlace no es válido o ya se ha abierto. Solicita ayuda al administrador.');
  const update=(next:State,text:string)=>{setState(next);setMessage(text);};
  const fail=(error:unknown)=>update('unavailable',error instanceof EnrollmentError&&[401,403,409].includes(error.status)?
    'La invitación o la sesión ya no es válida. Solicita ayuda al administrador.':
    'No se pudo confirmar la recuperación. Contacta con el administrador antes de volver a intentarlo.');
  const accept=async()=>{
    if(busy.current||!material.current)return;
    if(!supportsRegistration()){update('invite','Abre el enlace en un navegador compatible con passkeys.');return;}
    busy.current=true;const payload=material.current;material.current=null;update('accepting','Comprobando la autorización.');
    try{
      const result=await gateway.request('accept',payload);
      if(result?.outcome!=='ready')throw new EnrollmentError(503);
      update('ready','Autorización verificada. Registra una nueva passkey. Las credenciales anteriores dejarán de autorizar el acceso.');
    }catch(error){fail(error);}finally{busy.current=false;}
  };
  const register=async()=>{
    if(busy.current||state!=='ready')return;
    busy.current=true;update('registering','Completa la verificación en tu dispositivo.');
    let submitted=false;
    try{
      const result=await gateway.request('options',{});
      if(result?.options?.rp?.id!==window.location.hostname||result.options?.authenticatorSelection?.userVerification!=='required'||
        typeof result.ticket!=='string')throw new EnrollmentError(503);
      const publicKey=PublicKeyCredential.parseCreationOptionsFromJSON(result.options);
      const credential=await navigator.credentials.create({publicKey});
      if(!(credential instanceof PublicKeyCredential))throw new DOMException('cancelled','NotAllowedError');
      submitted=true;
      const completed=await gateway.request('register',{ticket:result.ticket,credential:credential.toJSON()});
      if(completed?.outcome!=='completed')throw new EnrollmentError(503);
      update('completed','Recuperación completada. Vuelve al acceso e identifícate con tu nueva passkey.');
    }catch(error){
      if(!submitted&&error instanceof DOMException&&error.name==='NotAllowedError')update('ready','Se canceló el registro. Puedes volver a intentarlo.');
      else fail(error);
    }finally{busy.current=false;}
  };
  const exit=async()=>{
    if(busy.current)return;
    busy.current=true;material.current=null;update('cancelling','Saliendo de la recuperación.');
    try{await gateway.request('cancel',{});}catch{/* salida local, no confirma revocación */}
    window.location.replace(window.location.pathname);
  };
  const loading=['accepting','registering','cancelling'].includes(state);
  return <main className="management-shell">
    <section className="management-detail" aria-labelledby="staff-recovery-heading" aria-busy={loading}>
      <h1 id="staff-recovery-heading">Recuperar acceso a Sabora Gestión</h1>
      <p role={state==='unavailable'||state==='invalid'?'alert':'status'}>{message}</p>
      {state==='invite'&&<button type="button" className="button button--primary" onClick={()=>void accept()}>Aceptar recuperación</button>}
      {state==='ready'&&<button type="button" className="button button--primary" onClick={()=>void register()}>Registrar nueva passkey</button>}
      <button type="button" className="button" disabled={loading} onClick={()=>void exit()}>
        {state==='completed'?'Volver al acceso':'Salir de la recuperación'}
      </button>
    </section>
  </main>;
}
