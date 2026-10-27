import {createHmac} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME=/^[a-z][a-z0-9_]{0,62}$/;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const ROLES=new Set(['admin','waiter','kitchen','root']);
const PICKUP_ACTIONS=new Set(['claim_pickup','cancel_pickup','correct_ready']);
const ACTIONS=new Set(['report_incident','resolve_incident','settle_cash','refund_cash','ack_dispatch','read_events',
 ...PICKUP_ACTIONS]);

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

export function createH6StaffCapabilityIssuer({keyId,secret,databaseRole,ttlMs=15_000,clock=Date.now}={}){
 if(!KEY.test(keyId??'')||!(secret instanceof Uint8Array)||secret.byteLength<32||secret.byteLength>64||
    !ROLE_NAME.test(databaseRole??'')||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>60_000||
    typeof clock!=='function')throw Error('invalid_h6_capability_config');
 const key=Buffer.from(secret);
 return function issue(input){
  const pickup=PICKUP_ACTIONS.has(input?.action),keys=pickup?6:5;
  if(!plain(input)||Reflect.ownKeys(input).length!==keys||
     !['actorId','staffRole','action','targetId','correlationId'].every(name=>Object.hasOwn(input,name))||
     !UUID.test(input.actorId)||!ROLES.has(input.staffRole)||!ACTIONS.has(input.action)||
     !UUID.test(input.targetId)||!CORRELATION.test(input.correlationId)||
     (pickup&&(!Object.hasOwn(input,'expectedVersion')||!Number.isSafeInteger(input.expectedVersion)||
       input.expectedVersion<1)))
   throw Error('invalid_h6_capability_input');
  const issuedAtMs=clock(),expiresAtMs=issuedAtMs+ttlMs;
  if(!Number.isSafeInteger(issuedAtMs)||issuedAtMs<0||!Number.isSafeInteger(expiresAtMs))
   throw Error('invalid_h6_capability_clock');
  const capability={keyId,databaseRole,actorId:input.actorId.toLowerCase(),
   staffRole:input.staffRole,action:input.action,targetId:input.targetId.toLowerCase(),
   ...(pickup?{expectedVersion:input.expectedVersion}:{}),correlationId:input.correlationId,issuedAtMs,expiresAtMs};
  const payload=pickup
   ?['h6-pickup-v1',databaseRole,capability.actorId,capability.staffRole,capability.action,
     capability.targetId,String(capability.expectedVersion),capability.correlationId,
     String(issuedAtMs),String(expiresAtMs)].join('\n')
   :['h6-v1',databaseRole,capability.actorId,capability.staffRole,capability.action,
     capability.targetId,capability.correlationId,String(issuedAtMs),String(expiresAtMs)].join('\n');
  return Object.freeze({...capability,signatureHex:createHmac('sha256',key).update(payload,'utf8').digest('hex')});
 };
}

export const H6_STAFF_ACTIONS=Object.freeze([...ACTIONS]);
