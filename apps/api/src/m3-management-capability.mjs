import {createHash,createHmac} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const STAFF=new Set(['admin','root','waiter']);
const ACTIONS=new Set(['tables.read','table.create','table.update','table.readiness',
 'table.qr_rotate','table.qr_revoke','table.occupancy','catalog.read',
 'catalog.category_create','catalog.category_reorder','catalog.category_visibility',
 'catalog.item_save','catalog.item_publish','catalog.item_withdraw','finance.read',
 'comms.read','comms.manage']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const hash=body=>createHash('sha256').update(body,'utf8').digest('hex');
const message=value=>['m3-management-v1',value.databaseRole,value.actorId,value.staffRole,
 value.action,value.requestId,value.bodyHashHex,String(value.issuedAtMs),
 String(value.expiresAtMs)].join('\n');

export function createM3ManagementCapabilityIssuer({keyId,secret,databaseRole,
 ttlMs=15_000,clock=Date.now}={}){
 if(!KEY.test(keyId??'')||!(secret instanceof Uint8Array)||secret.byteLength<32||secret.byteLength>64||
    !ROLE.test(databaseRole??'')||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>60_000||
    typeof clock!=='function')throw Error('invalid_m3_management_capability_config');
 const key=Buffer.from(secret);
 return input=>{
  if(!plain(input)||Reflect.ownKeys(input).length!==5||
     !['actorId','staffRole','action','requestId','body'].every(name=>Object.hasOwn(input,name))||
     !UUID.test(input.actorId)||!STAFF.has(input.staffRole)||!ACTIONS.has(input.action)||
     !UUID.test(input.requestId)||typeof input.body!=='string'||
     Buffer.byteLength(input.body,'utf8')>(input.action==='comms.manage'?200_000:65_536))
   throw Error('invalid_m3_management_capability_input');
  const issuedAtMs=clock(),expiresAtMs=issuedAtMs+ttlMs;
  if(!Number.isSafeInteger(issuedAtMs)||issuedAtMs<0||!Number.isSafeInteger(expiresAtMs))
   throw Error('invalid_m3_management_capability_clock');
  const capability={keyId,databaseRole,actorId:input.actorId.toLowerCase(),
   staffRole:input.staffRole,action:input.action,requestId:input.requestId.toLowerCase(),
   bodyHashHex:hash(input.body),issuedAtMs,expiresAtMs};
  return Object.freeze({...capability,signatureHex:createHmac('sha256',key)
   .update(message(capability),'utf8').digest('hex')});
 };
}

export const M3_MANAGEMENT_ACTIONS=Object.freeze([...ACTIONS]);
