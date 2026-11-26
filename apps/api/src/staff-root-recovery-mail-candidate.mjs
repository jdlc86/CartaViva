// Candidate for the existing mail worker and verified ROOT security ceremony.
// Never expose command or claimed material to browser JSON.
import {createCipheriv,createDecipheriv,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {normalizeStaffInviteeEmail} from './staff-lifecycle-capability.mjs';
import {generateRootRecoveryCode,generateRootRecoveryToken,ROOT_RECOVERY_LOGIN} from './staff-root-recovery-candidate.mjs';

export const ROOT_MAIL_SQL='SELECT sabora.root_recovery_mail_candidate($1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text) AS result';
export const ROOT_MAIL_LOGIN='sabora_root_recovery_mail_login';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const tokenValid=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{43}$/.test(t)&&Buffer.from(t,'base64url').toString('base64url')===t;
const forbidden=()=>Object.assign(Error('root_recovery_mail_denied'),{code:'42501'});
const hashMatches=(a,b)=>HASH.test(a??'')&&HASH.test(b??'')&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));

export function createRootRecoveryMailCandidate({pool,keyId,signingSecret,hash,keyring,mode='control',clock=Date.now}={}){
 if(!KEY.test(keyId??'')||!(signingSecret instanceof Uint8Array)||signingSecret.byteLength!==32||
  !['control','worker'].includes(mode)||
  typeof hash!=='function'||typeof keyring?.active!=='function'||typeof keyring?.resolveKey!=='function'||typeof clock!=='function')
  throw Error('invalid_root_mail_configuration');
 const key=Buffer.from(signingSecret),tx=createPostgresTransaction({pool});
 const login=mode==='control'?ROOT_RECOVERY_LOGIN:ROOT_MAIL_LOGIN;
 function aad(actor,domain,binding,kid){
  return Buffer.from(['sabora.root-recovery-mail-envelope.v1',actor,domain,binding,kid].join('\n'));
 }
 function checkedKey(k){
  if(!Buffer.isBuffer(k)||k.length!==32||timingSafeEqual(k,key))throw Error('invalid_root_mail_key');
  return k;
 }
 function seal(actor,domain,binding,value){
  const active=keyring.active(),nonce=randomBytes(12);
  if(!KEY.test(active?.keyId??'')||typeof value!=='string'||value.length>254)throw Error('invalid_root_mail_material');
  const cipher=createCipheriv('aes-256-gcm',checkedKey(active.key),nonce);
  cipher.setAAD(aad(actor,domain,binding,active.keyId));
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [active.keyId,nonce.toString('base64url'),ciphertext.toString('base64url'),cipher.getAuthTag().toString('base64url')].join('.');
 }
 async function open(actor,domain,binding,envelope){
  if(typeof envelope!=='string'||envelope.length>2048)throw Error('invalid_root_mail_envelope');
  const [kid,n,c,t,extra]=envelope.split('.');
  if(!KEY.test(kid??'')||extra!==undefined||![n,c,t].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]+$/.test(x)&&Buffer.from(x,'base64url').toString('base64url')===x))
   throw Error('invalid_root_mail_envelope');
  const nonce=Buffer.from(n,'base64url'),tag=Buffer.from(t,'base64url'),ciphertext=Buffer.from(c,'base64url');
  if(nonce.length!==12||tag.length!==16||ciphertext.length>1024)throw Error('invalid_root_mail_envelope');
  const decipher=createDecipheriv('aes-256-gcm',checkedKey(await keyring.resolveKey(kid)),nonce);
  decipher.setAAD(aad(actor,domain,binding,kid));decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
 }
 async function command(actor,action,fields={},deadlineMs=Number.MAX_SAFE_INTEGER,requestId=randomUUID()){
  if(!UUID.test(actor??'')||!UUID.test(requestId)||!Number.isSafeInteger(deadlineMs))throw forbidden();
  actor=actor.toLowerCase();
  const issued=clock(),expires=Math.min(issued+15000,deadlineMs);
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||expires<=issued)throw forbidden();
  const args=[keyId,actor,requestId.toLowerCase(),action,JSON.stringify(fields),issued,expires];
  const signature=createHmac('sha256',key).update(['sabora.root-recovery-mail.v1',keyId,login,...args.slice(1)].join('\n')).digest('hex');
  const result=await tx(query=>query(ROOT_MAIL_SQL,[...args,signature]));
  const row=result?.rows?.[0]?.result;
  if(result?.rows?.length!==1||typeof row?.outcome!=='string')throw Error('invalid_root_mail_result');
  return row;
 }
 function verifiedContext({identity,credentialHash,deadlineMs,requestId}={}){
  if(!UUID.test(identity?.userId??'')||!HASH.test(credentialHash??'')||!UUID.test(requestId??'')||
   !Number.isSafeInteger(deadlineMs)||deadlineMs<=clock())throw forbidden();
  return {actor:identity.userId.toLowerCase(),credential:credentialHash,deadlineMs,requestId};
 }
 function material(actor,purpose,kind=purpose){
  const jobId=randomUUID(),token=generateRootRecoveryToken();
  return {jobId,tokenHash:hash(kind,token),tokenEnvelope:seal(actor,'token:'+purpose,jobId,token)};
 }
 async function stage(input){
  const {actor,credential,deadlineMs,requestId}=verifiedContext(input);
  const recipient=normalizeStaffInviteeEmail(input.email),days=input.days??28;
  if(!Number.isSafeInteger(days)||days<1||days>365)throw forbidden();
  const emailHash=hash('email',recipient),proof=material(actor,'verify','email-verification');
  const result=await command(actor,'stage',{credential,emailHash,recipientEnvelope:seal(actor,'recipient',emailHash,recipient),
   proofHash:proof.tokenHash,tokenEnvelope:proof.tokenEnvelope,jobId:proof.jobId,days},deadlineMs,requestId);
  if(result.outcome!=='verification_queued')throw forbidden();
  return {outcome:result.outcome};
 }
 async function confirm(input){
  const {actor,credential,deadlineMs,requestId}=verifiedContext(input);
  if(!tokenValid(input.proof)||typeof input.initial!=='boolean')throw forbidden();
  const code=input.initial?generateRootRecoveryCode():null,link=material(actor,'link');
  const result=await command(actor,'confirm',{credential,proofHash:hash('email-verification',input.proof),codeHash:code?hash('code',code):null,
   linkHash:link.tokenHash,linkEnvelope:link.tokenEnvelope,jobId:link.jobId,noticeId:randomUUID()},deadlineMs,requestId);
  if(result.outcome!==(input.initial?'configured':'email_changed'))throw forbidden();
  return {outcome:result.outcome,...(code?{code}:{})};
 }
 async function queueLink(actor){
  const m=material(actor.toLowerCase(),'link');
  return command(actor,'queue_link',m);
 }
 async function queueChallenge(actor,link){
  if(!tokenValid(link))return {outcome:'denied'};
  const m=material(actor.toLowerCase(),'challenge');
  return command(actor,'queue_challenge',{...m,linkHash:hash('link',link)});
 }
 async function list(actor){const row=await command(actor,'list');if(row.outcome!=='listed'||!Array.isArray(row.jobs)||row.jobs.length>20||!row.jobs.every(id=>UUID.test(id)))throw Error('invalid_root_mail_list');return row.jobs;}
 async function promote(actor,jobId){
  if(!UUID.test(jobId??''))throw forbidden();
  return command(actor,'promote',{jobId});
 }
 async function dispatch(actor,jobId,send){
  if(!UUID.test(jobId??'')||typeof send!=='function')throw forbidden();
  actor=actor.toLowerCase();
  const job=await command(actor,'claim',{jobId});
  if(job.outcome!=='claimed'){
   // A crash after recording acceptance but before promotion must not resend.
   const promotion=await promote(actor,jobId);
   return promotion.outcome==='link_confirmed'?{outcome:'accepted',promotion:promotion.outcome}:job;
  }
  if(job.jobId!==jobId||!UUID.test(job.fence??'')||!['verify','link','challenge','notice'].includes(job.purpose))throw Error('invalid_root_mail_claim');
  let result='unknown',providerId=null;
  try{
   const recipient=normalizeStaffInviteeEmail(await open(actor,'recipient',job.emailHash,job.recipientEnvelope));
   if(!hashMatches(hash('email',recipient),job.emailHash))throw forbidden();
   const token=job.purpose==='notice'?null:await open(actor,'token:'+job.purpose,jobId,job.tokenEnvelope);
   if(job.purpose!=='notice'&&(!tokenValid(token)||!hashMatches(hash(job.purpose==='verify'?'email-verification':job.purpose,token),job.tokenHash)))throw forbidden();
   const receipt=await send({jobId,recipient,purpose:job.purpose,token});
   if(receipt?.outcome==='accepted'&&UUID.test(receipt.providerId??'')){result='accepted';providerId=receipt.providerId;}
   else if(receipt?.outcome==='permanent_failure')result='rejected';
  }catch{/* Never retry an ambiguous dispatch automatically. */}
  const recorded=await command(actor,'finish',{jobId,fence:job.fence,result,providerId});
  if(recorded.outcome!==result)throw Error('root_mail_outcome_unconfirmed');
  if(result==='accepted'&&job.purpose==='link')return {outcome:result,promotion:(await promote(actor,jobId)).outcome};
  return {outcome:result};
 }
 return Object.freeze(mode==='control'?{stage,confirm,queueChallenge}:{queueLink,list,dispatch,promote});
}
