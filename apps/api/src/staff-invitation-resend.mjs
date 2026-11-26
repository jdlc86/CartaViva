import {normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';

const RESEND_EMAILS='https://api.resend.com/emails';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^re_[A-Za-z0-9_-]{10,150}$/;
const REJECTED=new Set([400,401,403,422]);

// The runtime must supply the dedicated, outbound TLS transport. This
// adapter has no fallback transport and performs a single provider call.
function createStaffResendTransport({apiKey,from,managementOrigin,fetchImpl}){
 const origin=new URL(managementOrigin);
 if(origin.protocol!=='https:'||origin.origin!==managementOrigin||
    typeof apiKey!=='string'||!KEY.test(apiKey)||typeof fetchImpl!=='function')
  throw Error('invalid_staff_resend_configuration');
 const sender=normalizeStaffInviteeEmail(from);
 return async function send({jobId,recipient,kind,subject,text}){
  const recipientEmail=normalizeStaffInviteeEmail(recipient);
  if(!UUID.test(jobId??'')||!['invitation','root-recovery'].includes(kind))throw Error('invalid_staff_resend_delivery');
  try {
   const response=await fetchImpl(RESEND_EMAILS,{method:'POST',redirect:'error',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',
     'Idempotency-Key':'sabora-staff-'+kind+'/'+jobId.toLowerCase()},
    signal:AbortSignal.timeout(10_000),
    body:JSON.stringify({from:'Sabora Gestión <'+sender+'>',to:[recipientEmail],
     subject,text})
   });
   if(REJECTED.has(response.status))return Object.freeze({outcome:'permanent_failure'});
   if(response.ok){
    const result=await response.json();
    if(typeof result?.id==='string'&&UUID.test(result.id))
     return Object.freeze({outcome:'accepted',providerId:result.id});
   }
  } catch {
   // A timeout or lost response may have occurred after provider acceptance.
  }
  return Object.freeze({outcome:'unknown'});
 };
}

export function createStaffInvitationResendSender(config){
 const send=createStaffResendTransport(config);
 return async ({jobId,recipient,enrollmentUrl})=>{
  const url=new URL(enrollmentUrl);
  if(url.origin!==config.managementOrigin||url.username||url.password||url.pathname!=='/'||
   url.search||!url.hash.startsWith('#enrolamiento?')||url.href.length>4096)
   throw Error('invalid_staff_resend_delivery');
  return send({jobId,recipient,kind:'invitation',subject:'Invitación a Sabora Gestión',
   text:'Abre este enlace para iniciar el enrolamiento de tu cuenta de personal:\n\n'+url.href});
 };
}
export function createRootRecoveryResendSender(config){
 const send=createStaffResendTransport(config);
 return async ({jobId,recipient,purpose,token})=>{
  if(purpose==='recovered'){
   if(token!==null)throw Error('invalid_root_recovery_delivery');
   return send({jobId,recipient,kind:'root-recovery',subject:'Recuperación ROOT completada en Sabora',
    text:'Se ha completado una recuperación de ROOT. Las credenciales anteriores ya no autorizan el acceso a Sabora. Si no reconoces esta operación, revisa la seguridad de tu cuenta.'});
  }
  if(purpose==='notice'){
   if(token!==null)throw Error('invalid_root_recovery_delivery');
   return send({jobId,recipient,kind:'root-recovery',subject:'Cambio de correo de seguridad de Sabora',
    text:'Se ha confirmado un cambio del correo de recuperación ROOT. Si no lo reconoces, utiliza una passkey vigente para revisar la seguridad de tu cuenta.'});
  }
  if(!['verify','link','challenge'].includes(purpose)||typeof token!=='string'||
   !/^[A-Za-z0-9_-]{43}$/.test(token)||Buffer.from(token,'base64url').toString('base64url')!==token)
   throw Error('invalid_root_recovery_delivery');
  const url=new URL(config.managementOrigin);
  url.hash='recuperacion-root?'+new URLSearchParams({purpose,token}).toString();
  const message={
   verify:['Confirma el correo de seguridad de Sabora','Confirma este destinatario desde tu sesión ROOT. Abrir el enlace no modifica la cuenta.'],
   link:['Recuperación ROOT de Sabora','Este enlace solo permite iniciar la recuperación. No concede acceso. Necesitarás una nueva comprobación del correo y tu código secreto independiente.'],
   challenge:['Verificación de recuperación ROOT','Este desafío caduca en diez minutos. Solo sirve junto con tu código secreto independiente.']
  }[purpose];
  return send({jobId,recipient,kind:'root-recovery',subject:message[0],text:message[1]+'\n\n'+url.href});
 };
}
