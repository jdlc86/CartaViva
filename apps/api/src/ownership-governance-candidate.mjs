// Opt-in governance surface. Never mount on the health-only server.
// No SQL table access from browser, ROOT does not become a routine writer.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {M2_RUNTIME_IDENTITY_SQL,M2_RUNTIME_FUNCTIONS_SQL} from './m2-runtime-capabilities.mjs';

export const OWNERSHIP_ROLE='sabora_ownership_runtime';
export const OWNERSHIP_SQL='SELECT sabora.admin_ownership_action_candidate($1::jsonb,$2::text,$3::text) AS result';
const SIGNATURE='sabora.admin_ownership_action_candidate(jsonb,text,text)';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
const ACTIONS=new Set(['request','offer','accept','reject','cancel','force']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(value,names)=>plain(value)&&Reflect.ownKeys(value).length===names.length&&
 names.every(name=>Object.hasOwn(value,name));
const error=code=>Object.assign(Error(code),{code});

export function createOwnershipCapabilityIssuer({keyId,secret,databaseRole,
 ttlMs=15_000,clock=Date.now}={}){
 if(!KEY.test(keyId??'')||!(secret instanceof Uint8Array)||
    secret.byteLength<32||secret.byteLength>64||!LOGIN.test(databaseRole??'')||
    !Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>60_000||typeof clock!=='function')
  throw error('invalid_ownership_issuer');
 const key=Buffer.from(secret);
 return ({actorId,staffRole,action,requestId,body})=>{
  if(!UUID.test(actorId??'')||!UUID.test(requestId??'')||
     !['admin','root'].includes(staffRole)||
     !['ownership.read','ownership.manage'].includes(action)||
     typeof body!=='string'||Buffer.byteLength(body,'utf8')>4096)
   throw error('invalid_ownership_capability_input');
  const issuedAtMs=clock(),expiresAtMs=issuedAtMs+ttlMs;
  if(!Number.isSafeInteger(issuedAtMs)||issuedAtMs<0||
     !Number.isSafeInteger(expiresAtMs))throw error('invalid_ownership_clock');
  const cap={keyId,databaseRole,actorId:actorId.toLowerCase(),staffRole,action,
   requestId:requestId.toLowerCase(),
   bodyHashHex:createHash('sha256').update(body,'utf8').digest('hex'),
   issuedAtMs,expiresAtMs};
  const message=['sabora-ownership-v1',cap.databaseRole,cap.actorId,cap.staffRole,
   cap.action,cap.requestId,cap.bodyHashHex,String(issuedAtMs),String(expiresAtMs)].join('\n');
  return Object.freeze({...cap,signatureHex:createHmac('sha256',key)
   .update(message,'utf8').digest('hex')});
 };
}

export function validateOwnershipAction(input){
 if(!exact(input,['requestId','action','proposalId','targetUserId','reason'])||
    !UUID.test(input.requestId??'')||!ACTIONS.has(input.action)||
    (input.proposalId!==null&&!UUID.test(input.proposalId))||
    (input.targetUserId!==null&&!UUID.test(input.targetUserId))||
    (input.reason!==null&&typeof input.reason!=='string'))
  throw error('invalid_ownership_request');
 const proposal=['accept','reject','cancel'].includes(input.action);
 const target=['offer','force'].includes(input.action);
 const reason=input.action==='force';
 if((proposal&&!input.proposalId)||(!proposal&&input.proposalId!==null)||
    (target&&!input.targetUserId)||(!target&&input.targetUserId!==null)||
    (reason&&(!input.reason?.trim()||input.reason.trim().length>1000))||
    (!reason&&input.reason!==null))
  throw error('invalid_ownership_request');
 return Object.freeze({requestId:input.requestId.toLowerCase(),
  action:input.action,proposalId:input.proposalId?.toLowerCase()??null,
  targetUserId:input.targetUserId?.toLowerCase()??null,
  reason:input.reason?.trim()??null});
}

export async function assertOwnershipRuntimeIdentity({pool,expectedLogin}={}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??''))
  throw error('invalid_ownership_runtime');
 let connection,good=false;
 try{
  connection=await pool.connect();
  const identity=(await connection.query(M2_RUNTIME_IDENTITY_SQL))?.rows?.[0];
  if(!identity||identity.login_role!==expectedLogin||
     identity.effective_role!==expectedLogin||identity.can_login!==true||
     identity.inherit_role!==false||identity.superuser!==false||
     identity.bypass_rls!==false||identity.create_db!==false||
     identity.create_role!==false||identity.replication!==false||
     identity.database_create!==false||identity.schema_create!==false||
     identity.direct_relations!==false||identity.direct_sequences!==false||
     !Array.isArray(identity.set_roles)||identity.set_roles.length!==1||
     identity.set_roles[0]!==OWNERSHIP_ROLE)
   throw error('invalid_ownership_runtime');
  const roles=(await connection.query(M2_RUNTIME_FUNCTIONS_SQL,[OWNERSHIP_ROLE]))?.rows?.[0]?.names;
  const login=(await connection.query(M2_RUNTIME_FUNCTIONS_SQL,[expectedLogin]))?.rows?.[0]?.names;
  if(!Array.isArray(roles)||roles.length!==1||roles[0]!==SIGNATURE||
     !Array.isArray(login)||login.length!==0)
   throw error('invalid_ownership_runtime');
  good=true;return Object.freeze({validated:true,role:OWNERSHIP_ROLE,login:expectedLogin});
 }catch{throw error('invalid_ownership_runtime');}
 finally{if(connection)try{connection.release(!good);}catch{}}
}

function verifiedActor(verified){
 const actor=verified?.verifiedIdentity?.userId;
 const staff=verified?.verifiedStaff;
 if(!UUID.test(actor??'')||!['admin','root'].includes(staff?.role)||
    staff.userId!==actor)throw error('ownership_forbidden');
 return {actorId:actor.toLowerCase(),staffRole:staff.role};
}
const one=answer=>{
 if(!answer||!Array.isArray(answer.rows)||answer.rows.length!==1||
    !plain(answer.rows[0]?.result))throw error('invalid_ownership_projection');
 return answer.rows[0].result;
};

export function createOwnershipGovernanceRepository({withTransaction,issueCapability,newId=randomUUID}={}){
 if(typeof withTransaction!=='function'||typeof issueCapability!=='function'||
    typeof newId!=='function')throw error('invalid_ownership_repository');
 const invoke=(actor,action,requestId,body)=>{
  const cap=issueCapability({...actor,action:action==='read'?'ownership.read':'ownership.manage',
   requestId,body});
  return withTransaction(query=>query(OWNERSHIP_SQL,[JSON.stringify(cap),action,body]).then(one));
 };
 return Object.freeze({
  read(verified){
   const actor=verifiedActor(verified),requestId=newId();
   if(!UUID.test(requestId))throw error('invalid_ownership_request');
   return invoke(actor,'read',requestId,'ownership.read');
  },
  transition(verified,input){
   const actor=verifiedActor(verified),valid=validateOwnershipAction(input);
   const {requestId,action,...payload}=valid;
   return invoke(actor,action,requestId,JSON.stringify({action,...payload}));
  }
 });
}

function replyError(reply,failure){
 const code=failure?.code??failure?.message;
 if(code==='42501'||code==='ownership_forbidden')return reply.code(403).send({error:'forbidden'});
 if(code==='23505'||code==='40900')return reply.code(409).send({error:'ownership_conflict'});
 if(code==='22023'||code==='invalid_ownership_request')return reply.code(400).send({error:'invalid_ownership_request'});
 return reply.code(503).send({error:'ownership_unavailable'});
}
const verified=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});

export function registerOwnershipGovernanceHttp(app,{forRoles,repository}={}){
 if(typeof app?.get!=='function'||typeof app?.post!=='function'||
    typeof forRoles!=='function'||typeof repository?.read!=='function'||
    typeof repository?.transition!=='function')throw error('invalid_ownership_http');
 const guards=forRoles(['admin','root']);
 const headers=reply=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
 };
 app.get('/api/v1/admin/ownership',{preHandler:guards},async(request,reply)=>{
  headers(reply);
  if(!plain(request.query)||Reflect.ownKeys(request.query).length)
   return reply.code(400).send({error:'invalid_ownership_request'});
  try{return reply.code(200).send(await repository.read(verified(request)));}
  catch(failure){return replyError(reply,failure);}
 });
 app.post('/api/v1/admin/ownership/actions',{preHandler:guards,bodyLimit:4096},
  async(request,reply)=>{
   headers(reply);
   let action;
   try{action=validateOwnershipAction(request.body);}
   catch{return reply.code(400).send({error:'invalid_ownership_request'});}
   try{return reply.code(200).send(await repository.transition(verified(request),action));}
   catch(failure){return replyError(reply,failure);}
  });
}
