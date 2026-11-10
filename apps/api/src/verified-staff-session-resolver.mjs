// Candidate authenticated staff session resolver. The verifier must validate
// the provider-issued bearer cryptographically (issuer, audience, expiry)
// and return a verified subject. The DB then checks active membership.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createVerifiedStaffSessionResolver({verifyBearer}={}){
 if(typeof verifyBearer!=='function')throw Error('invalid_staff_session_verifier');
 return async function resolveStaffSession(query,{credential}={}){
  if(typeof query!=='function'||typeof credential!=='string'||
     credential.length<32||credential.length>4096)
   throw Error('invalid_staff_session_scope');
  const verified=await verifyBearer(credential);
  if(!verified||verified.verified!==true||!uuid.test(verified.subject)||
     verified.audienceValid!==true||verified.issuerValid!==true||
     verified.notExpired!==true)
   return Object.freeze({authenticated:false,active:false});
  const result=await query(
   `SELECT user_id,role,state FROM sabora.staff_members
      WHERE user_id=$1::uuid AND state='active' FOR SHARE`,
   [verified.subject]);
  if(!result||!Array.isArray(result.rows)||result.rows.length>1)
   throw Error('invalid_staff_session_db_response');
  const row=result.rows[0];
  if(!row)return Object.freeze({authenticated:true,active:false});
  if(typeof row.user_id!=='string'||row.user_id.toLowerCase()!==verified.subject.toLowerCase()||
     row.state!=='active'||!['root','admin','waiter','kitchen'].includes(row.role))
   throw Error('invalid_staff_session_db_response');
  return Object.freeze({authenticated:true,active:true,actorId:row.user_id,role:row.role});
 };
}
