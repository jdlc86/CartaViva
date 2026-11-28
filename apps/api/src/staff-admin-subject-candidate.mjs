import {createHmac} from 'node:crypto';
import {FIRST_ADMIN_BOOTSTRAP_LOGIN} from './staff-lifecycle-coordinator.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
export const STAFF_ADMIN_SUBJECT_SQL='SELECT sabora.resolve_staff_admin_subject_candidate($1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text) AS subject_user_id';

export const STAFF_FIRST_ADMIN_SUBJECT_SQL=STAFF_ADMIN_SUBJECT_SQL.replace('resolve_staff_admin_subject_candidate','resolve_staff_first_admin_subject_candidate');

// Same restricted lifecycle writer/key, distinct signing audience. The UUID
// stays inside the server; a separate signed transition rechecks its binding.
export function createStaffAdminSubjectResolverCandidate({query,keyId,secret,databaseRole,clock=Date.now}={}){
 const first=databaseRole===FIRST_ADMIN_BOOTSTRAP_LOGIN;
 if(typeof query!=='function'||!KEY.test(keyId??'')||!ROLE.test(databaseRole??'')||
    !(secret instanceof Uint8Array)||secret.byteLength<32||secret.byteLength>64||typeof clock!=='function')
  throw Error('invalid_staff_admin_subject_config');
 const key=Buffer.from(secret);
 return async({verifiedIdentity,verifiedStaff},{enrollmentId,action,correlationId})=>{
  const actor=verifiedIdentity?.userId;
  if(!UUID.test(actor??'')||verifiedStaff?.role!==(first?'root':'admin')||verifiedStaff.userId?.toLowerCase()!==actor.toLowerCase()||
    !UUID.test(enrollmentId??'')||!(first?['activate']:['activate','suspend']).includes(action)||!CORRELATION.test(correlationId??''))
   throw Object.assign(Error('staff_admin_subject_forbidden'),{code:'42501'});
  const issued=clock(),expires=issued+15000;
  if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(expires))throw Error('invalid_staff_admin_subject_clock');
  const args=[keyId,actor.toLowerCase(),enrollmentId.toLowerCase(),action,correlationId,issued,expires];
  const signature=createHmac('sha256',key).update([first?'sabora.staff-first-admin-subject.v1':'sabora.staff-admin-subject.v1',keyId,databaseRole,...args.slice(1)].join('\n'),'utf8').digest('hex');
  const result=await query(first?STAFF_FIRST_ADMIN_SUBJECT_SQL:STAFF_ADMIN_SUBJECT_SQL,[...args,signature]);
  const subject=result?.rows?.[0]?.subject_user_id;
  if(result?.rows?.length!==1||!UUID.test(subject??''))throw Error('invalid_staff_admin_subject_result');
  return subject;
 };
}
