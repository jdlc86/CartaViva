import {createAdminReadProjectionCandidate} from './admin-read-projection-candidate.mjs';

// Candidate composition only. Never register as an unprotected route.
// The caller MUST run authenticated, current durable staff membership hooks
// before invoking this adapter. The browser never supplies a role.
export function createVerifiedAdminTableReader({query}={}){
 const candidate=createAdminReadProjectionCandidate({query});
 return Object.freeze({
  async listTables(request,options={}){
   const identity=request?.verifiedIdentity;
   const staff=request?.verifiedStaff;
   if(!identity||typeof identity.userId!=='string'||
      !staff||staff.userId!==identity.userId||
      !['admin','waiter'].includes(staff.role))
    throw Error('admin_projection_forbidden');
   if(options===null||typeof options!=='object'||Array.isArray(options)||
      (Object.getPrototypeOf(options)!==Object.prototype&&Object.getPrototypeOf(options)!==null)||
      Reflect.ownKeys(options).some(k=>typeof k!=='string'||
       !['limit','afterNumber'].includes(k)||
       !Object.hasOwn(Object.getOwnPropertyDescriptors(options)[k],'value')))
    throw Error('invalid_admin_projection_page');
   return candidate.listTables({role:staff.role,...options});
  }
 });
}
