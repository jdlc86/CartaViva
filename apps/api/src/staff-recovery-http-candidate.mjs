// Candidate-only recovery HTTP boundary, separate from enrollment and login.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createStaffRecoveryDeliveryCandidate} from './staff-recovery-delivery-candidate.mjs';
import {createStaffInvitationClassificationCandidate,createStaffRecoveryIntentCandidate}
 from './staff-invitation-classification-candidate.mjs';
import {createStaffRecoveryRegistrationCandidate,createStaffRecoveryServiceCandidate}
 from './staff-recovery-registration-candidate.mjs';

export const STAFF_RECOVERY_PATH='/api/v1/staff/recovery';
const COOKIE='__Host-sabora-staff-recovery';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64=/^[A-Za-z0-9_-]+$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const validToken=v=>typeof v==='string'&&v.length===43&&BASE64.test(v)&&Buffer.from(v,'base64url').toString('base64url')===v;
const exact=(body,keys)=>body!==null&&typeof body==='object'&&!Array.isArray(body)&&
 Object.keys(body).length===keys.length&&keys.every(k=>Object.hasOwn(body,k));
const cookie=(value,age)=>COOKIE+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Strict';

export function registerStaffRecoveryHttpCandidate(app,{origin,secret,service,clock=Date.now}={}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.origin!==origin||!(secret instanceof Uint8Array)||secret.byteLength!==32||
  typeof clock!=='function'||!['exchange','options','register'].every(k=>typeof service?.[k]==='function'))
  throw Error('invalid_staff_recovery_http_config');
 const key=Buffer.from(secret),aad=Buffer.from('sabora.staff-recovery.http.v1\n'+origin);
 function seal(session){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad);
  const body=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);
  const value=Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
  if(value.length>3600)throw Error('staff_recovery_session_too_large');
  return value;
 }
 function open(request){
  try{
   const parts=(request.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
   if(parts.length!==1)return null;
   const value=parts[0].slice(COOKIE.length+1);
   if(!value||value.length>3600||!BASE64.test(value))return null;
   const data=Buffer.from(value,'base64url');
   if(data.length<29||data.toString('base64url')!==value)return null;
   const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(data.subarray(12,28));
   const session=JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
   if(!exact(session,['intentId','accessToken','expiresAt'])||!UUID.test(session.intentId)||
    typeof session.accessToken!=='string'||!JWT.test(session.accessToken)||
    !Number.isSafeInteger(session.expiresAt)||session.expiresAt<=clock())return null;
   return session;
  }catch{return null;}
 }
 const invalid=reply=>reply.code(400).send({error:'invalid_staff_recovery_request'});
 const denied=reply=>reply.code(403).send({error:'staff_recovery_denied'});
 const failed=(reply,error)=>error?.code==='42501'?denied(reply):reply.code(503).send({error:'staff_recovery_unavailable'});
 const guard=async(request,reply)=>{
  reply.header('Cache-Control','no-store');reply.header('Referrer-Policy','no-referrer');reply.header('X-Content-Type-Options','nosniff');
  if(request.headers.host!==base.host||request.headers.origin!==origin||request.headers.authorization!==undefined||
   request.url.includes('?'))return denied(reply);
 };
 app.post(STAFF_RECOVERY_PATH+'/accept',{preHandler:guard,bodyLimit:1024},async(request,reply)=>{
  const body=request.body;
  if(!exact(body,['intentId','token'])||!UUID.test(body.intentId??'')||!validToken(body.token))return invalid(reply);
  try{
   const result=await service.exchange({intentId:body.intentId.toLowerCase(),token:body.token});
   if(result?.outcome!=='ready'||typeof result.accessToken!=='string'||!JWT.test(result.accessToken)||
    !Number.isSafeInteger(result.expiresAtMs))return denied(reply);
   const expiresAt=Math.min(clock()+300000,result.expiresAtMs);
   const age=Math.floor((expiresAt-clock())/1000);
   if(age<=0)return denied(reply);
   const value=seal({intentId:body.intentId.toLowerCase(),accessToken:result.accessToken,expiresAt});
   return reply.header('Set-Cookie',cookie(value,age)).send({outcome:'ready'});
  }catch(error){return failed(reply,error);}
 });
 app.post(STAFF_RECOVERY_PATH+'/options',{preHandler:guard,bodyLimit:1024},async(request,reply)=>{
  if(!exact(request.body,[]))return invalid(reply);
  const session=open(request);if(!session)return denied(reply);
  try{
   const result=await service.options({intentId:session.intentId,accessToken:session.accessToken});
   return {options:result.options,ticket:result.ticket};
  }catch(error){return failed(reply,error);}
 });
 app.post(STAFF_RECOVERY_PATH+'/register',{preHandler:guard,bodyLimit:49152},async(request,reply)=>{
  const body=request.body;
  if(!exact(body,['ticket','credential'])||typeof body.ticket!=='string'||body.ticket.length>3000||
   !body.credential||typeof body.credential!=='object'||Array.isArray(body.credential))return invalid(reply);
  const session=open(request);if(!session)return denied(reply);
  try{
   const result=await service.register({intentId:session.intentId,accessToken:session.accessToken,ticket:body.ticket,credential:body.credential});
   if(result?.outcome!=='completed')throw Error('staff_recovery_not_completed');
   return reply.header('Set-Cookie',cookie('',0)).send({outcome:'completed'});
  }catch(error){
   // The remote result may be uncertain. Do not offer an automatic replay.
   reply.header('Set-Cookie',cookie('',0));
   return failed(reply,error);
  }
 });
 app.post(STAFF_RECOVERY_PATH+'/cancel',{preHandler:guard,bodyLimit:1024},async(request,reply)=>{
  if(!exact(request.body,[]))return invalid(reply);
  // Local exit only; no claim about revocation or remote reconciliation.
  return reply.header('Set-Cookie',cookie('',0)).code(204).send();
 });
}


// Separate protected administration route. ROOT's exception is recovery
// only; the ADMIN's current ownership is checked inside SQL, not by UI.
export const STAFF_RECOVERY_ADMIN_PATH='/api/v1/staff/recovery-admin';
export function registerStaffRecoveryAdminHttpCandidate(app,{forRoles,classify,authorize}={}){
 if(typeof forRoles!=='function'||typeof classify!=='function'||typeof authorize!=='function')
  throw Error('invalid_staff_recovery_admin_config');
 const context=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff,
  verifiedRootCredential:request.verifiedRootCredential});
 const guard=forRoles(['root','admin']);
 const fail=(error,reply)=>{
  if(error?.code==='42501')return reply.code(403).send({error:'staff_recovery_denied'});
  if(['40001','23505','23514'].includes(error?.code))return reply.code(409).send({error:'staff_recovery_conflict'});
  return reply.code(503).send({error:'staff_recovery_unavailable'});
 };
 const validEmail=email=>typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
 app.post(STAFF_RECOVERY_ADMIN_PATH,{preHandler:guard,bodyLimit:2048},async(request,reply)=>{
  reply.header('Cache-Control','no-store');reply.header('Referrer-Policy','no-referrer');reply.header('X-Content-Type-Options','nosniff');
  const body=request.body;
  if(request.url.includes('?')||!body||!validEmail(body.email)||
   !(body.action==='classify'&&exact(body,['action','email'])||
    body.action==='authorize'&&exact(body,['action','email','enrollmentId','requestId'])&&
     UUID.test(body.enrollmentId??'')&&UUID.test(body.requestId??'')))
   return reply.code(400).send({error:'invalid_staff_recovery_request'});
  try{
   const ctx=context(request),found=await classify(ctx,{email:body.email});
   if(body.action==='classify'){
    // No directory projection or provider identifiers. Only the recovery
    // classification can reveal an enrollment ID in this dedicated route.
    if(found?.purpose!=='recover')return {outcome:'not_recoverable'};
    if(!UUID.test(found.enrollmentId??'')||!['active','suspended'].includes(found.state))throw Error('invalid_staff_recovery_classification');
    return {outcome:'recoverable',enrollmentId:found.enrollmentId,state:found.state};
   }
   if(found?.purpose!=='recover'||found.enrollmentId!==body.enrollmentId.toLowerCase())return reply.code(403).send({error:'staff_recovery_denied'});
   const result=await authorize(ctx,{enrollmentId:found.enrollmentId,requestId:body.requestId.toLowerCase()});
   if(result?.intentId!==body.requestId.toLowerCase()||result.enrollmentId!==found.enrollmentId||
    typeof result.repeated!=='boolean'||!Number.isSafeInteger(result.version)||result.version<1||
    !Number.isFinite(Date.parse(result.expiresAt??'')))throw Error('invalid_staff_recovery_authorization');
   // A committed outbox job is not proof of email delivery.
   return reply.code(result.repeated?200:201).send({outcome:'queued',enrollmentId:result.enrollmentId,
    requestId:result.intentId,version:result.version,expiresAt:result.expiresAt,repeated:result.repeated});
  }catch(error){return fail(error,reply);}
 });
}

export function createStaffRecoveryHttpComposition({control,keyring,hashInviteeEmail,origin,
 issuer,getTrustedKeys,providerFor,ttlSeconds,httpSecret,ticketSecret}={}){
 if(typeof providerFor!=='function'||typeof getTrustedKeys!=='function'||
  typeof issuer!=='string'||!(httpSecret instanceof Uint8Array)||httpSecret.byteLength!==32||
  !(ticketSecret instanceof Uint8Array)||ticketSecret.byteLength!==32||
  Buffer.from(httpSecret).equals(ticketSecret))throw Error('invalid_staff_recovery_http_composition');
 const delivery=createStaffRecoveryDeliveryCandidate({...control,keyring,hashInviteeEmail,
  issuer,getTrustedKeys,recoveryProviderFor:providerFor});
 const classify=createStaffInvitationClassificationCandidate({...control,hashInviteeEmail});
 const authorize=createStaffRecoveryIntentCandidate({...control,ttlSeconds,delivery});
 const registration=createStaffRecoveryRegistrationCandidate(control);
 const service=createStaffRecoveryServiceCandidate({delivery,registration,issuer,getTrustedKeys,
  managementOrigin:origin,ticketSecret});
 return Object.freeze({
  register(app,{forRoles}){
   registerStaffRecoveryHttpCandidate(app,{origin,secret:httpSecret,service});
   registerStaffRecoveryAdminHttpCandidate(app,{forRoles,classify,authorize});
  }
 });
}
