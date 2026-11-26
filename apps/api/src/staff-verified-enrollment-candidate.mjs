// Candidate-only acceptance boundary. The caller supplies a server-held Auth
// session obtained by an authorized enrollment exchange. No HTTP route, cookie
// issuance, provider exchange, password login or operational session here.
import {createHmac} from 'node:crypto';
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
const forbidden=()=>Object.assign(Error('staff_enrollment_identity_forbidden'),{code:'42501'});

export function createStaffVerifiedEnrollmentCandidate({pool,issuer,provider,getTrustedKeys,
 keyId,secret,hashInviteeEmail,now=Date.now}={}){
 if(typeof provider?.user!=='function'||typeof getTrustedKeys!=='function'||
    typeof hashInviteeEmail!=='function'||typeof now!=='function'||
    typeof keyId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(keyId)||
    !(secret instanceof Uint8Array)||secret.byteLength<32||secret.byteLength>64)
  throw Error('invalid_staff_verified_enrollment_config');
 const key=Buffer.from(secret),withTransaction=createPostgresTransaction({pool});
 const repository=createStaffLifecycleRepository();
 return Object.freeze({
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
