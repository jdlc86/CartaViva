import {createHash, createHmac} from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const SIGNATURE=/^[0-9a-f]{64}$/;
const AUDIENCE='sabora.staff-code-maintenance.v1';

function exactDataRecord(value,fields) {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)return false;
  const keys=Reflect.ownKeys(value),allowed=new Set(fields);
  return keys.length===fields.length&&keys.every(key=>typeof key==='string'&&allowed.has(key)&&
    Object.prototype.propertyIsEnumerable.call(value,key)&&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}

const reasonHash=value=>value===null?'-':createHash('sha256').update(value,'utf8').digest('hex');
const signingInput=value=>[
  AUDIENCE,value.keyId,value.databaseRole,value.actorId.toLowerCase(),value.action,
  String(value.confirmed),reasonHash(value.reason),value.correlationId,
  String(value.issuedAtMs),String(value.expiresAtMs),
].join('\n');

export function createStaffCodeMaintenanceCapabilityIssuer({keyId,secret,databaseRole,
  ttlMs=15_000,clock=Date.now}={}) {
  if(!KEY.test(keyId??'')||!ROLE.test(databaseRole??'')||!(secret instanceof Uint8Array)||
    secret.byteLength<32||secret.byteLength>64||!Number.isSafeInteger(ttlMs)||ttlMs<1||
    ttlMs>30_000||typeof clock!=='function')throw Error('invalid_staff_code_maintenance_config');
  const key=Buffer.from(secret);
  return input=>{
    if(!exactDataRecord(input,['actorId','action','confirmed','reason','correlationId'])||
      !UUID.test(input.actorId??'')||
      !['preview','recover'].includes(input.action)||typeof input.confirmed!=='boolean'||
      !CORRELATION.test(input.correlationId??'')||
      !((input.action==='preview'&&input.confirmed===false&&input.reason===null)||
        (input.action==='recover'&&input.confirmed===true&&typeof input.reason==='string'&&
          input.reason===input.reason.trim()&&input.reason.length>=1&&input.reason.length<=500)))
      throw Error('invalid_staff_code_maintenance_input');
    const issuedAtMs=clock();
    if(!Number.isSafeInteger(issuedAtMs)||issuedAtMs<0||
      !Number.isSafeInteger(issuedAtMs+ttlMs))throw Error('invalid_staff_code_maintenance_clock');
    const value={keyId,databaseRole,actorId:input.actorId.toLowerCase(),
      action:input.action,confirmed:input.confirmed,reason:input.reason,
      correlationId:input.correlationId,issuedAtMs,expiresAtMs:issuedAtMs+ttlMs};
    return Object.freeze({...value,signatureHex:createHmac('sha256',key)
      .update(signingInput(value),'utf8').digest('hex')});
  };
}

export const STAFF_CODE_MAINTENANCE_SQL=`SELECT sabora.maintain_staff_employee_codes_authorized_candidate(
 $1::text,$2::text,$3::uuid,$4::text,$5::boolean,$6::text,$7::text,
 $8::bigint,$9::bigint,$10::text) AS result`;

export function createStaffCodeMaintenanceRepository({withTransaction}={}) {
  if(typeof withTransaction!=='function')throw Error('invalid_staff_code_maintenance_repository');
  return Object.freeze({
    async execute(capability) {
      if(!exactDataRecord(capability,['keyId','databaseRole','actorId','action','confirmed',
        'reason','correlationId','issuedAtMs','expiresAtMs','signatureHex'])||
        !KEY.test(capability.keyId??'')||!ROLE.test(capability.databaseRole??'')||
        !UUID.test(capability.actorId??'')||!['preview','recover'].includes(capability.action)||
        typeof capability.confirmed!=='boolean'||!CORRELATION.test(capability.correlationId??'')||
        !Number.isSafeInteger(capability.issuedAtMs)||!Number.isSafeInteger(capability.expiresAtMs)||
        capability.issuedAtMs<0||!Number.isSafeInteger(capability.expiresAtMs-capability.issuedAtMs)||
        capability.expiresAtMs-capability.issuedAtMs<1||
        capability.expiresAtMs-capability.issuedAtMs>30_000||
        !((capability.action==='preview'&&capability.confirmed===false&&capability.reason===null)||
          (capability.action==='recover'&&capability.confirmed===true&&
            typeof capability.reason==='string'&&capability.reason===capability.reason.trim()&&
            capability.reason.length>=1&&capability.reason.length<=500))||
        !SIGNATURE.test(capability.signatureHex??''))throw Error('invalid_staff_code_maintenance_input');
      const result=await withTransaction(query=>query(STAFF_CODE_MAINTENANCE_SQL,[
        capability.keyId,capability.databaseRole,capability.actorId,capability.action,
        capability.confirmed,capability.reason,capability.correlationId,
        capability.issuedAtMs,capability.expiresAtMs,capability.signatureHex,
      ]));
      const value=result?.rows?.[0]?.result;
      if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||
        value.action!==capability.action||typeof value.repeated!=='boolean'||
        !Number.isSafeInteger(value.eligibleCount)||value.eligibleCount<0||
        !Number.isSafeInteger(value.blockedCount)||value.blockedCount<0||
        !Number.isSafeInteger(value.releasedCount)||value.releasedCount<0||
        !Number.isSafeInteger(value.availableCount)||value.availableCount<0)
        throw Error('invalid_staff_code_maintenance_sql_result');
      return Object.freeze({...value});
    },
  });
}

export function createStaffCodeMaintenanceCoordinator({repository,issueCapability}={}) {
  if(!repository||typeof repository.execute!=='function'||typeof issueCapability!=='function')
    throw Error('invalid_staff_code_maintenance_coordinator');
  return Object.freeze({
    async execute(context,input) {
      const actorId=context?.verifiedIdentity?.userId;
      if(!UUID.test(actorId??'')||context?.verifiedStaff?.role!=='admin'||
        context.verifiedStaff.userId?.toLowerCase()!==actorId.toLowerCase())
        throw Error('staff_code_maintenance_forbidden');
      const actionDescriptor=input&&typeof input==='object'&&!Array.isArray(input)?
        Object.getOwnPropertyDescriptor(input,'action'):null;
      const action=actionDescriptor&&Object.hasOwn(actionDescriptor,'value')?
        actionDescriptor.value:null;
      const fields=action==='preview'?['action','correlationId']:
        ['action','reason','confirmed','correlationId'];
      if(!['preview','recover'].includes(action)||!exactDataRecord(input,fields)||
        !CORRELATION.test(input.correlationId??''))
        throw Error('invalid_staff_code_maintenance_request');
      const reason=action==='recover'&&typeof input.reason==='string'?input.reason.trim():null;
      const confirmed=action==='recover'&&input.confirmed===true;
      if(action==='recover'&&(!confirmed||typeof reason!=='string'||
        reason.length<1||reason.length>500))throw Error('invalid_staff_code_maintenance_request');
      return repository.execute(issueCapability({actorId,
        action,confirmed,reason,correlationId:input.correlationId}));
    },
  });
}

export function createStaffCodeMaintenanceHttpHandler({coordinator}={}) {
  if(!coordinator||typeof coordinator.execute!=='function')
    throw Error('invalid_staff_code_maintenance_http_config');
  return async (request,reply)=>{
    reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');
    try {
      const result=await coordinator.execute({verifiedIdentity:request.verifiedIdentity,
        verifiedStaff:request.verifiedStaff},request.body);
      return reply.code(200).send(result);
    } catch(error) {
      if(error?.message==='staff_code_maintenance_forbidden')
        return reply.code(403).send({error:'forbidden'});
      if(error?.message==='invalid_staff_code_maintenance_request')
        return reply.code(400).send({error:'invalid_staff_code_maintenance_request'});
      if(error?.message==='staff_code_maintenance_idempotency_conflict')
        return reply.code(409).send({error:'staff_code_maintenance_idempotency_conflict'});
      return reply.code(503).send({error:'staff_code_maintenance_unavailable'});
    }
  };
}

export const STAFF_CODE_MAINTENANCE_AUDIENCE=AUDIENCE;
