import {normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';

const RESEND_EMAILS='https://api.resend.com/emails';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^re_[A-Za-z0-9_-]{10,150}$/;
const REJECTED=new Set([400,401,403,422]);

// The runtime must supply the dedicated, outbound TLS transport. This
// adapter has no fallback transport and performs a single provider call.
export function createStaffInvitationResendSender({apiKey,from,managementOrigin,fetchImpl}){
 const origin=new URL(managementOrigin);
 if(origin.protocol!=='https:'||origin.origin!==managementOrigin||
    typeof apiKey!=='string'||!KEY.test(apiKey)||typeof fetchImpl!=='function')
  throw Error('invalid_staff_resend_configuration');
 const sender=normalizeStaffInviteeEmail(from);
 return async function send({jobId,recipient,enrollmentUrl}){
  const recipientEmail=normalizeStaffInviteeEmail(recipient);
  const url=new URL(enrollmentUrl);
  if(!UUID.test(jobId??'')||url.origin!==managementOrigin||url.username||url.password||
     url.pathname!=='/'||url.search||!url.hash.startsWith('#enrolamiento?')||url.href.length>4096)
   throw Error('invalid_staff_resend_delivery');
  try {
   const response=await fetchImpl(RESEND_EMAILS,{method:'POST',redirect:'error',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json',
     'Idempotency-Key':'sabora-staff-invitation/'+jobId.toLowerCase()},
    signal:AbortSignal.timeout(10_000),
    body:JSON.stringify({from:'Sabora Gestión <'+sender+'>',to:[recipientEmail],
     subject:'Invitación a Sabora Gestión',
     text:'Abre este enlace para iniciar el enrolamiento de tu cuenta de personal:\n\n'+url.href})
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
