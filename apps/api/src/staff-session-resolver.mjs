// Read-only staff membership verification AFTER an external trusted auth
// provider validates the bearer credential and yields a verified user UUID.
// Never derive user ID by decoding an unverified JWT or client JSON.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createStaffSessionResolver({verifyBearer}={}){
 if(typeof verifyBearer!=='function')throw Error('invalid_staff_bearer_verifier');
 return async function resolveStaffSession(query,{credential}={}){
  if(typeof query!=='function'||typeof credential!=='string'||
     credential.length<32||credential.length>4096)
   throw Error('invalid_staff_session_lookup');
  const verified=await verifyBearer(credential);
  if(!verified||verified.verified!==true||!uuid.test(verified.userId))
   return Object.freeze({authenticated:false,active:false});
  const result=await query(
   `SELECT user_id,role,state FROM sabora.staff_members
     WHERE user_id=$1 AND state='active' FOR SHARE`,
   [verified.userId]);
  if(!result||!Array.isArray(result.rows)||result.rows.length>1)
   throw Error('invalid_staff_membership_result');
  const row=result.rows[0];
  if(!row)return Object.freeze({authenticated:true,active:false});
  if(typeof row.user_id!=='string'||
     row.user_id.toLowerCase()!==verified.userId.toLowerCase()||
     row.state!=='active'||!['root','admin','waiter','kitchen'].includes(row.role))
   throw Error('invalid_staff_membership_result');
  return Object.freeze({authenticated:true,active:true,actorId:row.user_id,role:row.role});
 };
}
