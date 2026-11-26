// Trusted internal state machine only. Not a provider adapter and never
// exposed to HTTP. The caller must independently verify provider evidence.
import {createHmac} from 'node:crypto';
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
