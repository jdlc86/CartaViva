// Read-only candidate. No delivery, Auth registration or membership changes.
import {createHmac} from 'node:crypto';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {ROOT_RECOVERY_LOGIN} from './staff-root-recovery-candidate.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const SQL='SELECT * FROM sabora.classify_staff_invitation_candidate($1::text,$2::uuid,$3::text,$4::text,$5::uuid,$6::bigint,$7::bigint,$8::text)';
const forbidden=()=>Object.assign(Error('staff_invitation_classify_forbidden'),{code:'42501'});
export function createStaffInvitationClassificationCandidate({pool,keyId,signingSecret,hashInviteeEmail,clock=Date.now}={}){
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(keyId??'')||!(signingSecret instanceof Uint8Array)||
  signingSecret.byteLength!==32||typeof hashInviteeEmail!=='function'||typeof clock!=='function')
  throw Error('invalid_staff_invitation_classification_config');
 const key=Buffer.from(signingSecret),tx=createPostgresTransaction({pool});
 return async(context,input)=>{
  const identity=context?.verifiedIdentity,staff=context?.verifiedStaff;
  if(!UUID.test(identity?.userId??'')||identity.userId!==staff?.userId||
   !['root','admin'].includes(staff.role)||!Number.isSafeInteger(identity.expiresAt))throw forbidden();
  const credential=staff.role==='root'?context.verifiedRootCredential:null;
  if(staff.role==='root'&&!HASH.test(credential??''))throw forbidden();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||
   (!Object.hasOwn(input,'email')&&!Object.hasOwn(input,'enrollmentId')))throw forbidden();
  let emailHash=null,enrollment=null;
  if(Object.hasOwn(input,'email')){
   if(typeof input.email!=='string'||input.email.length>254)throw forbidden();
   try{emailHash=hashInviteeEmail(input.email);}catch{throw forbidden();}
   if(!HASH.test(emailHash??''))throw forbidden();
  }else{
   if(!UUID.test(input.enrollmentId??''))throw forbidden();
   enrollment=input.enrollmentId.toLowerCase();
  }
  const issued=clock(),expires=Math.min(issued+15000,identity.expiresAt*1000);
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued)throw forbidden();
  const args=[keyId,identity.userId.toLowerCase(),credential,emailHash,enrollment,issued,expires];
  const sig=createHmac('sha256',key).update(['sabora.staff-invitation-classify.v1',keyId,ROOT_RECOVERY_LOGIN,
   ...args.slice(1).map(x=>x===null?'-':String(x))].join('\n')).digest('hex');
  const result=await tx(q=>q(SQL,[...args,sig])),row=result?.rows?.[0];
  if(result?.rows?.length!==1||!['new','resend','recover','incomplete'].includes(row?.purpose)||
   (row.purpose==='new'?(row.enrollment_id!==null||row.enrollment_state!==null):
    (!UUID.test(row.enrollment_id??'')||!({resend:['invited'],recover:['active','suspended'],incomplete:['accepted','registered']}[row.purpose]??[]).includes(row.enrollment_state))))
   throw Error('invalid_staff_invitation_classification_result');
  return Object.freeze({purpose:row.purpose,enrollmentId:row.enrollment_id,state:row.enrollment_state});
 };
}

// Internal authorization: no email, token, Auth call or operational session.
// The caller selects a bounded duration explicitly; no default is approved.
export function createStaffRecoveryIntentCandidate({pool,keyId,signingSecret,ttlSeconds,delivery,clock=Date.now}={}){
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(keyId??'')||!(signingSecret instanceof Uint8Array)||
  signingSecret.byteLength!==32||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>86400||
  typeof clock!=='function'||(delivery!==undefined&&typeof delivery?.queue!=='function'))throw Error('invalid_staff_recovery_intent_config');
 const key=Buffer.from(signingSecret),tx=createPostgresTransaction({pool});
 return async(context,input)=>{
  const identity=context?.verifiedIdentity,staff=context?.verifiedStaff;
  if(!UUID.test(identity?.userId??'')||identity.userId!==staff?.userId||
   !['root','admin'].includes(staff.role)||!Number.isSafeInteger(identity.expiresAt))throw forbidden();
  const credential=staff.role==='root'?context.verifiedRootCredential:null;
  if(staff.role==='root'&&!HASH.test(credential??''))throw forbidden();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||
   !Object.hasOwn(input,'enrollmentId')||!Object.hasOwn(input,'requestId')||
   !UUID.test(input.enrollmentId??'')||!UUID.test(input.requestId??''))throw forbidden();
  const issued=clock(),expires=Math.min(issued+15000,identity.expiresAt*1000);
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued)throw forbidden();
  const args=[keyId,identity.userId.toLowerCase(),credential,input.enrollmentId.toLowerCase(),
   input.requestId.toLowerCase(),ttlSeconds,issued,expires];
  const sig=createHmac('sha256',key).update(['sabora.staff-recovery-intent.v1',keyId,ROOT_RECOVERY_LOGIN,
   ...args.slice(1).map(x=>x===null?'-':String(x))].join('\n')).digest('hex');
  return tx(async q=>{
  const result=await q('SELECT * FROM sabora.authorize_staff_recovery_intent_candidate($1::text,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::integer,$7::bigint,$8::bigint,$9::text)',[...args,sig]);
  const row=result?.rows?.[0];
  if(result?.rows?.length!==1||row.intent_id!==args[4]||row.enrollment_id!==args[3]||
   !Number.isSafeInteger(row.intent_version)||row.intent_version<1||
   !(row.expires_at instanceof Date)||!Number.isFinite(row.expires_at.getTime())||
   typeof row.repeated!=='boolean')throw Error('invalid_staff_recovery_intent_result');
  const intent=Object.freeze({intentId:row.intent_id,enrollmentId:row.enrollment_id,version:row.intent_version,
   expiresAt:row.expires_at.toISOString(),repeated:row.repeated});
  if(delivery)await delivery.queue(q,context,intent);
  return intent;
  });
 };
}
