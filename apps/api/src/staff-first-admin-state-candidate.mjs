import {createHmac} from 'node:crypto';
import {FIRST_ADMIN_BOOTSTRAP_LOGIN} from './staff-lifecycle-coordinator.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES=['invited','accepted','registered','active'];
export const FIRST_ADMIN_STATE_SQL='SELECT * FROM sabora.read_staff_first_admin_state_candidate($1::text,$2::uuid,$3::bigint,$4::bigint,$5::text)';
export function createStaffFirstAdminStateCandidate({query,keyId,secret,clock=Date.now}={}){
 if(typeof query!=='function'||typeof keyId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(keyId)||
    !(secret instanceof Uint8Array)||secret.byteLength<32||secret.byteLength>64||typeof clock!=='function')
  throw Error('invalid_first_admin_state_config');
 const key=Buffer.from(secret);
 return async({verifiedIdentity,verifiedStaff})=>{
  const actor=verifiedIdentity?.userId;
  if(!UUID.test(actor??'')||verifiedStaff?.role!=='root'||verifiedStaff.userId?.toLowerCase()!==actor.toLowerCase())
   throw Object.assign(Error('first_admin_state_forbidden'),{code:'42501'});
  const issued=clock(),expires=issued+15000;
  if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(expires))throw Error('invalid_first_admin_state_clock');
  const args=[keyId,actor.toLowerCase(),issued,expires];
  const signature=createHmac('sha256',key).update(['sabora.staff-first-admin-state.v1',keyId,FIRST_ADMIN_BOOTSTRAP_LOGIN,...args.slice(1)].join('\n'),'utf8').digest('hex');
  const result=await query(FIRST_ADMIN_STATE_SQL,[...args,signature]);
  const row=result?.rows?.[0];
  if(result?.rows?.length!==1||!['closed','empty','current','blocked'].includes(row?.phase))throw Error('invalid_first_admin_state_result');
  if(row.phase!=='current'){
   if([row.enrollment_id,row.given_name,row.family_name,row.email,row.operational_display_id,row.enrollment_state].some(x=>x!==null))throw Error('invalid_first_admin_state_result');
   return {phase:row.phase,member:null};
  }
  if(!UUID.test(row.enrollment_id??'')||!STATES.includes(row.enrollment_state)||
   ![row.given_name,row.family_name,row.email,row.operational_display_id].every(x=>typeof x==='string'&&x.length>0))throw Error('invalid_first_admin_state_result');
  return {phase:'current',member:{enrollmentId:row.enrollment_id,givenName:row.given_name,familyName:row.family_name,email:row.email,operationalDisplayId:row.operational_display_id,state:row.enrollment_state}};
 };
}
