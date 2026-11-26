// Candidate-only administrative boundary. No provider call on the HTTP path:
// invitation and encrypted material commit together before asynchronous dispatch.
import {createStaffLifecycleCoordinator,STAFF_INVITATION_DELIVERY_TOKEN} from './staff-lifecycle-coordinator.mjs';
import {createDurableStaffLifecycleRepositoryCandidate} from './staff-invitation-durable-lifecycle-candidate.mjs';
import {validateStaffLifecycleHttpInput} from './staff-lifecycle-http-candidate.mjs';

const ACTIONS=new Set(['invite','resend','activate','suspend','revoke']);
const EXPECTED_STATE={invite:'invited',resend:'invited',activate:'active',suspend:'suspended',revoke:'revoked'};

export function registerDurableStaffAdminHttpCandidate(app,config){
 return registerLifecycle(app,config,false);
}
export function registerDurableFirstAdminHttpCandidate(app,config){
 return registerLifecycle(app,config,true);
}
function registerLifecycle(app,{forRoles,keyring,lifecycleConfig,resolveSubject,readState}={},first){
 if(typeof forRoles!=='function'||typeof resolveSubject!=='function'||(first&&typeof readState!=='function')||!lifecycleConfig||typeof lifecycleConfig!=='object')
  throw Error('invalid_staff_durable_admin_http_config');
 // Distinct fixed route/role, same durable repository. The caller cannot
 // select the exceptional path through HTTP. SQL independently rechecks authority.
 const coordinator=createStaffLifecycleCoordinator({...lifecycleConfig,
  repository:createDurableStaffLifecycleRepositoryCandidate({keyring}),
  revocationOnly:false,firstAdminBootstrapOnly:first});
 if(first)app.get('/api/v1/staff/bootstrap/first-admin',{preHandler:forRoles(['root'])},async(request,reply)=>{
  reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');
  if(Object.keys(request.query??{}).length)return reply.code(400).send({error:'invalid_staff_lifecycle_request'});
  try{return await readState({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});}
  catch(error){return reply.code(error?.code==='42501'?403:503).send({error:error?.code==='42501'?'forbidden':'staff_lifecycle_unavailable'});}
 });
 app.post(first?'/api/v1/staff/bootstrap/first-admin':'/api/v1/staff/lifecycle',{preHandler:forRoles([first?'root':'admin']),bodyLimit:4096},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  let parsed;
  try{
   parsed=validateStaffLifecycleHttpInput(request.body);
   if(!ACTIONS.has(parsed.action)||(first&&(parsed.action==='suspend'||(parsed.action==='invite'&&parsed.input.requestedRole!=='admin')))||
      (['revoke','activate','suspend'].includes(parsed.action)&&parsed.input.subjectUserId!==null))
    throw Error('invalid_staff_lifecycle_request');
  }catch{return reply.code(400).send({error:'invalid_staff_lifecycle_request'});}
  try{
   const context={verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff,
    verifiedRootCredential:request.verifiedRootCredential};
   const input=['activate','suspend'].includes(parsed.action)
    ? {...parsed.input,subjectUserId:await resolveSubject(context,parsed.input)}:parsed.input;
   const result=await coordinator.transition(context,input);
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
   if(['40001','23505','23514','22023','P0002'].includes(error?.code))
    return reply.code(409).send({error:'staff_lifecycle_conflict'});
   return reply.code(503).send({error:'staff_lifecycle_unavailable'});
  }
 });
}
