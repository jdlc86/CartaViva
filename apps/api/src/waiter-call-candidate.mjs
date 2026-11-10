// CV-014 waiter calls. Opt-in only; no route in the health-only server.
// Server-created HMAC binds staff role, physical SQL login, call and action.
// Customer identity is the hash of an HttpOnly cookie, never a public code.
import {createHmac,randomUUID} from 'node:crypto';
import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';
import {hashCustomerSessionToken} from './customer-session.mjs';
import {M2_RUNTIME_IDENTITY_SQL,M2_RUNTIME_FUNCTIONS_SQL} from './m2-runtime-capabilities.mjs';
import {createRoleScopedPostgresTransaction} from './role-scoped-postgres.mjs';

export const WAITER_CALL_CUSTOMER_ROLE='sabora_waiter_call_customer_runtime';
export const WAITER_CALL_STAFF_ROLE='sabora_waiter_call_staff_runtime';
export const WAITER_CALL_CUSTOMER_SQL=
 'SELECT sabora.waiter_call_customer_candidate($1::bytea,$2::uuid,$3::text,$4::uuid) AS result';
export const WAITER_CALL_STAFF_SQL=
 'SELECT sabora.waiter_call_staff_candidate($1::jsonb,$2::text,$3::uuid) AS result';
const CUSTOMER_RPC='sabora.waiter_call_customer_candidate(bytea,uuid,text,uuid)';
const STAFF_RPC='sabora.waiter_call_staff_candidate(jsonb,text,uuid)';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
const KEY=/^[A-Za-z0-9_-]{8,64}$/;
const STAFF_ROLES=new Set(['waiter']);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=code=>Object.assign(Error(code),{code});
const exact=(body,fields)=>plain(body)&&Object.keys(body).length===fields.length&&
 fields.every(k=>Object.hasOwn(body,k));
const selected=async(query,sql,args)=>{
 const result=await query(sql,args);
 const value=result?.rows?.[0]?.result;
 if(!result||result.rows.length!==1||!plain(value))
  throw fail('invalid_waiter_call_result');
 return value;
};

export function createWaiterCallStaffIssuer({keyId,secret,databaseRole,
 ttlMs=15000,clock=Date.now}={}){
 if(!KEY.test(keyId??'')||!(secret instanceof Uint8Array)||
  secret.byteLength<32||secret.byteLength>64||!LOGIN.test(databaseRole??'')||
  !Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>60000||typeof clock!=='function')
  throw fail('invalid_waiter_call_issuer');
 const key=Buffer.from(secret);
 return ({actorId,staffRole,action,requestId,callId=null})=>{
  if(!UUID.test(actorId??'')||!UUID.test(requestId??'')||
     !STAFF_ROLES.has(staffRole)||!['list','attend'].includes(action)||
     (action==='list'&&callId!==null)||(action==='attend'&&!UUID.test(callId??'')))
   throw fail('invalid_waiter_call_capability_input');
  const issuedAtMs=clock(),expiresAtMs=issuedAtMs+ttlMs;
  if(!Number.isSafeInteger(issuedAtMs)||!Number.isSafeInteger(expiresAtMs)||issuedAtMs<0)
   throw fail('invalid_waiter_call_clock');
  const cap={keyId,databaseRole,actorId:actorId.toLowerCase(),staffRole,action,
   requestId:requestId.toLowerCase(),callId:callId===null?'-':callId.toLowerCase(),
   issuedAtMs,expiresAtMs};
  const message=['sabora-waiter-call-v1',databaseRole,cap.actorId,staffRole,action,
   cap.requestId,cap.callId,String(issuedAtMs),String(expiresAtMs)].join('\n');
  return Object.freeze({...cap,signatureHex:createHmac('sha256',key)
   .update(message,'utf8').digest('hex')});
 };
}

// Each technical LOGIN must be an isolated, non-bypass/non-inheriting principal
// with one exact SET ROLE and no directly reachable business tables.
export async function assertWaiterCallRuntimeIdentity({pool,expectedLogin,kind}={}){
 if(!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??'')||
  !['customer','staff'].includes(kind))throw fail('invalid_waiter_call_runtime');
 const role=kind==='customer'?WAITER_CALL_CUSTOMER_ROLE:WAITER_CALL_STAFF_ROLE;
 const signature=kind==='customer'?CUSTOMER_RPC:STAFF_RPC;
 let connection,valid=false;
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
    identity.set_roles[0]!==role)throw fail('invalid_waiter_call_runtime');
  const allowed=(await connection.query(M2_RUNTIME_FUNCTIONS_SQL,[role]))?.rows?.[0]?.names;
  const direct=(await connection.query(M2_RUNTIME_FUNCTIONS_SQL,[expectedLogin]))?.rows?.[0]?.names;
  if(!Array.isArray(allowed)||allowed.length!==1||allowed[0]!==signature||
     !Array.isArray(direct)||direct.length!==0)throw fail('invalid_waiter_call_runtime');
  valid=true;
  return Object.freeze({validated:true,kind,role,login:expectedLogin});
 }catch{throw fail('invalid_waiter_call_runtime');}
 finally{if(connection)try{connection.release(!valid);}catch{}}
}

export function createWaiterCallRepository({customerTransaction,staffTransaction,
 issueStaffCapability,newId=randomUUID}={}){
 if(typeof customerTransaction!=='function'||typeof staffTransaction!=='function'||
  typeof issueStaffCapability!=='function'||typeof newId!=='function')
  throw fail('invalid_waiter_call_repository');
 const customerCall=({token,tableId,action,requestId=null})=>{
  const hash=hashCustomerSessionToken(token);
  if(!hash||!UUID.test(tableId??'')||!['read','request'].includes(action)||
     (action==='request'&&!UUID.test(requestId??''))||
     (action==='read'&&requestId!==null))throw fail('invalid_waiter_call_request');
  return customerTransaction(query=>selected(query,WAITER_CALL_CUSTOMER_SQL,
   [hash,tableId.toLowerCase(),action,requestId?.toLowerCase()??null]));
 };
 const staffCall=({verifiedIdentity,verifiedStaff,action,callId=null,requestId=newId()})=>{
  const actorId=verifiedIdentity?.userId,staffRole=verifiedStaff?.role;
  if(!UUID.test(actorId??'')||verifiedStaff?.userId!==actorId||
    !STAFF_ROLES.has(staffRole)||!['list','attend'].includes(action)||
    (action==='attend'&&!UUID.test(callId??''))||!UUID.test(requestId??''))
   throw fail('waiter_call_forbidden');
  const cap=issueStaffCapability({actorId,staffRole,action,callId,requestId});
  return staffTransaction(query=>selected(query,WAITER_CALL_STAFF_SQL,
   [JSON.stringify(cap),action,callId]));
 };
 return Object.freeze({customerCall,staffCall});
}

export function createWaiterCallComposition({customerPool,staffPool,
 issueStaffCapability}={}){
 const customerTransaction=createRoleScopedPostgresTransaction({
  pool:customerPool,role:WAITER_CALL_CUSTOMER_ROLE,
  allowedSql:new Set([WAITER_CALL_CUSTOMER_SQL])});
 const staffTransaction=createRoleScopedPostgresTransaction({
  pool:staffPool,role:WAITER_CALL_STAFF_ROLE,
  allowedSql:new Set([WAITER_CALL_STAFF_SQL])});
 return createWaiterCallRepository({customerTransaction,staffTransaction,issueStaffCapability});
}

const failure=(reply,e)=>{
 const code=e?.code??e?.message;
 if(code==='42501'||['waiter_call_unauthorized','waiter_call_context_forbidden',
   'waiter_call_forbidden'].includes(code))return reply.code(403).send({error:'waiter_call_forbidden'});
 if(code==='P0002')return reply.code(404).send({error:'waiter_call_not_found'});
 if(code==='40900'||code==='23505')return reply.code(409).send({error:'waiter_call_conflict'});
 if(code==='22023'||code==='invalid_waiter_call_request')return reply.code(400).send({error:'invalid_waiter_call_request'});
 return reply.code(503).send({error:'waiter_call_unavailable'});
};
const headers=reply=>{reply.header('Cache-Control','no-store');
 reply.header('X-Content-Type-Options','nosniff');};

// Register as independent opt-in customer and staff subtrees. API must also
// enforce session / verified staff identity before reaching the SQL functions.
export function registerWaiterCallHttp(app,{cookieAuth,forRoles,repository}={}){
 if(typeof app?.register!=='function'||typeof forRoles!=='function'||
  typeof cookieAuth?.authenticate!=='function'||typeof cookieAuth?.requireSameOrigin!=='function'||
  typeof repository?.customerCall!=='function'||typeof repository?.staffCall!=='function')
  throw fail('invalid_waiter_call_http');
 app.register(async scope=>{
  scope.addHook('preHandler',async(request,reply)=>{
   headers(reply);
   if(request.method!=='GET'&&!cookieAuth.requireSameOrigin(request,reply))return;
   await cookieAuth.authenticate(request,reply);
  });
  scope.get('/waiter-calls',async(request,reply)=>{
   if(!exact(request.query,['tableId'])||!UUID.test(request.query.tableId))
    return reply.code(400).send({error:'invalid_waiter_call_request'});
   try{return reply.send(await repository.customerCall({
    token:readCustomerCookie(request.headers.cookie),tableId:request.query.tableId,action:'read'}));}
   catch(e){return failure(reply,e);}
  });
  scope.post('/waiter-calls',{bodyLimit:1024},async(request,reply)=>{
   if(!exact(request.body,['tableId','requestId'])||
     !UUID.test(request.body.tableId)||!UUID.test(request.body.requestId))
    return reply.code(400).send({error:'invalid_waiter_call_request'});
   try{return reply.code(200).send(await repository.customerCall({
    token:readCustomerCookie(request.headers.cookie),...request.body,action:'request'}));}
   catch(e){return failure(reply,e);}
  });
 },{prefix:'/api/v1/customer'});
 const guard=forRoles(['waiter']);
 app.get('/api/v1/operations/waiter-calls',{preHandler:guard},async(request,reply)=>{
  headers(reply);
  if(!exact(request.query,[]))return reply.code(400).send({error:'invalid_waiter_call_request'});
  try{return reply.send(await repository.staffCall({
   verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff,
   action:'list'}));}catch(e){return failure(reply,e);}
 });
 app.post('/api/v1/operations/waiter-calls/:callId/attend',
  {preHandler:guard,bodyLimit:1024},async(request,reply)=>{
   headers(reply);
   if(!UUID.test(request.params?.callId??'')||
     !exact(request.body,['requestId'])||!UUID.test(request.body.requestId))
    return reply.code(400).send({error:'invalid_waiter_call_request'});
   try{return reply.send(await repository.staffCall({
    verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff,
    action:'attend',callId:request.params.callId,requestId:request.body.requestId}));
   }catch(e){return failure(reply,e);}
  });
}
