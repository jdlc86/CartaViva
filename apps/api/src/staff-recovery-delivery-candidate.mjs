// Candidate-only delivery and fenced server-side Auth proof exchange.
// No public route, operational session or credential mutation. The existing
// worker and Resend transport dispatch version-bound Sabora invitations.
import {createHmac,randomBytes} from 'node:crypto';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {ROOT_RECOVERY_LOGIN} from './staff-root-recovery-candidate.mjs';
import {ROOT_MAIL_LOGIN} from './staff-root-recovery-mail-candidate.mjs';
import {sealStaffInvitationToken,openStaffInvitationToken} from './staff-invitation-envelope-candidate.mjs';
import {hashStaffInvitationToken,normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';
import {verifySupabaseAccessToken} from './auth.mjs';

const SQL='SELECT sabora.staff_recovery_delivery_candidate($1::text,$2::text,$3::uuid,$4::text,$5::bigint,$6::bigint,$7::text) AS result';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const forbidden=()=>Object.assign(Error('staff_recovery_delivery_forbidden'),{code:'42501'});
export function createStaffRecoveryDeliveryCandidate({pool,keyId,signingSecret,keyring,hashInviteeEmail,
 mode='control',clock=Date.now,issuer,recoveryProviderFor,getTrustedKeys}={}){
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(keyId??'')||!(signingSecret instanceof Uint8Array)||signingSecret.byteLength!==32||
  !['control','worker'].includes(mode)||typeof keyring?.active!=='function'||typeof keyring?.resolveKey!=='function'||
  typeof hashInviteeEmail!=='function'||typeof clock!=='function')throw Error('invalid_staff_recovery_delivery_config');
 const key=Buffer.from(signingSecret),tx=createPostgresTransaction({pool});
 const login=mode==='control'?ROOT_RECOVERY_LOGIN:ROOT_MAIL_LOGIN;
 async function command(query,action,intentId,payload,deadline=Number.MAX_SAFE_INTEGER){
  const issued=clock(),expires=Math.min(issued+15000,deadline);
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued||
   (intentId!==null&&!UUID.test(intentId)))throw forbidden();
  const args=[keyId,action,intentId,JSON.stringify(payload),issued,expires];
  const signature=createHmac('sha256',key).update(['sabora.staff-recovery-delivery.v1',keyId,login,
   ...args.slice(1).map(x=>x===null?'-':String(x))].join('\n')).digest('hex');
  const result=await query(SQL,[...args,signature]),row=result?.rows?.[0]?.result;
  if(result?.rows?.length!==1||typeof row?.outcome!=='string')throw Error('invalid_staff_recovery_delivery_result');
  return row;
 }
 const run=(action,id,fields,deadline)=>tx(q=>command(q,action,id,fields,deadline));
 const checkedKey=k=>{if(!Buffer.isBuffer(k)||k.length!==32||k.equals(key))throw Error('invalid_staff_recovery_delivery_key');return k;};
 if(mode==='control')return Object.freeze({
  async queue(query,context,intent){
   // Must run inside the same transaction as signed authorization; the
   // token never leaves server custody or appears in the HTTP response.
   const token=randomBytes(32).toString('base64url'),tokenHash=hashStaffInvitationToken(token),selected=keyring.active();
   const envelope=sealStaffInvitationToken({token,enrollmentId:intent.enrollmentId,inviteVersion:intent.version,
    tokenHashHex:tokenHash,keyId:selected.keyId,key:checkedKey(selected.key),recoveryIntentId:intent.intentId});
   const result=await command(query,'queue',intent.intentId,{actor:context.verifiedIdentity.userId.toLowerCase(),
    tokenHash,envelope:JSON.stringify(envelope)},context.verifiedIdentity.expiresAt*1000);
   if(!['queued','existing'].includes(result.outcome))throw forbidden();
   return Object.freeze({outcome:result.outcome});
  },
  async sessionContext({intentId,accessToken}={}){
   if(!UUID.test(intentId??'')||typeof accessToken!=='string'||accessToken.length>3700||
    typeof recoveryProviderFor!=='function'||typeof getTrustedKeys!=='function'||typeof issuer!=='string')throw forbidden();
   let identity;
   try{identity=verifySupabaseAccessToken(accessToken,{issuer,keys:await getTrustedKeys(),now:clock,requireEnrollmentSession:true});}
   catch{throw forbidden();}
   const subjectId=identity.userId.toLowerCase(),sessionId=identity.sessionId.toLowerCase();
   const result=await run('check_session',intentId,{subject:subjectId,session:sessionId},identity.expiresAt*1000);
   if(result.outcome!=='session_current'||result.subjectId!==subjectId||!HASH.test(result.emailHash??'')||
    !Number.isSafeInteger(result.expiresAtMs)||result.expiresAtMs<=clock())throw forbidden();
   let email;
   try{email=normalizeStaffInviteeEmail(result.recipient);}catch{throw forbidden();}
   if(hashInviteeEmail(email)!==result.emailHash)throw forbidden();
   const provider=await recoveryProviderFor({subjectId,email});
   if(typeof provider?.user!=='function')throw forbidden();
   const user=await provider.user(accessToken),confirmed=Date.parse(user?.email_confirmed_at??'');
   if(user?.id!==identity.userId||user.is_anonymous!==false||!Number.isFinite(confirmed)||confirmed>clock())throw forbidden();
   try{if(hashInviteeEmail(normalizeStaffInviteeEmail(user.email))!==result.emailHash)throw forbidden();}
   catch{throw forbidden();}
   return Object.freeze({provider,deadlineMs:Math.min(result.expiresAtMs,identity.expiresAt*1000)});
  },
  async exchange({intentId,token}={}){
   if(!UUID.test(intentId??'')||typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token)||
    Buffer.from(token,'base64url').toString('base64url')!==token||
    typeof recoveryProviderFor!=='function'||typeof getTrustedKeys!=='function'||typeof issuer!=='string')throw forbidden();
   const tokenHash=hashStaffInvitationToken(token);
   const claim=await run('claim_exchange',intentId,{tokenHash});
   if(claim.outcome!=='exchange_claimed'||![claim.exchangeId,claim.subjectId,claim.enrollmentId].every(id=>UUID.test(id??''))||
    !Number.isSafeInteger(claim.version)||claim.version<1||!HASH.test(claim.emailHash??''))throw forbidden();
   let recipient;
   try{recipient=normalizeStaffInviteeEmail(claim.recipient);}catch{throw forbidden();}
   if(hashInviteeEmail(recipient)!==claim.emailHash)throw forbidden();
   // The only provider subject comes from the one-use durable claim.
   // Generate and exchange the provider proof server-side; neither proof
   // nor JWT is sent in the recovery email or exposed as response JSON.
   const provider=await recoveryProviderFor({subjectId:claim.subjectId,email:recipient});
   if(!['generateRecoveryProof','exchangeRecoveryProof','user'].every(name=>typeof provider?.[name]==='function'))
    throw Error('invalid_staff_recovery_provider');
   const proof=await provider.generateRecoveryProof();
   if(typeof proof?.authProof!=='string'||! /^[A-Za-z0-9_-]{32,512}$/.test(proof.authProof))throw forbidden();
   const {accessToken}=(await provider.exchangeRecoveryProof(proof.authProof))??{};
   if(typeof accessToken!=='string'||accessToken.length>3700)throw forbidden();
   let identity;
   try{identity=verifySupabaseAccessToken(accessToken,{issuer,keys:await getTrustedKeys(),now:clock,requireEnrollmentSession:true});}
   catch{throw forbidden();}
   if(identity.userId.toLowerCase()!==claim.subjectId.toLowerCase())throw forbidden();
   const user=await provider.user(accessToken),confirmed=Date.parse(user?.email_confirmed_at??'');
   if(user?.id!==identity.userId||user.is_anonymous!==false||!Number.isFinite(confirmed)||confirmed>clock())throw forbidden();
   let emailHash;
   try{emailHash=hashInviteeEmail(normalizeStaffInviteeEmail(user.email));}catch{throw forbidden();}
   if(emailHash!==claim.emailHash)throw forbidden();
   const result=await run('consume',intentId,{subject:identity.userId.toLowerCase(),session:identity.sessionId.toLowerCase(),
    emailHash,tokenHash,exchangeId:claim.exchangeId},identity.expiresAt*1000);
   if(result.outcome!=='consumed'||result.enrollmentId!==claim.enrollmentId||result.version!==claim.version)throw forbidden();
   const session={outcome:'consumed',enrollmentId:result.enrollmentId,version:result.version};
   Object.defineProperty(session,'accessToken',{value:accessToken,enumerable:false});
   return Object.freeze(session);
  }
 });
 return Object.freeze({
  async list(){
   const result=await run('list',null,{});
   if(result.outcome!=='listed'||!Array.isArray(result.jobs)||result.jobs.length>20||!result.jobs.every(id=>UUID.test(id)))
    throw Error('invalid_staff_recovery_delivery_list');
   return result.jobs;
  },
  async dispatch(intentId,send){
   if(!UUID.test(intentId??'')||typeof send!=='function')throw forbidden();
   const job=await run('claim',intentId,{});
   if(job.outcome!=='claimed')return Object.freeze({outcome:job.outcome});
   if(!UUID.test(job.fence??''))throw Error('invalid_staff_recovery_delivery_claim');
   let outcome='unknown',providerId=null;
   try{
    const recipient=normalizeStaffInviteeEmail(job.recipient);
    if(hashInviteeEmail(recipient)!==job.emailHash)throw forbidden();
    const envelope=JSON.parse(job.envelope);
    const token=openStaffInvitationToken({envelope,enrollmentId:job.enrollmentId,inviteVersion:job.version,
     tokenHashHex:job.tokenHash,key:checkedKey(await keyring.resolveKey(envelope.keyId)),recoveryIntentId:intentId});
    if(!Number.isSafeInteger(job.expiresAtMs)||job.expiresAtMs<=clock())throw forbidden();
    const result=await send({jobId:intentId,recipient,intentId,token});
    if(result?.outcome==='accepted'&&UUID.test(result.providerId??'')){outcome='accepted';providerId=result.providerId;}
    else if(result?.outcome==='permanent_failure')outcome='rejected';
   }catch{}
   const recorded=await run('finish',intentId,{fence:job.fence,result:outcome,providerId});
   return Object.freeze({outcome:recorded.outcome});
  }
 });
}
