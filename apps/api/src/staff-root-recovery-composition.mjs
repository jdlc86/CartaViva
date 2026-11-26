import {timingSafeEqual} from 'node:crypto';
import {preflightStaffRestrictedIdentity} from './staff-durable-admin-identity-preflight.mjs';
import {createRootRecoveryKernelCandidate,ROOT_RECOVERY_LOGIN} from './staff-root-recovery-candidate.mjs';
import {createRootRecoveryMailCandidate,ROOT_MAIL_LOGIN} from './staff-root-recovery-mail-candidate.mjs';
import {createRootRecoveryResendSender} from './staff-invitation-resend.mjs';
import {createStaffRootSecurityCandidate} from './staff-root-security-candidate.mjs';

const OWNER='sabora_root_recovery_fn_owner';
const MAIL=['sabora.root_recovery_mail_candidate(text,uuid,uuid,text,text,bigint,bigint,text)',OWNER];
const CONTROL=[
 MAIL,
 ['sabora.classify_staff_invitation_candidate(text,uuid,text,text,uuid,bigint,bigint,text)',OWNER],
 ['sabora.root_recovery_access_candidate(text,uuid,text,bigint,bigint,text)',OWNER],
 ['sabora.root_recovery_transition_candidate(text,text,uuid,uuid,text,text,text,integer,bigint,bigint,text)',OWNER],
];
const TABLES=['staff_members','root_bootstrap_receipt','root_recovery_keys_candidate',
 'root_recovery_state_candidate','root_recovery_audit_candidate','root_recovery_mail_contact_candidate',
 'root_recovery_mail_pending_candidate','root_recovery_mail_job_candidate','admin_ownership_audit','staff_lifecycle_audit','staff_enrollments','admin_write_ownership'];
const TRIGGERS=[
 ['root_recovery_audit_candidate','root_recovery_audit_immutable',false],
 ['root_recovery_audit_candidate','root_recovery_audit_no_truncate',false],
 ['admin_ownership_audit','root_recovery_ownership_fence',false],
 ['staff_lifecycle_audit','root_recovery_first_admin_fence',false],
];

export async function createVerifiedRootRecoveryCandidate({control,worker,factorSecret,keyring,rotationDays,
 getRootUserId,resend,observeFailure=()=>{}}={}){
 if(typeof keyring?.active!=='function'||typeof keyring?.resolveKey!=='function'||
  typeof getRootUserId!=='function'||typeof observeFailure!=='function'||!control?.pool||!worker?.pool||
  control.expectedLogin!==ROOT_RECOVERY_LOGIN||worker.expectedLogin!==ROOT_MAIL_LOGIN||
  control.pool===worker.pool||control.keyId===worker.keyId)
  throw Error('invalid_root_recovery_composition');
 const keys=[control.signingSecret,worker.signingSecret,factorSecret];
 const custodyKey=key=>{
  if(!Buffer.isBuffer(key)||key.length!==32||keys.some(other=>timingSafeEqual(key,other)))
   throw Error('invalid_root_recovery_custody_key');
  return key;
 };
 if(keys.some((key,i)=>!(key instanceof Uint8Array)||key.byteLength!==32||
   keys.slice(0,i).some(other=>timingSafeEqual(key,other))))
  throw Error('invalid_root_recovery_composition');
 const custody={
  active(){const selected=keyring.active();return {...selected,key:custodyKey(selected?.key)};},
  async resolveKey(id){return custodyKey(await keyring.resolveKey(id));},
 };
 custody.active();
 const kernel=createRootRecoveryKernelCandidate({...control,factorSecret});
 const hash=kernel.hash;
 const mail=createRootRecoveryMailCandidate({...control,mode:'control',hash,keyring:custody});
 const transport=createRootRecoveryMailCandidate({...worker,mode:'worker',hash,keyring:custody});
 const send=createRootRecoveryResendSender(resend);
 const security=createStaffRootSecurityCandidate({kernel,mail,rotationDays});
 const readiness=()=>Promise.all([
  preflightStaffRestrictedIdentity({pool:control.pool,role:ROOT_RECOVERY_LOGIN,routines:CONTROL,tables:TABLES,requiredTriggers:TRIGGERS}),
  preflightStaffRestrictedIdentity({pool:worker.pool,role:ROOT_MAIL_LOGIN,routines:[MAIL],tables:TABLES,requiredTriggers:TRIGGERS}),
 ]);
 await readiness();
 let closed=false,started=false,timer,task;
 async function run(){
  const actor=await getRootUserId();
  if(actor===null||closed)return;
  // Release only an expired operation that never reached the durable
  // pre-provider fence. Prepared/uncertain operations are never reopened.
  await kernel.command('expire_unprepared',actor);
  await transport.queueLink(actor);
  for(const jobId of await transport.list(actor)){
   if(closed)break;
   const result=await transport.dispatch(actor,jobId,send);
   if(['unknown','rejected'].includes(result.outcome))report();
  }
 }
 function report(){
  try{observeFailure(Error('root_recovery_mail_worker_unavailable'));}catch{}
 }
 function tick(){
  if(closed||!started)return Promise.resolve();
  if(task)return task;
  clearTimeout(timer);
  task=run().catch(report).finally(()=>{
   task=undefined;
   if(!closed){timer=setTimeout(tick,60_000);timer.unref();}
  });
  return task;
 }
 return Object.freeze({security,readiness,allowsAccess:kernel.allowsAccess,issueMutationProof:kernel.issueMutationProof,
  start(){if(started||closed)throw Error('invalid_root_recovery_worker_state');started=true;return tick();},
  tick,
  async close(){closed=true;clearTimeout(timer);await task;}
 });
}
