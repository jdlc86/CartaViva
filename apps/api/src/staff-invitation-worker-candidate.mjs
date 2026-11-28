import {preflightStaffRestrictedIdentity} from './staff-durable-admin-identity-preflight.mjs';
import {createStaffDirectoryDispatchReaderCandidate} from './staff-invitation-durable-lifecycle-candidate.mjs';
import {sendAuthorizedStaffInvitation} from './staff-invitation-dispatch-guard.mjs';
import {createStaffInvitationResendSender} from './staff-invitation-resend.mjs';

const OWNER='sabora_staff_invitation_dispatch_fn_owner';
const ROUTINES=[
 ['sabora.reserve_staff_invitation_dispatch_candidate()',OWNER],
 ['sabora.finish_staff_invitation_dispatch_candidate(uuid,uuid,text,uuid)',OWNER],
 ['sabora.read_staff_invitation_directory_dispatch_candidate(uuid,uuid)','sabora_staff_custody_reader_fn_owner']
];
export const STAFF_INVITATION_WORKER_ROUTINES=Object.freeze(ROUTINES.map(([signature])=>signature));
const invalid=()=>Error('invalid_staff_invitation_worker');

export function createStaffInvitationWorkerCandidate({pool,expectedLogin,keyring,resend,createInvitationProof,
 observeFailure=()=>{}}={}){
 if(typeof pool?.query!=='function'||typeof pool.connect!=='function'||typeof createInvitationProof!=='function'||
    !/^sabora_[a-z0-9_]{1,55}$/.test(expectedLogin??''))throw invalid();
 const send=createStaffInvitationResendSender(resend);
 const readDelivery=createStaffDirectoryDispatchReaderCandidate({query:(...args)=>pool.query(...args),keyring,
  async createEnrollmentUrl({enrollmentId,recipient,token}){
   const proof=await createInvitationProof(recipient);
   if(typeof proof!=='string'||!/^[A-Za-z0-9_-]{32,512}$/.test(proof))throw invalid();
   return resend.managementOrigin+'/#enrolamiento?'+new URLSearchParams({enrollmentId,token,proof});
  }
 });
 const readiness=()=>preflightStaffRestrictedIdentity({pool,role:expectedLogin,routines:ROUTINES,
  tables:['staff_invitation_outbox','staff_invitation_custody_candidate','staff_enrollments','staff_directory_contacts'],
  requiredTriggers:[['staff_invitation_outbox','staff_invitation_custody_required',true]]});
 const report=()=>{try{observeFailure(Error('staff_invitation_delivery_needs_attention'));}catch{}};
 let closed=false,running=false,timer,task;

 async function run(){
  for(let dispatches=0;dispatches<16&&!closed;dispatches++){
   const {rows:[job]}=await pool.query('SELECT * FROM sabora.reserve_staff_invitation_dispatch_candidate()');
   if(!job)return;
   await sendAuthorizedStaffInvitation({jobId:job.job_id,fence:job.fence,readDelivery,send,
    async recordOutcome({jobId,fence,outcome,providerId=null}){
     const {rows:[receipt]}=await pool.query('SELECT sabora.finish_staff_invitation_dispatch_candidate($1,$2,$3,$4) AS recorded',
      [jobId,fence,outcome,providerId]);
     if(!receipt?.recorded||outcome!=='accepted')report();
    }
   });
  }
 }

 function tick(){
  if(!running||closed)return Promise.resolve();
  if(task)return task;
  clearTimeout(timer);
  task=run().catch(report).finally(()=>{
   task=undefined;
   if(!closed){timer=setTimeout(tick,60_000);timer.unref();}
  });
  return task;
 }
 return Object.freeze({readiness,tick,
  start(){if(running||closed)throw invalid();running=true;void tick();},
  async close(){closed=true;clearTimeout(timer);await task;}
 });
}
