// Internal candidate kernel, not an HTTP route or Auth provider.
// The integrator must bind verified fresh passkey, confirmed destination,
// delivery receipt and provider recovery fence before exposing any command.
import {createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createPostgresTransaction} from './postgres-transaction.mjs';
export const ROOT_RECOVERY_LOGIN='sabora_root_recovery_login';
export const ROOT_RECOVERY_ACCESS_SQL='SELECT sabora.root_recovery_access_candidate($1::text,$2::uuid,$3::text,$4::bigint,$5::bigint,$6::text) AS allowed';
export const ROOT_RECOVERY_SQL='SELECT * FROM sabora.root_recovery_transition_candidate($1::text,$2::text,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::integer,$9::bigint,$10::bigint,$11::text)';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ACTIONS=new Set(['configure','prepare_link','confirm_link','reject_link','challenge','attempt','claim','reset','add_backup','complete']);
const OUTCOMES=new Set(['configured','link_prepared','link_confirmed','link_rejected','challenge_created','authorized','claimed','reset','backup_added','completed','denied','blocked','registration_pending']);
export function generateRootRecoveryCode(){
 const bytes=randomBytes(16);let buffer=0,bits=0,code='';
 for(const byte of bytes){
  buffer=(buffer<<8)|byte;bits+=8;
  while(bits>=5){bits-=5;code+=ALPHABET[(buffer>>>bits)&31];}
  buffer&=(1<<bits)-1;
 }
 if(bits)code+=ALPHABET[(buffer<<(5-bits))&31];
 bytes.fill(0);return code;
}
export function createRootRecoveryFactorHasher(secret){
 if(!(secret instanceof Uint8Array)||secret.byteLength!==32)throw Error('invalid_root_recovery_factor_key');
 const key=Buffer.from(secret);
 return (kind,value)=>{
  if(!['email','code','link','challenge','grant'].includes(kind)||typeof value!=='string'||value.length>512)
   throw Error('invalid_root_recovery_factor');
  // Invalid code candidates must still reach the durable counter with an
  // unmatchable domain, rather than silently bypassing attempt accounting.
  if(kind==='code'){
   value=value.toUpperCase().replaceAll('-','');
   if(!/^[A-Z2-7]{25}[AEIMQUY4]$/.test(value))kind='invalid-code';
  }else if(kind==='email'){
   value=value.trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||value.length>254)throw Error('invalid_root_recovery_factor');
  }else if(!/^[A-Za-z0-9_-]{43}$/.test(value)||Buffer.from(value,'base64url').toString('base64url')!==value)
   throw Error('invalid_root_recovery_factor');
  return createHmac('sha256',key).update('sabora.root-recovery-factor.v1\n'+kind+'\n'+value,'utf8').digest('hex');
 };
}
export const generateRootRecoveryToken=()=>randomBytes(32).toString('base64url');
export function createRootRecoveryKernelCandidate({pool,keyId,signingSecret,factorSecret,clock=Date.now}={}){
 if(typeof keyId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(keyId)||
  !(signingSecret instanceof Uint8Array)||signingSecret.byteLength!==32||
  !(factorSecret instanceof Uint8Array)||factorSecret.byteLength!==32||
  timingSafeEqual(signingSecret,factorSecret)||typeof clock!=='function')
  throw Error('invalid_root_recovery_config');
 const key=Buffer.from(signingSecret),hash=createRootRecoveryFactorHasher(factorSecret);
 const tx=createPostgresTransaction({pool});
 // No direct use from browser body. This is a signed internal capability.
 async function command(action,actor,{requestId=randomUUID(),a=null,b=null,c=null,days=null}={}){
  if(!ACTIONS.has(action)||!UUID.test(actor??'')||!UUID.test(requestId??'')||
    ![a,b,c].every(v=>v===null||HASH.test(v))||(days!==null&&!Number.isSafeInteger(days)))
   throw Error('invalid_root_recovery_command');
  const issued=clock(),expires=issued+15000;
  if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(expires))throw Error('invalid_root_recovery_clock');
  const args=[keyId,action,actor.toLowerCase(),requestId.toLowerCase(),a,b,c,days,issued,expires];
  const signature=createHmac('sha256',key).update(['sabora.root-recovery.v1',keyId,ROOT_RECOVERY_LOGIN,
   ...args.slice(1).map(v=>v===null?'-':String(v))].join('\n'),'utf8').digest('hex');
  const result=await tx(query=>query(ROOT_RECOVERY_SQL,[...args,signature]));
  const row=result?.rows?.[0];
  if(result?.rows?.length!==1||!OUTCOMES.has(row?.outcome)||typeof row.failures!=='string'||
    !/^(0|[1-9][0-9]*)$/.test(row.failures)||(row.blocked_until!==null&&
    (!(row.blocked_until instanceof Date)||!Number.isFinite(row.blocked_until.getTime()))))
   throw Error('invalid_root_recovery_result');
  return Object.freeze({outcome:row.outcome,failures:row.failures,blockedUntil:row.blocked_until?.toISOString()??null});
 }
 async function allowsAccess(actor,credentialHash){
  if(!UUID.test(actor??'')||(credentialHash!==null&&!HASH.test(credentialHash??'')))return false;
  const issued=clock(),expires=issued+15000;
  if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(expires))throw Error('invalid_root_recovery_clock');
  const args=[keyId,actor.toLowerCase(),credentialHash,issued,expires];
  const signature=createHmac('sha256',key).update(['sabora.root-recovery-access.v1',keyId,ROOT_RECOVERY_LOGIN,
   ...args.slice(1).map(v=>v===null?'-':String(v))].join('\n'),'utf8').digest('hex');
  const result=await tx(query=>query(ROOT_RECOVERY_ACCESS_SQL,[...args,signature]));
  if(result?.rows?.length!==1||typeof result.rows[0].allowed!=='boolean')throw Error('invalid_root_recovery_access_result');
  return result.rows[0].allowed;
 }
 return Object.freeze({command,hash,allowsAccess});
}
