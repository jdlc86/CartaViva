const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const KEY_ID=/^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME=/^[a-z][a-z0-9_]{0,62}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY=/^.{2,4}-[0-9A-Z]{3}$/u;
const ROLES=new Set(['admin','waiter','kitchen']);
const STATES=new Set(['invited','accepted','registered','active','suspended','revoked']);

export const STAFF_DIRECTORY_READ_SQL=`SELECT * FROM sabora.read_staff_directory_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::uuid,$7::text,$8::integer,$9::integer,
 $10::bigint,$11::bigint,$12::text)`;

function plain(value){const prototype=value&&typeof value==='object'?Object.getPrototypeOf(value):null;
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (prototype===Object.prototype||prototype===null);}
function capability(value){
 const keys=['keyId','databaseRole','actorId','staffRole','operation','targetEnrollmentId','search',
  'cursor','limit','issuedAtMs','expiresAtMs','signatureHex'];
 return plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))&&
  KEY_ID.test(value.keyId)&&ROLE_NAME.test(value.databaseRole)&&UUID.test(value.actorId)&&
  ROLES.has(value.staffRole)&&['admin_list','admin_detail','self_profile'].includes(value.operation)&&
  (value.targetEnrollmentId===null||UUID.test(value.targetEnrollmentId))&&
  (value.search===null||(typeof value.search==='string'&&value.search.length>=1&&value.search.length<=80))&&
  Number.isSafeInteger(value.cursor)&&value.cursor>=0&&value.cursor<=1_000_000&&
  Number.isSafeInteger(value.limit)&&value.limit>=1&&value.limit<=50&&
  Number.isSafeInteger(value.issuedAtMs)&&Number.isSafeInteger(value.expiresAtMs)&&
  value.expiresAtMs>value.issuedAtMs&&value.expiresAtMs-value.issuedAtMs<=30_000&&HEX.test(value.signatureHex);
}
function iso(value){if(!(value instanceof Date)||Object.getPrototypeOf(value)!==Date.prototype||
 !Number.isFinite(value.getTime()))throw Error('invalid_staff_directory_sql_result');return value.toISOString();}
function row(value,kind){
 if(!plain(value)||value.record_kind!==kind||!UUID.test(value.enrollment_id??'')||
    typeof value.given_name!=='string'||value.given_name.length<1||value.given_name.length>80||
    typeof value.family_name!=='string'||value.family_name.length<1||value.family_name.length>160||
    typeof value.email!=='string'||value.email!==value.email.toLowerCase()||!EMAIL.test(value.email)||
    !ROLES.has(value.requested_role)||!STATES.has(value.enrollment_state))
  throw Error('invalid_staff_directory_sql_result');
 if(!(DISPLAY.test(value.operational_display_id??'')||
      (kind==='admin'&&value.enrollment_state==='revoked'&&value.operational_display_id===null)))
  throw Error('invalid_staff_directory_sql_result');
 return {enrollmentId:value.enrollment_id,givenName:value.given_name,familyName:value.family_name,
  email:value.email,operationalDisplayId:value.operational_display_id,role:value.requested_role,
  state:value.enrollment_state,createdAt:iso(value.created_at),updatedAt:iso(value.updated_at)};
}
function values(value){return [value.keyId,value.databaseRole,value.actorId,value.staffRole,value.operation,
 value.targetEnrollmentId,value.search,value.cursor,value.limit,value.issuedAtMs,value.expiresAtMs,
 value.signatureHex];}
async function read(query,value){
 if(typeof query!=='function'||!capability(value))throw Error('invalid_staff_directory_repository_input');
 const result=await query(STAFF_DIRECTORY_READ_SQL,values(value));
 if(!Array.isArray(result?.rows))throw Error('invalid_staff_directory_sql_result');
 return result.rows;
}

export function createStaffDirectoryRepository(){return Object.freeze({
 async list(query,value){
  if(value?.operation!=='admin_list')throw Error('invalid_staff_directory_repository_input');
  const rows=await read(query,value);if(rows.length>value.limit+1)throw Error('invalid_staff_directory_sql_result');
  const all=rows.map(item=>Object.freeze(row(item,'admin'))),items=all.slice(0,value.limit);
  return Object.freeze({version:1,items:Object.freeze(items),
   nextCursor:all.length>value.limit?value.cursor+value.limit:null});
 },
 async detail(query,value){
  if(value?.operation!=='admin_detail')throw Error('invalid_staff_directory_repository_input');
  const rows=await read(query,value);if(rows.length===0)throw Error('staff_directory_not_found');
  if(rows.length!==1)throw Error('invalid_staff_directory_sql_result');
  return Object.freeze({version:1,member:Object.freeze(row(rows[0],'admin'))});
 },
 async self(query,value){
  if(value?.operation!=='self_profile')throw Error('invalid_staff_directory_repository_input');
  const rows=await read(query,value);if(rows.length!==1)throw Error('staff_directory_forbidden');
  const profile=row(rows[0],'self');
  if(profile.state!=='active')throw Error('staff_directory_forbidden');
  return Object.freeze({version:1,profile:Object.freeze({givenName:profile.givenName,
   familyName:profile.familyName,email:profile.email,role:profile.role,
   operationalDisplayId:profile.operationalDisplayId})});
 },
});}
