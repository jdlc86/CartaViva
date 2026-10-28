import {normalizeStaffDirectorySearch} from './staff-directory-capability.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES=new Set(['admin','waiter','kitchen']);
function context(value){
 const actorId=value?.verifiedIdentity?.userId,staffId=value?.verifiedStaff?.userId,
  staffRole=value?.verifiedStaff?.role;
 if(!UUID.test(actorId??'')||!UUID.test(staffId??'')||actorId.toLowerCase()!==staffId.toLowerCase()||
    !ROLES.has(staffRole))throw Error('staff_directory_forbidden');
 return {actorId:actorId.toLowerCase(),staffRole};
}
function base(actor,operation,input){return {actorId:actor.actorId,staffRole:actor.staffRole,operation,
 targetEnrollmentId:input.targetEnrollmentId,search:input.search,cursor:input.cursor,limit:input.limit};}

export function createStaffDirectoryCoordinator({withTransaction,repository,issueCapability}={}){
 if(typeof withTransaction!=='function'||!repository||typeof repository.list!=='function'||
    typeof repository.detail!=='function'||typeof repository.self!=='function'||
    typeof issueCapability!=='function')throw Error('invalid_staff_directory_coordinator');
 return Object.freeze({
  async list(verified,{search=null,cursor=0,limit=20}={}){
   const actor=context(verified);if(actor.staffRole!=='admin')throw Error('staff_directory_forbidden');
   let normalized;try{normalized=normalizeStaffDirectorySearch(search);}catch{
    throw Error('invalid_staff_directory_request');}
   if(!Number.isSafeInteger(cursor)||cursor<0||cursor>1_000_000||
      !Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('invalid_staff_directory_request');
   const capability=issueCapability(base(actor,'admin_list',{targetEnrollmentId:null,
    search:normalized,cursor,limit}));
   return withTransaction(query=>repository.list(query,capability));
  },
  async detail(verified,{enrollmentId}={}){
   const actor=context(verified);if(actor.staffRole!=='admin'||!UUID.test(enrollmentId??''))
    throw Error(actor.staffRole==='admin'?'invalid_staff_directory_request':'staff_directory_forbidden');
   const capability=issueCapability(base(actor,'admin_detail',{targetEnrollmentId:enrollmentId.toLowerCase(),
    search:null,cursor:0,limit:1}));
   return withTransaction(query=>repository.detail(query,capability));
  },
  async self(verified){
   const actor=context(verified),capability=issueCapability(base(actor,'self_profile',{
    targetEnrollmentId:null,search:null,cursor:0,limit:1}));
   return withTransaction(query=>repository.self(query,capability));
  },
 });
}
