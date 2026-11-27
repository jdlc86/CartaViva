// Trusted internal state machine only. Not a provider adapter and never
// exposed to HTTP. The caller must independently verify provider evidence.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {verifySupabaseAccessToken} from './auth.mjs';
import {normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';
import {hashRootCredentialId} from './staff-root-credential-id.mjs';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {ROOT_RECOVERY_LOGIN} from './staff-root-recovery-candidate.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const SQL='SELECT sabora.staff_recovery_registration_candidate($1::text,$2::text,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::bigint,$9::bigint,$10::text) AS outcome';
export function createStaffRecoveryRegistrationCandidate({pool,keyId,signingSecret,clock=Date.now}={}){
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(keyId??'')||!(signingSecret instanceof Uint8Array)||signingSecret.byteLength!==32||
  typeof clock!=='function')throw Error('invalid_staff_recovery_registration_config');
 const key=Buffer.from(signingSecret),tx=createPostgresTransaction({pool});
 return async(action,{intentId,subjectId,sessionId,credentialHash,evidenceHash=null,deadlineMs=Number.MAX_SAFE_INTEGER}={})=>{
  if(!['prepare','record_registration','record_revocation','complete'].includes(action)||
   ![intentId,subjectId,sessionId].every(x=>UUID.test(x??''))||!HASH.test(credentialHash??'')||
   (action==='complete'?evidenceHash!==null:!HASH.test(evidenceHash??''))||!Number.isSafeInteger(deadlineMs))
   throw Error('invalid_staff_recovery_registration_command');
  const issued=clock(),expires=Math.min(issued+15000,deadlineMs);
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued)
   throw Object.assign(Error('staff_recovery_registration_expired'),{code:'42501'});
  const args=[keyId,action,intentId.toLowerCase(),subjectId.toLowerCase(),sessionId.toLowerCase(),
   credentialHash,evidenceHash,issued,expires];
  const signature=createHmac('sha256',key).update(['sabora.staff-recovery-registration.v1',keyId,ROOT_RECOVERY_LOGIN,
   ...args.slice(1).map(x=>x===null?'-':String(x))].join('\n')).digest('hex');
  const result=await tx(q=>q(SQL,[...args,signature])),outcome=result?.rows?.[0]?.outcome;
  if(result?.rows?.length!==1||!['prepared','registration_recorded','revocation_recorded','completed','denied'].includes(outcome))
   throw Error('invalid_staff_recovery_registration_result');
  return Object.freeze({outcome});
 };
}


// Candidate orchestration for an already consumed recovery invitation.
// The access token is held by the server, never supplied by the browser.
// Provider admin methods are trusted injected dependencies; this module
// neither provisions a provider credential nor exposes an HTTP route.
const BASE64=/^[A-Za-z0-9_-]+$/;
const denied=()=>Object.assign(Error('staff_recovery_ceremony_forbidden'),{code:'42501'});
const uncertain=()=>Error('staff_recovery_provider_reconciliation_required');
export function createStaffRecoveryCeremonyCandidate({registration,provider,issuer,getTrustedKeys,
 managementOrigin,ticketSecret,sessionDeadlineMs=Number.MAX_SAFE_INTEGER,clock=Date.now}={}){
 const origin=new URL(managementOrigin);
 if(origin.protocol!=='https:'||origin.origin!==managementOrigin||typeof issuer!=='string'||
  typeof registration!=='function'||typeof getTrustedKeys!=='function'||typeof clock!=='function'||
  !Number.isSafeInteger(sessionDeadlineMs)||
  !(ticketSecret instanceof Uint8Array)||ticketSecret.byteLength!==32||
  !['user','registrationOptions','verifyRegistration','listPasskeys','revokePasskey','logoutAll'].every(
   method=>typeof provider?.[method]==='function'))throw Error('invalid_staff_recovery_ceremony_config');
 const key=Buffer.from(ticketSecret);
 const digest=(domain,fields)=>createHash('sha256').update(JSON.stringify([domain,...fields])).digest('hex');
 const sign=fields=>createHmac('sha256',key).update(JSON.stringify(['sabora.staff-recovery-ceremony-ticket.v1',origin.origin,...fields])).digest('hex');
 async function identity(accessToken,intentId){
  if(!UUID.test(intentId??'')||typeof accessToken!=='string'||accessToken.length>3700)throw denied();
  let verified;
  try{verified=verifySupabaseAccessToken(accessToken,{issuer,keys:await getTrustedKeys(),now:clock,requireEnrollmentSession:true});}
  catch{throw denied();}
  const user=await provider.user(accessToken);
  const confirmed=typeof user?.email_confirmed_at==='string'?Date.parse(user.email_confirmed_at):NaN;
  if(user?.id!==verified.userId||user.is_anonymous!==false||!Number.isFinite(confirmed)||confirmed>clock())throw denied();
  let email;try{email=normalizeStaffInviteeEmail(user.email);}catch{throw denied();}
  return {intentId:intentId.toLowerCase(),subjectId:verified.userId.toLowerCase(),
   sessionId:verified.sessionId.toLowerCase(),email,deadlineMs:Math.min(verified.expiresAt*1000,sessionDeadlineMs)};
 }
 const contextFields=ctx=>[ctx.intentId,ctx.subjectId,ctx.sessionId,digest('sabora.staff-recovery-email.v1',[ctx.email])];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 async function listed(subjectId){
  const result=await provider.listPasskeys(subjectId);
  if(!Array.isArray(result)||result.length>1000||!result.every(x=>typeof x==='string'&&UUID.test(x)))throw uncertain();
  const ids=result.map(x=>x.toLowerCase()).sort();
  if(new Set(ids).size!==ids.length)throw uncertain();
  return ids;
 }
 async function requireOutcome(action,binding,evidenceHash,expected){
  const result=await registration(action,{...binding,...(evidenceHash===null?{}:{evidenceHash})});
  if(result?.outcome!==expected)throw uncertain();
 }
 return Object.freeze({
  async options({accessToken,intentId}={}){
   const ctx=await identity(accessToken,intentId);
   const response=await provider.registrationOptions(accessToken),options=response?.options;
   if(!UUID.test(response?.challenge_id??'')||options?.rp?.id!==origin.hostname||
    typeof options.challenge!=='string'||!BASE64.test(options.challenge)||options.challenge.length>512||
    options.authenticatorSelection?.userVerification!=='required'||!Number.isSafeInteger(response.expires_at))throw denied();
   const expires=Math.min(response.expires_at*1000,clock()+300000,ctx.deadlineMs);
   if(!Number.isSafeInteger(expires)||expires<=clock())throw denied();
   const fields=[...contextFields(ctx),response.challenge_id.toLowerCase(),options.challenge,String(expires)];
   return Object.freeze({options,ticket:Buffer.from(JSON.stringify(fields)).toString('base64url')+'.'+sign(fields)});
  },
  async register({accessToken,intentId,ticket,credential}={}){
   const ctx=await identity(accessToken,intentId);
   let fields,credentialHash;
   try{
    if(typeof ticket!=='string'||ticket.length>3000)throw denied();
    const parts=ticket.split('.');
    if(parts.length!==2||!BASE64.test(parts[0])||!HASH.test(parts[1]))throw denied();
    const raw=Buffer.from(parts[0],'base64url');
    if(raw.toString('base64url')!==parts[0])throw denied();
    fields=JSON.parse(raw.toString('utf8'));
    if(!Array.isArray(fields)||fields.length!==7||!fields.every(x=>typeof x==='string')||
     !same(fields.slice(0,4),contextFields(ctx))||!UUID.test(fields[4])||
     !BASE64.test(fields[5])||fields[5].length>512||
     !Number.isSafeInteger(Number(fields[6]))||Number(fields[6])<=clock()||
     !timingSafeEqual(Buffer.from(parts[1],'hex'),Buffer.from(sign(fields),'hex')))throw denied();
    if(credential?.type!=='public-key'||typeof credential.id!=='string'||credential.id!==credential.rawId||
     typeof credential.response?.clientDataJSON!=='string'||credential.response.clientDataJSON.length>4096||
     !BASE64.test(credential.response.clientDataJSON)||
     typeof credential.response.attestationObject!=='string'||credential.response.attestationObject.length>32768||
     !BASE64.test(credential.response.attestationObject))throw denied();
    credentialHash=hashRootCredentialId(credential.id);
    const client=JSON.parse(Buffer.from(credential.response.clientDataJSON,'base64url').toString('utf8'));
    if(client.type!=='webauthn.create'||client.origin!==origin.origin||client.challenge!==fields[5]||
     (client.crossOrigin!==undefined&&client.crossOrigin!==false))throw denied();
   }catch{throw denied();}
   // Snapshot the existing provider UUIDs before any remote mutation. The
   // SQL prepare binds the consumed session and establishes the durable fence.
   const old=await listed(ctx.subjectId);
   const binding={intentId:ctx.intentId,subjectId:ctx.subjectId,sessionId:ctx.sessionId,credentialHash,
    deadlineMs:Math.min(Number(fields[6]),ctx.deadlineMs)};
   const ceremony=digest('sabora.staff-recovery-ceremony.v1',[...fields,credentialHash,...old]);
   if((await registration('prepare',{...binding,evidenceHash:ceremony}))?.outcome!=='prepared')throw denied();
   // From this point a failure may have a remote effect. Never repeat a
   // provider mutation automatically, release the fence, or return success
   // on ambiguous evidence. Exact reconciliation remains a separate concern.
   try{
    if(!same(await listed(ctx.subjectId),old)||
     !same(contextFields(await identity(accessToken,intentId)),contextFields(ctx))||binding.deadlineMs<=clock())throw uncertain();
    const receipt=await provider.verifyRegistration(accessToken,fields[4],credential);
    if(!UUID.test(receipt?.id??''))throw uncertain();
    const replacement=receipt.id.toLowerCase();
    if(old.includes(replacement)||!same(await listed(ctx.subjectId),[...old,replacement].sort())||
     !same(contextFields(await identity(accessToken,intentId)),contextFields(ctx)))throw uncertain();
    const registered=digest('sabora.staff-recovery-registration-receipt.v1',[ceremony,replacement]);
    await requireOutcome('record_registration',binding,registered,'registration_recorded');
    for(const previous of old){
     if(binding.deadlineMs<=clock()||await provider.revokePasskey(ctx.subjectId,previous)!==true)throw uncertain();
    }
    if(!same(await listed(ctx.subjectId),[replacement])||binding.deadlineMs<=clock()||
     await provider.logoutAll(accessToken)!==true||!same(await listed(ctx.subjectId),[replacement]))throw uncertain();
    const revoked=digest('sabora.staff-recovery-revocation-receipt.v1',[registered,...old,replacement,'global-logout-acknowledged']);
    await requireOutcome('record_revocation',binding,revoked,'revocation_recorded');
    await requireOutcome('complete',binding,null,'completed');
    return Object.freeze({outcome:'completed'});
   }catch{throw uncertain();}
  }
 });
}


// Resolve the provider afresh from the SQL-verified consumed session on each
// request. No caller-supplied subject or email; the HTTP layer only holds a
// server-encrypted recovery session, never an operational login cookie.
export function createStaffRecoveryServiceCandidate({delivery,registration,issuer,getTrustedKeys,
 managementOrigin,ticketSecret,clock=Date.now}={}){
 if(typeof delivery?.exchange!=='function'||typeof delivery?.sessionContext!=='function'||
  typeof registration!=='function'||typeof getTrustedKeys!=='function'||typeof clock!=='function'||
  !(ticketSecret instanceof Uint8Array)||ticketSecret.byteLength!==32)throw Error('invalid_staff_recovery_service');
 const key=Buffer.from(ticketSecret);
 async function ceremony(session){
  const scope=await delivery.sessionContext(session);
  return createStaffRecoveryCeremonyCandidate({registration,provider:scope.provider,issuer,getTrustedKeys,
   managementOrigin,ticketSecret:key,sessionDeadlineMs:scope.deadlineMs,clock});
 }
 return Object.freeze({
  async exchange(input){
   const accepted=await delivery.exchange(input);
   const scope=await delivery.sessionContext({intentId:input.intentId,accessToken:accepted.accessToken});
   const result={outcome:'ready',expiresAtMs:scope.deadlineMs};
   Object.defineProperty(result,'accessToken',{value:accepted.accessToken,enumerable:false});
   return Object.freeze(result);
  },
  async options(session){return (await ceremony(session)).options(session);},
  async register(session){return (await ceremony(session)).register(session);}
 });
}
