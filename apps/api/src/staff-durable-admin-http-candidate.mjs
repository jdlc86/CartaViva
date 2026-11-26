// Candidate-only administrative boundary. No provider call on the HTTP path:
// invitation and encrypted material commit together before asynchronous dispatch.
import {createStaffLifecycleCoordinator,STAFF_INVITATION_DELIVERY_TOKEN} from './staff-lifecycle-coordinator.mjs';
import {createDurableStaffLifecycleRepositoryCandidate} from './staff-invitation-durable-lifecycle-candidate.mjs';
import {validateStaffLifecycleHttpInput} from './staff-lifecycle-http-candidate.mjs';

const ACTIONS=new Set(['invite','resend','activate','suspend','revoke']);
const EXPECTED_STATE={invite:'invited',resend:'invited',activate:'active',suspend:'suspended',revoke:'revoked'};

export function registerDurableStaffAdminHttpCandidate(app,{forRoles,keyring,lifecycleConfig}={}){
 if(typeof forRoles!=='function'||!lifecycleConfig||typeof lifecycleConfig!=='object')
  throw Error('invalid_staff_durable_admin_http_config');
 // Callers cannot substitute the historical token-returning repository or
 // enable the exceptional ROOT path. SQL still rechecks current ownership.
 const coordinator=createStaffLifecycleCoordinator({...lifecycleConfig,
  repository:createDurableStaffLifecycleRepositoryCandidate({keyring}),
  revocationOnly:false,firstAdminBootstrapOnly:false});
 app.post('/api/v1/staff/lifecycle',{preHandler:forRoles(['admin']),bodyLimit:4096},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  let parsed;
  try{
   parsed=validateStaffLifecycleHttpInput(request.body);
   if(!ACTIONS.has(parsed.action)||
      (parsed.action==='revoke'&&parsed.input.subjectUserId!==null)||
      (['activate','suspend'].includes(parsed.action)&&parsed.input.subjectUserId===null))
    throw Error('invalid_staff_lifecycle_request');
  }catch{return reply.code(400).send({error:'invalid_staff_lifecycle_request'});}
  try{
   const result=await coordinator.transition({
    verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff
   },parsed.input);
   if(result[STAFF_INVITATION_DELIVERY_TOKEN]!==undefined||
      result.currentState!==EXPECTED_STATE[parsed.action])throw Error('invalid_staff_durable_admin_result');
   // Explicit projection: no subject UUID, email, token, custody, provider
   // result or SQL audit event returned. Queued is not sent or activated.
   const response={enrollmentId:result.enrollmentId,state:result.currentState,repeated:result.repeated};
   if(parsed.action==='invite')Object.assign(response,{givenName:result.givenName,
    familyName:result.familyName,employeeCode:result.employeeCode,
    operationalDisplayId:result.operationalDisplayId,currentState:result.currentState});
   return reply.code(parsed.action==='invite'&&!result.repeated?201:200).send(response);
  }catch(error){
   if(error?.message==='invalid_staff_lifecycle_request')return reply.code(400).send({error:'invalid_staff_lifecycle_request'});
   if(error?.code==='42501'||['staff_lifecycle_identity_forbidden','staff_lifecycle_admin_forbidden'].includes(error?.message))
    return reply.code(403).send({error:'forbidden'});
   if(error?.message==='staff_employee_codes_exhausted')return reply.code(409).send({error:'staff_employee_codes_exhausted'});
   if(['40001','23505','23514'].includes(error?.code))
    return reply.code(409).send({error:'staff_lifecycle_conflict'});
   return reply.code(503).send({error:'staff_lifecycle_unavailable'});
  }
 });
}
