import {createHash,createHmac} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID=/^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME=/^[a-z][a-z0-9_]{0,62}$/;
const ROLES=new Set(['admin','waiter','kitchen']);
const OPERATIONS=new Set(['admin_list','admin_detail','self_profile']);
const AUDIENCE='sabora.staff-directory-read.v1';
const MAX_TTL_MS=30_000;

function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==keys.length)
  return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)return false;
 return keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');});
}
export function normalizeStaffDirectorySearch(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||/[\p{Cc}\p{Cf}]/u.test(value))throw Error('invalid_staff_directory_search');
 const normalized=value.normalize('NFC').trim().replace(/\s+/gu,' ');
 if(normalized.length<1||normalized.length>80)
  throw Error('invalid_staff_directory_search');
 return normalized;
}
function searchHash(value){return value===null?'-':createHash('sha256').update(value,'utf8').digest('hex');}
function valid(value){
 if(!UUID.test(value.actorId)||!ROLES.has(value.staffRole)||!OPERATIONS.has(value.operation)||
    (value.targetEnrollmentId!==null&&!UUID.test(value.targetEnrollmentId))||
    value.search!==normalizeStaffDirectorySearch(value.search)||
    !Number.isSafeInteger(value.cursor)||value.cursor<0||value.cursor>1_000_000||
    !Number.isSafeInteger(value.limit)||value.limit<1||value.limit>50)return false;
 if(value.operation==='admin_list')return value.staffRole==='admin'&&value.targetEnrollmentId===null;
 if(value.operation==='admin_detail')return value.staffRole==='admin'&&
  value.targetEnrollmentId!==null&&value.search===null&&value.cursor===0&&value.limit===1;
 return value.targetEnrollmentId===null&&value.search===null&&value.cursor===0&&value.limit===1;
}
function message(value){return [AUDIENCE,value.keyId,value.databaseRole,value.actorId.toLowerCase(),
 value.staffRole,value.operation,value.targetEnrollmentId?.toLowerCase()??'-',searchHash(value.search),
 String(value.cursor),String(value.limit),String(value.issuedAtMs),String(value.expiresAtMs)].join('\n');}

export function createStaffDirectoryCapabilityIssuer({keyId,secret,databaseRole,ttlMs=15_000,clock=Date.now}={}){
 if(!KEY_ID.test(keyId??'')||!ROLE_NAME.test(databaseRole??'')||!(secret instanceof Uint8Array)||
    secret.byteLength<32||secret.byteLength>64||!Number.isSafeInteger(ttlMs)||ttlMs<1||
    ttlMs>MAX_TTL_MS||typeof clock!=='function')throw Error('invalid_staff_directory_capability_config');
 const key=Buffer.from(secret);
 return input=>{
  const keys=['actorId','staffRole','operation','targetEnrollmentId','search','cursor','limit'];
  if(!exact(input,keys))throw Error('invalid_staff_directory_capability_input');
  let normalizedSearch;try{normalizedSearch=normalizeStaffDirectorySearch(input.search);}catch{
   throw Error('invalid_staff_directory_capability_input');}
  const normalized={...input,search:normalizedSearch};
  if(!valid(normalized))throw Error('invalid_staff_directory_capability_input');
  const issuedAtMs=clock(),expiresAtMs=issuedAtMs+ttlMs;
  if(!Number.isSafeInteger(issuedAtMs)||issuedAtMs<0||!Number.isSafeInteger(expiresAtMs))
   throw Error('invalid_staff_directory_capability_clock');
  const capability={keyId,databaseRole,actorId:input.actorId.toLowerCase(),staffRole:input.staffRole,
   operation:input.operation,targetEnrollmentId:input.targetEnrollmentId?.toLowerCase()??null,
   search:normalizedSearch,cursor:input.cursor,limit:input.limit,issuedAtMs,expiresAtMs};
  return Object.freeze({...capability,signatureHex:createHmac('sha256',key)
   .update(message(capability),'utf8').digest('hex')});
 };
}

export const STAFF_DIRECTORY_CAPABILITY_AUDIENCE=AUDIENCE;
