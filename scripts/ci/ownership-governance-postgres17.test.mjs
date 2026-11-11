// Integrated governance gate, backed only by the PG17 container removed by CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {randomUUID,randomBytes,generateKeyPairSync,sign,createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createCustomerCookieAuth} from '../../apps/api/src/customer-cookie-session-candidate.mjs';
import {createCustomerSessionVerifier} from '../../apps/api/src/customer-session-verifier.mjs';
import {hashCustomerSessionToken} from '../../apps/api/src/customer-session.mjs';
import {assertWaiterCallRuntimeIdentity,createWaiterCallStaffIssuer,
 createWaiterCallComposition,registerWaiterCallHttp,
 WAITER_CALL_CUSTOMER_ROLE,WAITER_CALL_STAFF_ROLE}
 from '../../apps/api/src/waiter-call-candidate.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createM3ManagementCapabilityIssuer} from '../../apps/api/src/m3-management-capability.mjs';
import {M3_TABLES_ROLE,M3_CATALOG_ROLE,assertM3TablesCapability,
 assertM3CatalogCapability} from '../../apps/api/src/m3-runtime-capabilities.mjs';
import {createM3TablesRepository,createM3CatalogRepository,createM3FinanceRepository,
 READ_M3_TABLES_SQL,MANAGE_M3_TABLE_SQL,OCCUPANCY_M3_TABLE_SQL,
 READ_M3_CATALOG_SQL,MANAGE_M3_CATALOG_SQL,READ_M3_FINANCE_SQL}
 from '../../apps/api/src/m3-management-repository.mjs';
import {registerM3ManagementHttp} from '../../apps/api/src/m3-management-http.mjs';
import {M5_COMMS_ADMIN_ROLE,M5_COMMS_PUBLIC_ROLE,READ_M5_COMMS_ADMIN_SQL,
 MANAGE_M5_COMMS_SQL,READ_M5_COMMS_PUBLIC_SQL,assertM5CommunicationsCapability,
 createM5CommunicationsRepositories,registerM5CommunicationsHttp}
 from '../../apps/api/src/m5-communications.mjs';
import {OWNERSHIP_ROLE,OWNERSHIP_SQL,createOwnershipCapabilityIssuer,
 assertOwnershipRuntimeIdentity,createOwnershipGovernanceRepository,
 registerOwnershipGovernanceHttp} from '../../apps/api/src/ownership-governance-candidate.mjs';

const target=process.env.SABORA_CI_PG_URL,mod=process.env.SABORA_CI_PG_MODULE;
if(process.env.GITHUB_ACTIONS!=='true'||!target||!mod||!isDisposablePgModulePath(mod))
 throw Error('disposable_ownership_harness_required');
const uri=new URL(target);
if(uri.protocol!=='postgresql:'||uri.hostname!=='127.0.0.1'||uri.username!=='postgres'||
 uri.password!=='sabora_ci_ephemeral_only'||uri.pathname!=='/postgres'||!uri.port||uri.search||uri.hash)
 throw Error('unsafe_ownership_harness_target');
const {Pool}=createRequire(import.meta.url)(mod);
const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');

test('PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs, transfer, ROOT force and stale writer denial',
 {timeout:180_000},async()=>{
 const suffix=process.pid.toString(36),login='sabora_owner_sql_'+suffix,
  staffLogin='sabora_owner_staff_'+suffix,keyId='ownership_ci_'+suffix;
 const customerLogin='sabora_dual_customer_'+suffix,
  waiterLogin='sabora_dual_waiter_'+suffix,
  tablesLogin='sabora_dual_tables_'+suffix,
  catalogLogin='sabora_dual_catalog_'+suffix,
  commsAdminLogin='sabora_dual_comms_admin_'+suffix,
  commsPublicLogin='sabora_dual_comms_public_'+suffix;
 const customerId=randomUUID(),waiterId=randomUUID(),tableId=randomUUID();
 const customerToken=randomBytes(32).toString('base64url');
 const qrToken=randomBytes(32).toString('base64url');
 const visitKey='DUAL'+randomBytes(12).toString('hex');
 const clientOrigin='http://127.0.0.1:4178';
 const password='sabora_governance_ci_'+randomBytes(16).toString('hex');
 const admin=new Pool({connectionString:target,max:3});
 const [a,b,c,d]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 const secret=randomBytes(32),pools=[];
 let api,vite,clientVite,browser,clientContext,shortApi,originalOwner=null;
 try{
  originalOwner=(await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id;
  let root=(await admin.query("SELECT user_id FROM sabora.staff_members WHERE role='root' AND state='active'")).rows[0]?.user_id;
  if(!root){root=randomUUID();await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'root','active')",[root]);}
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active'),($2,'admin','active'),($3,'admin','active'),($4,'admin','active')",[a,b,c,d]);
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'waiter','active')",[waiterId]);
  const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXY';
  const publicId='SB-'+Array.from(randomBytes(12),v=>alphabet[v%alphabet.length]).join('');
  await admin.query("INSERT INTO sabora.customer_profiles(id,public_id,alias) VALUES($1,$2,'Integración')",[customerId,publicId]);
  await admin.query("INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '2 hours')",
   [customerId,hashCustomerSessionToken(customerToken)]);
  await admin.query("INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,ordering_state,readiness_state) VALUES($1,9713,4,$2,'paused','LISTA')",
   [tableId,createHash('sha256').update(qrToken).digest()]);
  const tableSession=(await admin.query('SELECT session_id FROM sabora.dining_tables WHERE id=$1',[tableId])).rows[0].session_id;
  await admin.query("INSERT INTO sabora.customer_table_visits(table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,granted_at,expires_at) VALUES($1,$2,$3,$4,$5,1,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')",
   [tableId,tableSession,customerId,visitKey,customerId]);
  // Real human identities already defined by the staff enrollment contract.
  for(const [user,given,family,code] of [[a,'Alicia','Molina','Z9A'],
    [b,'Bruno','Romero','Z9B'],[c,'Clara','Rivera','Z9C']]){
   const stamp=new Date().toISOString();
   await admin.query(`INSERT INTO sabora.staff_enrollments(
     id,invitee_email_hash,requested_role,state,auth_user_id,invite_token_hash,
     credential_evidence_hash,created_by,created_at,last_invited_at,accepted_at,
     credential_registered_at,activated_at,updated_at,given_name,family_name,
     employee_code,operational_display_id)
     VALUES($1,$2,'admin','active',$3,$4,$5,$6,$7,$7,$7,$7,$7,$7,$8,$9,$10,$11)`,
     [randomUUID(),randomBytes(32),user,randomBytes(32),randomBytes(32),root,
      stamp,given,family,code,given[0].toUpperCase()+family[0].toUpperCase()+'-'+code]);
  }
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[a]);
  await admin.query("INSERT INTO sabora.order_operation_signing_keys(key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')",[keyId,secret]);
  for(const name of [login,staffLogin,customerLogin,waiterLogin,
   tablesLogin,catalogLogin,commsAdminLogin,commsPublicLogin])
   await admin.query('CREATE ROLE '+name+" LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
  await admin.query('GRANT '+OWNERSHIP_ROLE+' TO '+login+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+M3_TABLES_ROLE+' TO '+tablesLogin+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+M3_CATALOG_ROLE+' TO '+catalogLogin+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+M5_COMMS_ADMIN_ROLE+' TO '+commsAdminLogin+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+M5_COMMS_PUBLIC_ROLE+' TO '+commsPublicLogin+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+WAITER_CALL_CUSTOMER_ROLE+' TO '+customerLogin+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+WAITER_CALL_STAFF_ROLE+' TO '+waiterLogin+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT USAGE ON SCHEMA sabora TO '+staffLogin);
  await admin.query('GRANT SELECT(user_id,role,state) ON sabora.staff_members TO '+staffLogin);
  await admin.query('CREATE POLICY ci_owner_staff_'+suffix+' ON sabora.staff_members FOR SELECT TO '+staffLogin+' USING(true)');
  for(const name of [login,staffLogin,customerLogin,waiterLogin,
   tablesLogin,catalogLogin,commsAdminLogin,commsPublicLogin]){
   const url=new URL(target);url.username=name;url.password=password;
   pools.push(new Pool({connectionString:url.toString(),max:3,connectionTimeoutMillis:3000,
    options:'-c statement_timeout=15000'}));
  }
  await assertOwnershipRuntimeIdentity({pool:pools[0],expectedLogin:login});
  await assertM3TablesCapability({pool:pools[4],expectedLogin:tablesLogin});
  await assertM3CatalogCapability({pool:pools[5],expectedLogin:catalogLogin});
  await assertM5CommunicationsCapability({pool:pools[6],expectedLogin:commsAdminLogin,kind:'admin'});
  await assertM5CommunicationsCapability({pool:pools[7],expectedLogin:commsPublicLogin,kind:'public'});
  await assertWaiterCallRuntimeIdentity({pool:pools[2],expectedLogin:customerLogin,kind:'customer'});
  await assertWaiterCallRuntimeIdentity({pool:pools[3],expectedLogin:waiterLogin,kind:'staff'});
  await assert.rejects(pools[2].query('SELECT * FROM sabora.waiter_calls'),/permission denied/);
  await assert.rejects(pools[3].query('SELECT * FROM sabora.waiter_call_events'),/permission denied/);
  await assert.rejects(pools[2].query(OWNERSHIP_SQL,['{}','read','{}']),/permission denied/);
  await assert.rejects(pools[0].query('SELECT * FROM sabora.waiter_calls'),/permission denied/);
  await assert.rejects(pools[0].query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[b]),
   /permission denied/);
  await assert.rejects(pools[0].query(OWNERSHIP_SQL,['{}','force','{}']),/permission denied/);
  const withTransaction=createRoleScopedPostgresTransaction({pool:pools[0],role:OWNERSHIP_ROLE,
   allowedSql:new Set([OWNERSHIP_SQL])});
  const issueCapability=createOwnershipCapabilityIssuer({keyId,secret,databaseRole:login});
  const repo=createOwnershipGovernanceRepository({withTransaction,issueCapability});
  const callRepository=createWaiterCallComposition({
   customerPool:pools[2],staffPool:pools[3],
   issueStaffCapability:createWaiterCallStaffIssuer({
    keyId,secret,databaseRole:waiterLogin})});
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const issuer='https://sabora-ci-ownership.test/auth/v1';
  const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',kid:'ownership-ci-'+suffix,use:'sig'};
  const jwt=user=>{
   const now=Math.floor(Date.now()/1000);
   const h=Buffer.from(JSON.stringify({typ:'JWT',alg:'RS256',kid:jwk.kid})).toString('base64url');
   const p=Buffer.from(JSON.stringify({iss:issuer,aud:'authenticated',sub:user,role:'authenticated',iat:now,exp:now+3600})).toString('base64url');
   return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
  };
  api=Fastify({logger:false,trustProxy:false});
  const staffRoles=createStaffProtectedHooksFromPool({pool:pools[1],issuer,getTrustedKeys:async()=>[jwk]});
  const forRoles=roles=>async(request,reply)=>{
   for(const hook of staffRoles(roles)){await hook(request,reply);if(reply.sent)return;}
  };
  const cookieAuth=createCustomerCookieAuth({
   verifyCustomerSession:createCustomerSessionVerifier({
    query:(sql,params)=>admin.query(sql,params)}),
   revokeCustomerSession:async()=>false,allowedOrigin:clientOrigin});
  registerOwnershipGovernanceHttp(api,{forRoles,repository:repo});
  registerWaiterCallHttp(api,{cookieAuth,forRoles,repository:callRepository});
  // H35-P1 is exercised in this *existing* real PG17 + verified JWT/HMAC +
  // Fastify + two-PWA Chromium journey, not a disconnected browser mock.
  const tablesTx=createRoleScopedPostgresTransaction({pool:pools[4],role:M3_TABLES_ROLE,
   allowedSql:new Set([READ_M3_TABLES_SQL,MANAGE_M3_TABLE_SQL,OCCUPANCY_M3_TABLE_SQL])});
  const catalogTx=createRoleScopedPostgresTransaction({pool:pools[5],role:M3_CATALOG_ROLE,
   allowedSql:new Set([READ_M3_CATALOG_SQL,MANAGE_M3_CATALOG_SQL,READ_M3_FINANCE_SQL])});
  const tablesRepository=createM3TablesRepository({withTransaction:tablesTx,
   issueCapability:createM3ManagementCapabilityIssuer({keyId,secret,databaseRole:tablesLogin})});
  const catalogIssuer=createM3ManagementCapabilityIssuer({keyId,secret,databaseRole:catalogLogin});
  const catalogRepository=createM3CatalogRepository({withTransaction:catalogTx,
   issueCapability:catalogIssuer});
  const financeRepository=createM3FinanceRepository({withTransaction:catalogTx,
   issueCapability:catalogIssuer,timeZone:'Europe/Madrid'});
  registerM3ManagementHttp(api,{forRoles,tables:tablesRepository,catalog:catalogRepository,
   finance:financeRepository,qr:{secret:'h35_owner_composition_qr_test_secret_32_bytes_minimum',
    origin:'https://sabora.example',restaurantCode:'SABORA_CI'}});
  const commsTx=createRoleScopedPostgresTransaction({pool:pools[6],role:M5_COMMS_ADMIN_ROLE,
   allowedSql:new Set([READ_M5_COMMS_ADMIN_SQL,MANAGE_M5_COMMS_SQL])});
  const publicCommsTx=createRoleScopedPostgresTransaction({pool:pools[7],role:M5_COMMS_PUBLIC_ROLE,
   allowedSql:new Set([READ_M5_COMMS_PUBLIC_SQL])});
  registerM5CommunicationsHttp(api,{forRoles,
   repositories:createM5CommunicationsRepositories({adminTx:commsTx,
    publicTx:publicCommsTx,issueCapability:createM3ManagementCapabilityIssuer({
     keyId,secret,databaseRole:commsAdminLogin})}),
   stream:{subscribe:()=>()=>{}}});
  api.get('/api/v1/customer/session',{preHandler:cookieAuth.authenticate},
   async request=>({authenticated:true,publicId:request.customerIdentity.publicId,
    alias:request.customerIdentity.alias,company:request.customerIdentity.company}));
  // The QR link is only a test fixture. Both security-sensitive actions
  // continue to use signed SQL and the real durable PG17 visit and RLS.
  api.post('/api/v1/customer/visits',{preHandler:cookieAuth.authenticate},
   async(request,reply)=>request.body?.tableId===tableId&&request.body?.qrToken===qrToken
    ?reply.code(201).send({tableId,visitId:visitKey,
     basketId:'CI_DUAL_BASKET_1234567890',expiresAt:new Date(Date.now()+3600000).toISOString()})
    :reply.code(403).send({error:'customer_context_forbidden'}));
  await api.ready();
  // This is not an isolated substitute test: it pinpoints whether a failed
  // full-stack HTTP authorization came from DB/HMAC or verified membership.
  const membership=(await pools[1].query(
   'select role, state from sabora.staff_members where user_id = $1',[b])).rows[0];
  assert.deepEqual(membership,{role:'admin',state:'active'},
   'independent staff reader must see durable membership');
  // Critical integration diagnostic: check exact signer and RLS preconditions
  // without exposing a key, token or signature in logs or HTTP responses.
  const signedProbe=issueCapability({actorId:b,staffRole:'admin',
   action:'ownership.read',requestId:randomUUID(),body:'ownership.read'});
  const probe=(await admin.query(`WITH cap AS (SELECT $1::jsonb AS c)
   SELECT
    (c->>'databaseRole'=$2) AS audience,
    (c->>'staffRole'='admin') AS staff_role,
    (c->>'action'='ownership.read') AS action,
    (c->>'bodyHashHex'=encode(extensions.digest(
     convert_to('ownership.read','UTF8'),'sha256'),'hex')) AS body_hash,
    (SELECT encode(extensions.hmac(convert_to(
      'sabora-ownership-v1'||chr(10)||(c->>'databaseRole')||chr(10)||
      (c->>'actorId')||chr(10)||(c->>'staffRole')||chr(10)||
      (c->>'action')||chr(10)||(c->>'requestId')||chr(10)||
      (c->>'bodyHashHex')||chr(10)||(c->>'issuedAtMs')||chr(10)||
      (c->>'expiresAtMs'),'UTF8'),hmac_key,'sha256'),'hex')
     FROM sabora.order_operation_signing_keys WHERE key_id=$3)
     =c->>'signatureHex' AS signature,
    (c->>'issuedAtMs')::bigint >=
     floor(extract(epoch FROM clock_timestamp())*1000)::bigint-60000 AS issued_fresh,
    (c->>'expiresAtMs')::bigint >
     floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS unexpired
   FROM cap`,[JSON.stringify(signedProbe),login,keyId])).rows[0];
  assert(Object.values(probe).every(v=>v===true),
   'signed governance input invalid: '+
   Object.keys(probe).filter(k=>probe[k]!==true).join(','));
  const sealed=await admin.connect();
  try{
   await sealed.query('BEGIN');
   await sealed.query('SET LOCAL ROLE sabora_ownership_fn_owner');
   const rows=(await sealed.query(`SELECT
    (SELECT count(*)::integer FROM sabora.admin_write_ownership WHERE singleton) AS ownership,
    (SELECT count(*)::integer FROM sabora.staff_members WHERE user_id=$1
      AND role='admin' AND state='active') AS staff,
    (SELECT count(*)::integer FROM sabora.order_operation_signing_keys
      WHERE key_id=$2 AND disabled_at IS NULL
       AND not_before<=clock_timestamp() AND expires_at>clock_timestamp()) AS keyring`,
    [b,keyId])).rows[0];
   assert.deepEqual(rows,{ownership:1,staff:1,keyring:1},
    'sealed governance principal must see active staff, keyring and owner under FORCE RLS');
   // Lock assertions reproduce the precise SQL authorization statements.
   const lockedOwner=(await sealed.query(
    'SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton FOR UPDATE')).rows[0];
   assert.equal(lockedOwner?.owner_user_id,a);
   const lockedKey=(await sealed.query(
    'SELECT key_id FROM sabora.order_operation_signing_keys WHERE key_id=$1 AND disabled_at IS NULL AND not_before<=clock_timestamp() AND expires_at>clock_timestamp() FOR SHARE',
    [keyId])).rows[0];
   assert.equal(lockedKey?.key_id,keyId);
   const lockedStaff=(await sealed.query(
    "SELECT role FROM sabora.staff_members WHERE user_id=$1 AND state='active' FOR UPDATE",
    [b])).rows[0];
   assert.equal(lockedStaff?.role,'admin');
  }finally{await sealed.query('ROLLBACK').catch(()=>{});sealed.release();}
  // Validate the actual restricted SQL execution path, not a mock issuer.
  // The valid actor + key still must not authenticate an altered NULL HMAC or
  // NULL signed timestamp, even under SQL three-valued logic.
  const manageBody=JSON.stringify({action:'request',proposalId:null,
   targetUserId:null,reason:null});
  const baseForged=issueCapability({actorId:b,staffRole:'admin',
   action:'ownership.manage',requestId:randomUUID(),body:manageBody});
  const invalidCaps=[
   ['null_signature',{...baseForged,signatureHex:null}],
   ['missing_signature',Object.fromEntries(Object.entries(baseForged)
     .filter(([key])=>key!=='signatureHex'))],
   ['null_issued_at',{...baseForged,issuedAtMs:null}],
   ['null_expiry',{...baseForged,expiresAtMs:null}],
   ['wrong_signature',{...baseForged,signatureHex:'0'.repeat(64)}],
   ['null_staff_role',{...baseForged,staffRole:null}],
   ['string_expiry',{...baseForged,expiresAtMs:String(baseForged.expiresAtMs)}]
  ];
  for(const [kind,cap] of invalidCaps){
   await assert.rejects(
    withTransaction(query=>query(OWNERSHIP_SQL,
     [JSON.stringify(cap),'request',manageBody])),
    cause=>cause?.code==='42501',
    'sealed SQL must reject '+kind+' without recording a governance action');
  }
  const forbiddenAudit=(await admin.query(
   'SELECT count(*)::integer AS count FROM sabora.admin_ownership_audit WHERE correlation_id=$1',
   [baseForged.requestId])).rows[0].count;
  const forbiddenProposals=(await admin.query(
   'SELECT count(*)::integer AS count FROM sabora.admin_ownership_proposals WHERE correlation_id=$1',
   [baseForged.requestId])).rows[0].count;
  assert.equal(forbiddenAudit,0,'forged signed action must not persist audit');
  assert.equal(forbiddenProposals,0,'forged signed action must not persist proposal');
  let signedRead;
  try{
   signedRead=await repo.read({
    verifiedIdentity:{userId:b},verifiedStaff:{userId:b,role:'admin'}});
  }catch(cause){
   throw new Error('signed_ownership_rpc_preflight:'+String(cause?.code??'none')+
    ':'+String(cause?.message??'unknown'),{cause});
  }
  assert.equal(signedRead.ownerUserId,a,'signed SQL self-projection must precede HTTP');
  const readCall=(token=customerToken)=>api.inject({method:'GET',
   url:'/api/v1/customer/waiter-calls?tableId='+tableId,
   headers:{cookie:'__Secure-sabora_customer='+token}});
  const makeCall=(requestId=randomUUID())=>api.inject({method:'POST',
   url:'/api/v1/customer/waiter-calls',headers:{
    cookie:'__Secure-sabora_customer='+customerToken,
    origin:clientOrigin,'content-type':'application/json'},
   payload:{tableId,requestId}});
  const waiterBoard=()=>api.inject({method:'GET',
   url:'/api/v1/operations/waiter-calls',
   headers:{authorization:'Bearer '+jwt(waiterId)}});
  const attendCall=(callId,requestId=randomUUID())=>api.inject({
   method:'POST',url:'/api/v1/operations/waiter-calls/'+callId+'/attend',
   headers:{authorization:'Bearer '+jwt(waiterId)},
   payload:{requestId}});
  const read=id=>api.inject({method:'GET',url:'/api/v1/admin/ownership',
   headers:{authorization:'Bearer '+jwt(id)}});
  const post=(id,action,props={})=>api.inject({method:'POST',
   url:'/api/v1/admin/ownership/actions',headers:{authorization:'Bearer '+jwt(id)},
   payload:{requestId:props.requestId??randomUUID(),action,
    proposalId:props.proposalId??null,targetUserId:props.targetUserId??null,
    reason:props.reason??null}});
  assert.equal((await api.inject('/api/v1/admin/ownership')).statusCode,401);
  assert.equal((await api.inject('/api/v1/customer/waiter-calls?tableId='+tableId)).statusCode,401);
  assert.equal((await read(waiterId)).statusCode,403,
   'a waiter cannot read ADMIN ownership just because both modules share Fastify');
  assert.equal((await api.inject({method:'GET',url:'/api/v1/operations/waiter-calls',
   headers:{authorization:'Bearer '+jwt(b)}})).statusCode,403,
   'an ADMIN owner cannot acquire waiter duties from shared Fastify');
  assert.equal((await readCall()).json().state,'none');
  const firstCall=await makeCall();assert.equal(firstCall.statusCode,200,firstCall.body);
  assert.equal(firstCall.json().state,'pending');
  const initialCallId=firstCall.json().id;
  assert.equal((await waiterBoard()).json().items[0].id,initialCallId);
  const original=await read(b);assert.equal(original.statusCode,200,original.body);
  assert.equal(original.json().ownerUserId,a);
  assert.equal(original.json().actorUserId,b);
  const identities=original.json().eligibleAdmins;
  assert(identities.some(x=>x.userId===a&&x.givenName==='Alicia'&&
    x.familyName==='Molina'&&x.operationalDisplayId==='AM-Z9A'));
  assert(identities.some(x=>x.userId===b&&x.givenName==='Bruno'&&
    x.familyName==='Romero'&&x.operationalDisplayId==='BR-Z9B'));
  assert(identities.every(x=>!('email' in x)),
    'recipient lookup must never expose contacts');
  const legacy=identities.find(x=>x.userId===d);
  assert(legacy&&legacy.givenName===null&&legacy.familyName===null&&
   legacy.operationalDisplayId===null,
   'real SQL must include active legacy ADMIN without enrollment metadata');
  const correlation=randomUUID(),req=await post(b,'request',{requestId:correlation});
  assert.equal(req.statusCode,200,req.body);
  const proposalId=req.json().proposalId;assert(proposalId);
  assert.equal((await post(b,'request',{requestId:correlation})).json().replayed,true);
  assert((await read(a)).json().proposals.some(p=>p.id===proposalId));
  assert.equal((await post(b,'accept',{proposalId})).statusCode,403);
  assert.equal((await post(a,'reject',{proposalId})).statusCode,200);
  assert.equal((await read(a)).json().ownerUserId,a);
  const cancelledRequest=await post(b,'request');
  assert.equal(cancelledRequest.statusCode,200,cancelledRequest.body);
  assert.equal((await post(c,'cancel',{proposalId:cancelledRequest.json().proposalId})).statusCode,403,
   'unrelated ADMIN cannot cancel another actor request');
  assert.equal((await post(b,'cancel',{proposalId:cancelledRequest.json().proposalId})).statusCode,200);
  assert.equal((await read(a)).json().ownerUserId,a,
   'cancellation does not transfer ownership');
  assert.equal((await readCall()).json().state,'pending',
   'changing ADMIN proposals does not cancel an unrelated waiter call');
  const again=await post(b,'request');
  assert.equal((await post(a,'accept',{proposalId:again.json().proposalId})).statusCode,200);
  assert.equal((await read(b)).json().ownerUserId,b);
  assert.equal((await waiterBoard()).json().items[0].id,initialCallId,
   'ADMIN ownership transfer cannot invalidate waiter room duties');
  const attended=await attendCall(initialCallId);
  assert.equal(attended.statusCode,200,attended.body);
  assert.equal(attended.json().state,'attended');
  assert.equal((await readCall()).json().state,'none');
  assert.equal((await post(a,'offer',{targetUserId:c})).statusCode,403,
   'old ADMIN cannot continue writing with its existing JWT');
  const offer=await post(b,'offer',{targetUserId:c});
  assert.equal((await post(c,'reject',{proposalId:offer.json().proposalId})).statusCode,200);
  const cancelledOffer=await post(b,'offer',{targetUserId:c});
  assert.equal(cancelledOffer.statusCode,200,cancelledOffer.body);
  assert.equal((await post(b,'cancel',{proposalId:cancelledOffer.json().proposalId})).statusCode,200);
  assert.equal((await read(b)).json().ownerUserId,b,
   'offer cancellation does not transfer ownership');
  const offer2=await post(b,'offer',{targetUserId:c});
  assert.equal((await post(c,'accept',{proposalId:offer2.json().proposalId})).statusCode,200);
  assert.equal((await read(c)).json().ownerUserId,c);
  assert.equal((await post(root,'offer',{targetUserId:b})).statusCode,403);
  assert.equal((await post(root,'force',{targetUserId:a,reason:''})).statusCode,400);
  const forced=await post(root,'force',{targetUserId:a,reason:'Recuperación integral aislada'});
  assert.equal(forced.statusCode,200,forced.body);
  assert.equal((await read(a)).json().ownerUserId,a);
  assert((await read(c)).json().notifications.some(n=>n.action==='force_transfer'));
  const audit=(await admin.query("SELECT reason FROM sabora.admin_ownership_audit WHERE actor_user_id=$1 AND action='force_transfer' ORDER BY id DESC LIMIT 1",[root])).rows[0];
  assert.equal(audit.reason,'Recuperación integral aislada');
  const offerB=await post(a,'offer',{targetUserId:b});
  const offerC=await post(a,'offer',{targetUserId:c});
  const competing=await Promise.all([
   post(b,'accept',{proposalId:offerB.json().proposalId}),
   post(c,'accept',{proposalId:offerC.json().proposalId})
  ]);
  assert.deepEqual(competing.map(r=>r.statusCode).sort(),[200,409]);
  const owner=(await read(root)).json().ownerUserId;
  assert([b,c].includes(owner));
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.admin_write_ownership WHERE singleton')).rows[0].n,1);

  // REAL PWA Chromium with Vite -> Fastify authenticated proxy -> PG17.
  const apiUrl=await api.listen({host:'127.0.0.1',port:0});
  const managementRequire=createRequire(new URL('../../apps/management/package.json',import.meta.url));
  const {createServer}=await import(pathToFileURL(managementRequire.resolve('vite')).href);
  vite=await createServer({root:fileURLToPath(new URL('../../apps/management/',import.meta.url)),
   mode:'test',logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,
    proxy:{'/api':apiUrl}}});
  await vite.listen();
  // The existing CV-014 full-stack journey enables client calling only
  // through its isolated Vite mode. Reuse that exact child-process boot,
  // not a generic Vite instance whose feature stays disabled.
  clientVite=spawn('pnpm',['exec','vite','--mode','test','--host','127.0.0.1',
   '--port','4178','--strictPort'],{
   cwd:fileURLToPath(new URL('../../apps/client/',import.meta.url)),
   env:{...process.env,SABORA_CI_COMMS_API:apiUrl,
    VITE_SABORA_ENABLE_WAITER_CALLS:'isolated_pg17'},
   stdio:'ignore'});
  let clientReady=false;
  for(let attempt=0;attempt<120;attempt++){
   try{const response=await fetch(clientOrigin+'/');if(response.ok){clientReady=true;break;}}
   catch{}
   if(clientVite.exitCode!==null)break;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.equal(clientReady,true,'isolated CV-014 client Vite is unavailable');
  const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  clientContext=await browser.newContext({serviceWorkers:'block'});
  await clientContext.addCookies([{name:'__Secure-sabora_customer',
   value:customerToken,domain:'127.0.0.1',path:'/api/v1/customer',
   secure:true,httpOnly:true,sameSite:'Strict'}]);
  const page=await browser.newPage();
  await page.goto(vite.resolvedUrls.local[0]+'#equipo');
  await page.evaluate(async token=>{
   const app=await import('/src/main.tsx');
   window.ownershipClose=app.mountAuthenticatedManagementApp({
    element:document.getElementById('root'),getAccessToken:async()=>token,
    enableOwnershipGovernance:true});
  },jwt(owner));
  await page.getByRole('heading',{name:'Titularidad de escritura'}).waitFor({timeout:20000});
  await page.getByText('Titular: '+(owner===b?'Bruno Romero · BR-Z9B':'Clara Rivera · CR-Z9C')+' (tu cuenta)').waitFor({timeout:20000});
  const recipientOptions=await page.getByLabel('ADMIN destinatario de cesión')
    .locator('option').allTextContents();
  assert(recipientOptions.some(x=>x.includes('Alicia Molina · AM-Z9A')));
  assert(!recipientOptions.some(x=>x.includes(a.slice(-12))),
    'ownership recipient cannot be a bare UUID suffix');
  await page.getByLabel('ADMIN destinatario de cesión').selectOption(a);
  await page.getByRole('button',{name:'Ofrecer cesión'}).click();
  await page.getByText('La decisión se ha registrado con auditoría.').waitFor({timeout:20000});
  assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.admin_ownership_proposals WHERE kind='offer' AND from_owner_id=$1 AND to_owner_id=$2 AND status='pending'",[owner,a])).rows[0].n,1);
  // RF-01: current owner can offer to an active legacy ADMIN whose human
  // details were never added to the later enrollment record.
  const legacyOfferLabel=await page.getByLabel('ADMIN destinatario de cesión')
   .locator('option[value="'+d+'"]').textContent();
  assert.equal(legacyOfferLabel,'ADMIN activo sin ficha operativa · ID completo '+d);
  await page.getByLabel('ADMIN destinatario de cesión').selectOption(d);
  await page.getByRole('button',{name:'Ofrecer cesión'}).click();
  await page.getByText('La decisión se ha registrado con auditoría.').waitFor({timeout:20000});
  assert.equal((await admin.query(
   "SELECT count(*)::integer AS n FROM sabora.admin_ownership_proposals WHERE kind='offer' AND from_owner_id=$1 AND to_owner_id=$2 AND status='pending'",
   [owner,d])).rows[0].n,1,'signed offer to legacy ADMIN must persist');

  // Full PWA session replacement: A's deferred token must not send a new
  // governance action after ROOT takes over, even without calling A's disposer.
  await page.evaluate(async ownerToken=>{
   const host=await import('/src/main.tsx');
   window.ownershipClose();
   window.holdOwnershipToken=false;
   window.oldOwnershipPosts=0;
   window.oldOwnershipTokenPending=false;
   window.oldOwnershipWait=new Promise(resolve=>window.releaseOwnershipToken=resolve);
   window.oldOwnershipDispose=host.mountAuthenticatedManagementApp({
    element:document.getElementById('root'),
    getAccessToken:async()=>{
     if(window.holdOwnershipToken){
      window.holdOwnershipToken=false;window.oldOwnershipTokenPending=true;
      await window.oldOwnershipWait;
     }
     return ownerToken;
    },
    fetchImpl:(url,options)=>{
     if(String(url).includes('/api/v1/admin/ownership/actions'))window.oldOwnershipPosts++;
     return fetch(url,options);
    },enableOwnershipGovernance:true
   });
  },jwt(owner));
  await page.getByLabel('ADMIN destinatario de cesión').waitFor({timeout:20000});
  await page.getByLabel('ADMIN destinatario de cesión').selectOption(a);
  await page.evaluate(()=>{window.holdOwnershipToken=true;});
  await page.getByRole('button',{name:'Ofrecer cesión'}).click();
  await page.waitForFunction(()=>window.oldOwnershipTokenPending===true,null,{timeout:20000});
  await page.evaluate(async rootToken=>{
   const host=await import('/src/main.tsx');
   window.newOwnershipDispose=host.mountAuthenticatedManagementApp({
    element:document.getElementById('root'),
    getAccessToken:async()=>rootToken,enableOwnershipGovernance:true
   });
   window.releaseOwnershipToken();
  },jwt(root));
  await page.getByLabel('ADMIN destinatario de reasignación').waitFor({timeout:20000});
  await page.evaluate(()=>window.oldOwnershipDispose());
  assert.equal(await page.evaluate(()=>window.oldOwnershipPosts),0,
   'stale session must not send a delayed ownership mutation');
  await page.getByLabel('ADMIN destinatario de reasignación').selectOption(a);
  await page.getByLabel('Motivo obligatorio').fill('Recuperación auditada tras cambio de sesión');
  await page.getByRole('button',{name:'Reasignar forzosamente'}).click();
  await page.getByText('La decisión se ha registrado con auditoría.').waitFor({timeout:20000});
  assert.equal((await read(root)).json().ownerUserId,a,
   'late disposer may not revoke the replacement ROOT session');
  // RV-04: real JWT -> Fastify -> signed PG17 read, but the browser response
  // has a buffered JSON body that resolves after the old employee was revoked.
  // AbortSignal alone cannot fence the delayed decode.
  const delayed=await page.evaluate(async({oldToken,newToken})=>{
   const {createAuthenticatedOwnershipGovernanceGateway}=await import(
    '/src/ownership-governance-gateway.js');
   let releaseBody,enteredBody;
   const bodyHold=new Promise(resolve=>{releaseBody=resolve;});
   const bodyEntered=new Promise(resolve=>{enteredBody=resolve;});
   const oldGateway=createAuthenticatedOwnershipGovernanceGateway({
    getAccessToken:async()=>oldToken,
    fetchImpl:async(url,options)=>{
     const response=await fetch(url,options);
     return {ok:response.ok,status:response.status,async json(){
      // Parse a real authenticated response, but delay its completion.
      const value=await response.json();
      enteredBody();
      await bodyHold;
      return value;
     }};
    }
   });
   const oldRead=oldGateway.read().then(
    value=>({outcome:'resolved',ownerUserId:value.ownerUserId}),
    error=>({outcome:'rejected',code:error.code??error.message}));
   await bodyEntered;
   oldGateway.revoke();
   const nextGateway=createAuthenticatedOwnershipGovernanceGateway({
    getAccessToken:async()=>newToken,fetchImpl:fetch});
   const fresh=await nextGateway.read();
   releaseBody();
   const stale=await oldRead;
   nextGateway.revoke();
   return {stale,freshOwner:fresh.ownerUserId};
  },{oldToken:jwt(owner),newToken:jwt(root)});
  assert.deepEqual(delayed.stale,{outcome:'rejected',code:'session_revoked'},
   'decoded body from a revoked employee must never escape the gateway');
  assert.equal(delayed.freshOwner,a,
   'new authenticated identity retains its authorized signed read');

  // RF-01: ROOT can recover ownership to an active legacy ADMIN with full,
  // unambiguous server identity even when no name/display code is available.
  const rootChoice=await page.getByLabel('ADMIN destinatario de reasignación')
   .locator('option[value="'+d+'"]').textContent();
  assert.equal(rootChoice,'ADMIN activo sin ficha operativa · ID completo '+d);
  await page.getByLabel('ADMIN destinatario de reasignación').selectOption(d);
  await page.getByLabel('Motivo obligatorio').fill('Recuperación de ADMIN activo sin ficha histórica');
  await page.getByRole('button',{name:'Reasignar forzosamente'}).click();
  await page.getByText('La decisión se ha registrado con auditoría.').waitFor({timeout:20000});
  assert.equal((await read(root)).json().ownerUserId,d);
  assert((await read(d)).json().notifications.some(x=>x.action==='force_transfer'),
   'legacy ADMIN receives the durable recovery notification');

  // Integration gate: one Fastify, one PG17, two independent Chromium PWAs,
  // ADMIN ownership governance and waiter calls simultaneously registered.
  // A second call must remain usable after ownership changes and ROOT recovery.
  const client=await clientContext.newPage();
  await client.setViewportSize({width:390,height:844});
  await client.goto(clientOrigin+'/qr/v1/SABORA/'+tableId+'#'+qrToken);
  await client.getByRole('button',{name:'Llamar al camarero'}).waitFor({timeout:20000});
  await client.getByRole('button',{name:'Llamar al camarero'}).click();
  await client.getByText('Camarero solicitado.',{exact:false}).waitFor({timeout:15000});
  const pending=await waiterBoard();assert.equal(pending.statusCode,200,pending.body);
  assert.equal(pending.json().items.length,1);
  const pendingCallId=pending.json().items[0].id;
  const waiterPage=await browser.newPage();
  await waiterPage.goto(vite.resolvedUrls.local[0]);
  await waiterPage.evaluate(async token=>{
   const host=await import('/src/main.tsx');
   window.dualDispose=host.mountAuthenticatedManagementApp({
    element:document.getElementById('root'),getAccessToken:async()=>token,
    enableOwnershipGovernance:true,enableWaiterCalls:true});
  },jwt(waiterId));
  await waiterPage.getByRole('link',{name:/Comandas/}).click();
  await waiterPage.getByRole('button',{name:'Sala'}).click();
  await waiterPage.getByRole('button',{name:'Marcar atendida'}).waitFor({timeout:15000});
  await waiterPage.getByRole('button',{name:'Marcar atendida'}).click();
  await waiterPage.getByText('No hay llamadas pendientes confirmadas.').waitFor({timeout:15000});
  const persisted=(await admin.query('SELECT event,count(*)::integer AS n FROM sabora.waiter_call_events WHERE call_id=$1 GROUP BY event ORDER BY event',[pendingCallId])).rows;
  assert.deepEqual(persisted,[{event:'attended',n:1},{event:'requested',n:1}]);
  assert.equal((await read(root)).json().ownerUserId,d,
   'waiter attendance cannot change ADMIN ROOT-governed ownership');
  assert.equal((await read(waiterId)).statusCode,403,
   'enabling both UI modules must not reveal ADMIN governance to a waiter');
  assert.equal((await api.inject({method:'GET',url:'/api/v1/operations/waiter-calls',
   headers:{authorization:'Bearer '+jwt(d)}})).statusCode,403,
   'an ADMIN remains barred from waiter calls even after ROOT reassignment');
  await client.getByRole('button',{name:'Consultar llamada'}).click();
  await client.getByText('Puedes avisar a sala',{exact:false}).waitFor({timeout:15000});

  // H35-P1: d is the live owner at this point (ROOT just recovered to d);
  // same PG17 and JWT session, effective read projection across
  // ADMIN owner, non-owner, ROOT and waiter. No UUID/secret owner leaks in M3.
  const tableRead=async id=>api.inject({method:'GET',url:'/api/v1/admin/tables?limit=1',
   headers:{authorization:'Bearer '+jwt(id)}});
  const expectedWriter={configure:true,qr:true,readiness:true,occupancy:true};
  const expectedReadOnly={configure:false,qr:false,readiness:false,occupancy:false};
  const expectedWaiter={configure:false,qr:false,readiness:true,occupancy:true};
  for(const [user,permissions] of [[d,expectedWriter],[a,expectedReadOnly],
   [root,expectedReadOnly],[waiterId,expectedWaiter]]){
   const response=await tableRead(user);
   assert.equal(response.statusCode,200,response.body);
   assert.deepEqual(response.json().permissions,permissions);
   assert.equal(response.body.includes('ownerUserId'),false);
  }
  const oldWriterBrowser=await browser.newPage();
  const nextWriterBrowser=await browser.newPage();
  for(const [tab,actor] of [[oldWriterBrowser,d],[nextWriterBrowser,a]]){
   await tab.goto(vite.resolvedUrls.local[0]+'#mesas');
   await tab.evaluate(async token=>{
    const host=await import('/src/main.tsx');
    window.h35Dispose=host.mountAuthenticatedManagementApp({
     element:document.getElementById('root'),getAccessToken:async()=>token,
     enableM3Management:true});
   },jwt(actor));
  }
  await oldWriterBrowser.getByRole('button',{name:'Crear mesa'}).waitFor({timeout:20000});
  // The notice also renders during the initial fail-closed loading state;
  // its disabled placeholder must not be mistaken for a granted action.
  // Await the actual SQL-backed page before asserting non-owner affordances.
  await nextWriterBrowser.getByRole('region',{name:'Estado de la lectura de mesas'})
   .waitFor({timeout:20000});
  await nextWriterBrowser.getByText('Proyección de mesas en modo consulta.').waitFor({timeout:20000});
  assert.equal(await nextWriterBrowser.getByRole('button',{name:'Crear mesa'}).count(),0);
  await oldWriterBrowser.getByRole('link',{name:/Catálogo/}).click();
  await oldWriterBrowser.getByRole('button',{name:'Nuevo plato'}).waitFor({timeout:20000});
  await nextWriterBrowser.getByRole('link',{name:/Catálogo/}).click();
  await nextWriterBrowser.getByRole('heading',{name:'Carta en consulta'}).waitFor({timeout:20000});
  assert.equal(await nextWriterBrowser.getByRole('button',{name:'Nuevo plato'}).count(),0);
  await oldWriterBrowser.getByRole('link',{name:/Configuración/}).click();
  await oldWriterBrowser.getByRole('button',{name:'Guardar borrador'}).waitFor({timeout:20000});
  await nextWriterBrowser.getByRole('link',{name:/Configuración/}).click();
  await nextWriterBrowser.getByRole('heading',{name:'Comunicaciones · Consulta'}).waitFor({timeout:20000});
  assert.equal(await nextWriterBrowser.getByRole('button',{name:'Guardar borrador'}).count(),0);

  // ROOT takes ownership from the current ADMIN to A. No polling or
  // fabricated client role: page focus/navigation triggers a signed re-read.
  const takeover=await post(root,'force',{targetUserId:a,
   reason:'Verificación del cambio efectivo de permisos de gestión'});
  assert.equal(takeover.statusCode,200,takeover.body);
  assert.deepEqual((await tableRead(d)).json().permissions,expectedReadOnly);
  assert.deepEqual((await tableRead(a)).json().permissions,expectedWriter);
  await oldWriterBrowser.bringToFront();
  await oldWriterBrowser.getByRole('link',{name:/Mesas/}).click();
  await oldWriterBrowser.getByRole('region',{name:'Estado de la lectura de mesas'})
   .waitFor({timeout:20000});
  await oldWriterBrowser.getByText('Proyección de mesas en modo consulta.').waitFor({timeout:20000});
  assert.equal(await oldWriterBrowser.getByRole('button',{name:'Crear mesa'}).count(),0);
  await nextWriterBrowser.bringToFront();
  await nextWriterBrowser.getByRole('link',{name:/Mesas/}).click();
  await nextWriterBrowser.getByRole('button',{name:'Crear mesa'}).waitFor({timeout:20000});
  // A revoked owner's old JWT cannot perform a real table mutation.
  const deniedOldWriter=await api.inject({method:'POST',
   url:'/api/v1/admin/tables/actions',
   headers:{authorization:'Bearer '+jwt(d)},
   payload:{requestId:randomUUID(),operation:'create',payload:{
    number:9799,capacity:4,description:'No creada por propietario anterior'}}});
  assert.equal(deniedOldWriter.statusCode,403,deniedOldWriter.body);
  assert.equal((await admin.query(
   'SELECT count(*)::integer AS n FROM sabora.dining_tables WHERE number=9799')).rows[0].n,0);
  // Restore exact previous ownership before the remainder of the integrated
  // governance/dual-PWA test; do not rewrite orders or waiter-call history.
  const restore=await post(root,'force',{targetUserId:d,
   reason:'Restitución del titular del escenario integral'});
  assert.equal(restore.statusCode,200,restore.body);
  await oldWriterBrowser.close();await nextWriterBrowser.close();

  // RF-02: signed capability is initially valid but expires while the
  // actual restricted PostgreSQL call awaits a staff FOR UPDATE row lock.
  // Verify that neither ownership, proposals, audit nor notices change.
  const shortIssuer=createOwnershipCapabilityIssuer({
   keyId,secret,databaseRole:login,ttlMs:1000});
  shortApi=Fastify({logger:false,trustProxy:false});
  registerOwnershipGovernanceHttp(shortApi,{forRoles,
   repository:createOwnershipGovernanceRepository({
    withTransaction,issueCapability:shortIssuer})});
  await shortApi.ready();
  const blockedRequestId=randomUUID();
  const locker=await admin.connect();
  let blockedResponse;
  try{
   await locker.query('BEGIN');
   await locker.query('SELECT user_id FROM sabora.staff_members WHERE user_id=$1 FOR UPDATE',[b]);
   blockedResponse=shortApi.inject({method:'POST',
    url:'/api/v1/admin/ownership/actions',
    headers:{authorization:'Bearer '+jwt(b)},
    payload:{requestId:blockedRequestId,action:'request',
     proposalId:null,targetUserId:null,reason:null}}).then(value=>value);
   let waiting=false;
   for(let tries=0;tries<50;tries++){
    const status=await admin.query(`SELECT EXISTS(
     SELECT 1 FROM pg_stat_activity WHERE usename=$1
      AND wait_event_type='Lock'
      AND query LIKE '%admin_ownership_action_candidate%'
    ) AS blocked`,[login]);
    if(status.rows[0].blocked){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,40));
   }
   assert.equal(waiting,true,
    'real signed ownership call must be observed waiting on PostgreSQL');
   await new Promise(resolve=>setTimeout(resolve,1400));
  }finally{
   await locker.query('ROLLBACK').catch(()=>{});
   locker.release();
  }
  const denied=await blockedResponse;
  assert.equal(denied.statusCode,403,denied.body);
  assert.equal(denied.json().error,'forbidden');
  const unchanged=(await admin.query(`SELECT
   (SELECT count(*)::integer FROM sabora.admin_ownership_audit WHERE correlation_id=$1) AS audit,
   (SELECT count(*)::integer FROM sabora.admin_ownership_proposals WHERE correlation_id=$1) AS proposals,
   (SELECT count(*)::integer FROM sabora.admin_ownership_notifications WHERE correlation_id=$1) AS notices`,
   [blockedRequestId])).rows[0];
  assert.deepEqual(unchanged,{audit:0,proposals:0,notices:0},
   'expiry after lock wait must not persist a governance decision');
  assert.equal((await read(root)).json().ownerUserId,d,
   'expired authorization cannot transfer the current owner');
 }finally{
  await clientContext?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  clientVite?.kill('SIGTERM');
  await vite?.close().catch(()=>{});
  await shortApi?.close().catch(()=>{});
  await api?.close().catch(()=>{});
  for(const pool of pools)await pool.end().catch(()=>{});
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[originalOwner]).catch(()=>{});
  await admin.end().catch(()=>{});
 }
});
