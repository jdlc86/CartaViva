// Candidate-only acceptance boundary. The caller supplies a server-held Auth
// session obtained by an authorized enrollment exchange. No HTTP route, cookie
// issuance, provider exchange, password login or operational session here.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {verifySupabaseAccessToken} from './auth.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer,hashStaffInvitationToken,
 normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';
import {createStaffLifecycleRepository} from './staff-lifecycle-repository.mjs';
import {createPostgresTransaction} from './postgres-transaction.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
export const STAFF_ENROLLMENT_LOGIN='sabora_staff_enrollment_login';
export const VERIFIED_ACCEPT_SQL=`SELECT * FROM sabora.accept_staff_invitation_verified_candidate(
 $1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::text,$10::uuid,$11::text)`;
export const CHECK_REGISTRATION_SQL='SELECT sabora.check_staff_registration_candidate($1::text,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::text) AS allowed';
export const VERIFIED_REGISTER_SQL=`SELECT * FROM sabora.register_staff_passkey_verified_candidate(
 $1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::text,$10::uuid,$11::uuid,$12::uuid,$13::text)`;
const BASE64=/^[A-Za-z0-9_-]+$/;
const forbidden=()=>Object.assign(Error('staff_enrollment_identity_forbidden'),{code:'42501'});

export function createStaffVerifiedEnrollmentCandidate({pool,issuer,provider,getTrustedKeys,
 keyId,secret,hashInviteeEmail,managementOrigin,now=Date.now}={}){
 if(typeof provider?.user!=='function'||typeof getTrustedKeys!=='function'||
    typeof hashInviteeEmail!=='function'||typeof now!=='function'||
    typeof keyId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(keyId)||
    !(secret instanceof Uint8Array)||secret.byteLength<32||secret.byteLength>64)
  throw Error('invalid_staff_verified_enrollment_config');
 const key=Buffer.from(secret),withTransaction=createPostgresTransaction({pool});
 const repository=createStaffLifecycleRepository();
 const hmac=fields=>createHmac('sha256',key).update(fields.join('\n')).digest('hex');
 let origin;
 if(managementOrigin!==undefined){
  origin=new URL(managementOrigin);
  if(origin.protocol!=='https:'||origin.origin!==managementOrigin||
    typeof provider.registrationOptions!=='function'||typeof provider.verifyRegistration!=='function')
   throw Error('invalid_staff_registration_config');
 }
 async function registrationIdentity(accessToken,enrollmentId){
  if(!origin||!UUID.test(enrollmentId??'')||typeof accessToken!=='string'||accessToken.length>3700)throw forbidden();
  const keys=await getTrustedKeys();
  let identity;
  try{identity=verifySupabaseAccessToken(accessToken,{issuer,keys,now,requireEnrollmentSession:true});}
  catch{throw forbidden();}
  const user=await provider.user(accessToken);
  const confirmed=typeof user?.email_confirmed_at==='string'?Date.parse(user.email_confirmed_at):NaN;
  if(user?.id!==identity.userId||user.is_anonymous!==false||!Number.isFinite(confirmed)||confirmed>now())throw forbidden();
  let emailHash;
  try{emailHash=hashInviteeEmail(normalizeStaffInviteeEmail(user.email));}catch{throw forbidden();}
  if(!HASH.test(emailHash??''))throw forbidden();
  const actor=identity.userId.toLowerCase(),session=identity.sessionId.toLowerCase(),id=enrollmentId.toLowerCase();
  const expires=Math.min(now()+15000,identity.expiresAt*1000);
  if(!Number.isSafeInteger(expires)||expires<=now())throw forbidden();
  const proof=hmac(['sabora.staff-registration-check.v1',keyId,STAFF_ENROLLMENT_LOGIN,actor,id,session,emailHash,String(expires)]);
  const checked=await withTransaction(query=>query(CHECK_REGISTRATION_SQL,[keyId,actor,id,session,emailHash,expires,proof]));
  if(checked?.rows?.length!==1||checked.rows[0].allowed!==true)throw forbidden();
  return {actor,session,id,emailHash,expiresAt:identity.expiresAt};
 }
 return Object.freeze({
  async registrationOptions({accessToken,enrollmentId}={}){
   const ctx=await registrationIdentity(accessToken,enrollmentId);
   const result=await provider.registrationOptions(accessToken);
   const options=result?.options,challenge=result?.challenge_id;
   // Do not weaken the provider's verification policy. A hosted provider
   // which does not offer required UV is not accepted by this candidate.
   if(!UUID.test(challenge??'')||options?.rp?.id!==origin.hostname||
      typeof options.challenge!=='string'||!BASE64.test(options.challenge)||options.challenge.length>512||
      options.authenticatorSelection?.userVerification!=='required'||
      !Number.isSafeInteger(result.expires_at))throw forbidden();
   const expiry=Math.min(result.expires_at*1000,now()+300000,ctx.expiresAt*1000);
   if(expiry<=now())throw forbidden();
   const fields=[ctx.actor,ctx.id,ctx.session,ctx.emailHash,challenge.toLowerCase(),options.challenge,String(expiry)];
   const ticket=Buffer.from(JSON.stringify(fields)).toString('base64url')+'.'+hmac(['sabora.staff-registration-ticket.v1',origin.origin,...fields]);
   return Object.freeze({options,ticket});
  },
  async register({accessToken,enrollmentId,ticket,credential,correlationId}={}){
   if(typeof ticket!=='string'||ticket.length>3000||!CORRELATION.test(correlationId??''))throw forbidden();
   const ctx=await registrationIdentity(accessToken,enrollmentId);
   let fields,proof,client;
   try{
    const parts=ticket.split('.');
    if(parts.length!==2||!BASE64.test(parts[0])||!HASH.test(parts[1]))throw forbidden();
    fields=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));proof=parts[1];
    if(!Array.isArray(fields)||fields.length!==7||fields.some(x=>typeof x!=='string')||
       fields[0]!==ctx.actor||fields[1]!==ctx.id||fields[2]!==ctx.session||fields[3]!==ctx.emailHash||
       !UUID.test(fields[4])||!BASE64.test(fields[5])||!Number.isSafeInteger(Number(fields[6]))||Number(fields[6])<=now()||
       !timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(hmac(['sabora.staff-registration-ticket.v1',origin.origin,...fields]),'hex')))
     throw forbidden();
    if(credential?.type!=='public-key'||typeof credential.id!=='string'||credential.id!==credential.rawId||
       !BASE64.test(credential.id)||credential.id.length>2048||
       typeof credential.response?.clientDataJSON!=='string'||credential.response.clientDataJSON.length>4096||
       !BASE64.test(credential.response.clientDataJSON)||
       typeof credential.response.attestationObject!=='string'||credential.response.attestationObject.length>32768||
       !BASE64.test(credential.response.attestationObject))throw forbidden();
    client=JSON.parse(Buffer.from(credential.response.clientDataJSON,'base64url').toString('utf8'));
    if(client.type!=='webauthn.create'||client.origin!==origin.origin||client.challenge!==fields[5]||
       (client.crossOrigin!==undefined&&client.crossOrigin!==false))throw forbidden();
   }catch{throw forbidden();}
   // Provider independently verifies attestation, required UV, challenge and
   // authenticated user. No browser-supplied credential ID is proof by itself.
   const receipt=await provider.verifyRegistration(accessToken,fields[4],credential);
   if(!UUID.test(receipt?.id??''))throw forbidden();
   const providerId=receipt.id.toLowerCase();
   // Recheck live identity, email and enrollment after the external call.
   // If revoked concurrently, Auth may retain an orphan credential but SQL
   // cannot activate it. Reconciliation of that remote effect is pending.
   const current=await registrationIdentity(accessToken,enrollmentId);
   if(current.actor!==ctx.actor||current.session!==ctx.session||current.emailHash!==ctx.emailHash)throw forbidden();
   const issuedAt=now(),ttlMs=Math.min(15000,current.expiresAt*1000-issuedAt,Number(fields[6])-issuedAt);
   if(!Number.isSafeInteger(ttlMs)||ttlMs<1)throw forbidden();
   const evidence=createHash('sha256').update(['sabora.staff-passkey-evidence.v1',ctx.actor,ctx.id,ctx.session,fields[4],providerId,credential.id].join('\n')).digest('hex');
   const issue=createStaffLifecycleDirectoryCapabilityIssuer({keyId,secret:key,databaseRole:STAFF_ENROLLMENT_LOGIN,clock:()=>issuedAt,ttlMs});
   const cap=issue({actorId:ctx.actor,action:'register',enrollmentId:ctx.id,subjectUserId:ctx.actor,
    requestedRole:null,inviteeEmailHashHex:null,inviteTokenHashHex:null,credentialEvidenceHashHex:evidence,
    reason:null,givenName:null,familyName:null,inviteeEmail:null,correlationId});
   const signature=hmac(['sabora.staff-registration-complete.v1',keyId,STAFF_ENROLLMENT_LOGIN,ctx.actor,
    ctx.id,ctx.session,ctx.emailHash,fields[4],providerId,cap.signatureHex]);
   const result=await withTransaction(query=>repository.transition(()=>query(VERIFIED_REGISTER_SQL,
    [keyId,ctx.actor,ctx.id,evidence,correlationId,cap.issuedAtMs,cap.expiresAtMs,cap.signatureHex,
     ctx.emailHash,ctx.session,fields[4],providerId,signature]),cap));
   return Object.freeze({enrollmentId:result.enrollmentId,state:result.currentState,repeated:result.repeated});
  },
  async accept({accessToken,enrollmentId,inviteToken,correlationId}={}){
   if(!UUID.test(enrollmentId??'')||!CORRELATION.test(correlationId??'')||
      typeof accessToken!=='string'||accessToken.length>3700)
    throw forbidden();
   let identity,tokenHash;
   const keys=await getTrustedKeys();
   try{
    identity=verifySupabaseAccessToken(accessToken,{issuer,keys,now,requireEnrollmentSession:true});
    tokenHash=hashStaffInvitationToken(inviteToken);
   }catch{throw forbidden();}
   const user=await provider.user(accessToken);
   const confirmed=typeof user?.email_confirmed_at==='string'?Date.parse(user.email_confirmed_at):NaN;
   if(user?.id!==identity.userId||user.is_anonymous!==false||
      !Number.isFinite(confirmed)||confirmed>now())throw forbidden();
   let emailHash;
   try{emailHash=hashInviteeEmail(normalizeStaffInviteeEmail(user.email));}
   catch{throw forbidden();}
   if(typeof emailHash!=='string'||!HASH.test(emailHash))throw forbidden();
   const issuedAt=now(),ttlMs=Math.min(15_000,identity.expiresAt*1000-issuedAt);
   if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw forbidden();
   const issue=createStaffLifecycleDirectoryCapabilityIssuer({keyId,secret:key,
    databaseRole:STAFF_ENROLLMENT_LOGIN,clock:()=>issuedAt,ttlMs});
   const cap=issue({actorId:identity.userId,action:'accept',enrollmentId,
    subjectUserId:identity.userId,requestedRole:null,inviteeEmailHashHex:null,
    inviteTokenHashHex:tokenHash,credentialEvidenceHashHex:null,reason:null,
    givenName:null,familyName:null,inviteeEmail:null,correlationId});
   const sessionId=identity.sessionId.toLowerCase();
   const proof=createHmac('sha256',key).update(['sabora.staff-enrollment-accept.v1',
    keyId,STAFF_ENROLLMENT_LOGIN,cap.actorId,cap.enrollmentId,sessionId,emailHash,cap.signatureHex
   ].join('\n')).digest('hex');
   const result=await withTransaction(query=>repository.transition(
    ()=>query(VERIFIED_ACCEPT_SQL,[keyId,cap.actorId,cap.enrollmentId,tokenHash,correlationId,
     cap.issuedAtMs,cap.expiresAtMs,cap.signatureHex,emailHash,sessionId,proof]),cap));
   return Object.freeze({enrollmentId:result.enrollmentId,state:result.currentState,repeated:result.repeated});
  }
 });
}
