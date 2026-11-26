import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {startPublishedManagementPwa} from './published-client-pwa-fixture.mjs';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffRootBootstrapCandidate,ROOT_BOOTSTRAP_SQL} from '../../apps/api/src/staff-root-bootstrap-candidate.mjs';
import {createStaffPasskeySession} from '../../apps/api/src/staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer,createStaffInviteeEmailHasher} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {createVerifiedDurableFirstAdminCandidate,createVerifiedDurableStaffAdminCandidate} from '../../apps/api/src/staff-durable-admin-composition.mjs';
import {createStaffVerifiedEnrollmentCandidate,STAFF_ENROLLMENT_LOGIN} from '../../apps/api/src/staff-verified-enrollment-candidate.mjs';
import {createStaffDirectoryDispatchReaderCandidate,DIRECTORY_OUTBOX_SQL} from '../../apps/api/src/staff-invitation-durable-lifecycle-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';
import {claimCurrentStaffInvitation} from '../../apps/api/src/staff-invitation-claim-candidate.mjs';
import {dispatchStaffInvitation} from '../../apps/api/src/staff-invitation-dispatch-guard.mjs';
import {recordStaffInvitationDeliveryOutcome} from '../../apps/api/src/staff-invitation-delivery-outcome-candidate.mjs';
import {createStaffInvitationResendSender} from '../../apps/api/src/staff-invitation-resend.mjs';
import {FIRST_ADMIN_BOOTSTRAP_LOGIN} from '../../apps/api/src/staff-lifecycle-coordinator.mjs';
import {createStaffLifecycleRepository} from '../../apps/api/src/staff-lifecycle-repository.mjs';
import {createOwnershipCapabilityIssuer,createOwnershipGovernanceRepository,registerOwnershipGovernanceHttp,assertOwnershipRuntimeIdentity,OWNERSHIP_ROLE,OWNERSHIP_SQL} from '../../apps/api/src/ownership-governance-candidate.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';

const source=process.env.SABORA_CI_PG_URL,modulePath=process.env.SABORA_CI_PG_MODULE;
if(!source||!modulePath||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath))
 throw Error('disposable_pg17_harness_required');
const url=new URL(source);
if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.username!=='postgres'||
 url.password!=='sabora_ci_ephemeral_only'||url.pathname!=='/postgres'||!url.port||url.search||url.hash)
 throw Error('unsafe_pg17_harness_target');
url.pathname='/sabora_root_bootstrap_ci';
const {Pool}=createRequire(import.meta.url)(modulePath);
const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
const admin=new Pool({connectionString:url.href});
const login='sabora_ci_root_bootstrap',reader='sabora_ci_root_bootstrap_reader',password='sabora_ci_bootstrap_ephemeral';
const rootId=randomUUID(),otherId=randomUUID(),grantId=randomUUID(),expiredId=randomUUID();
const code=randomBytes(32).toString('base64url');
const verifier=createHash('sha256').update(code,'utf8').digest();
const normalLogin='sabora_ci_first_admin_normal',ownershipLogin='sabora_ci_first_admin_ownership';
const firstKey='staff_first_admin_bootstrap_ci',normalKey='staff_first_admin_normal_ci',ownershipKey='staff_first_admin_owner_ci';
const firstSecret=randomBytes(32),normalSecret=randomBytes(32),ownershipSecret=randomBytes(32);
const emailHashSecret=randomBytes(32),hashEmail=createStaffInviteeEmailHasher({secret:emailHashSecret});
const dispatchLogin='sabora_ci_first_admin_dispatch',custodyKey=randomBytes(32),custodyKeyId='first_admin_custody_ci';
const keyring={active:()=>({keyId:custodyKeyId,key:custodyKey}),resolveKey:id=>id===custodyKeyId?custodyKey:null};
let pool,staffPool,firstPool,normalPool,ownershipPool,enrollmentPool,dispatchPool;
const connection=role=>{const u=new URL(url);u.username=role;u.password=password;return u.href;};

test.before(async()=>{
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members')).rows[0].n,0);
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_root_bootstrap_pg17.sql',import.meta.url),'utf8'));
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_first_admin_bootstrap_pg17.sql',import.meta.url),'utf8'));
 for(const filename of ['staff_invitation_outbox_schema_pg17.sql','staff_invitation_custody_pg17.sql',
  'staff_invitation_custody_restricted_pg17.sql','staff_invitation_dispatch_envelope_pg17.sql',
  'staff_invitation_directory_outbox_pg17.sql','staff_first_admin_durable_pg17.sql'])
  await admin.query(await readFile(new URL('../../docs/security/sql-candidates/'+filename,import.meta.url),'utf8'));
 await admin.query(`CREATE ROLE ${login} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';
 CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';
 GRANT USAGE ON SCHEMA sabora TO ${login},${reader};
 GRANT EXECUTE ON FUNCTION sabora.consume_root_bootstrap_candidate(uuid,uuid,uuid,text,bigint,bigint,text) TO ${login};
 GRANT SELECT(user_id,role,state) ON sabora.staff_members TO ${reader};
 CREATE POLICY ci_root_bootstrap_reader ON sabora.staff_members FOR SELECT TO ${reader} USING(true)`);
 await admin.query(`INSERT INTO sabora.root_bootstrap_grants(id,expected_user_id,verifier,issued_at,expires_at)
 VALUES($1,$2,$3,clock_timestamp()-interval '1 second',clock_timestamp()+interval '10 minutes'),
 ($4,$2,$3,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute')`,
 [grantId,rootId,verifier,expiredId]);
 pool=new Pool({connectionString:connection(login),max:4});
 staffPool=new Pool({connectionString:connection(reader)});
 for(const role of [FIRST_ADMIN_BOOTSTRAP_LOGIN,normalLogin,ownershipLogin,STAFF_ENROLLMENT_LOGIN,dispatchLogin]){
  await admin.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`);
 }
 await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${FIRST_ADMIN_BOOTSTRAP_LOGIN},${normalLogin},${STAFF_ENROLLMENT_LOGIN},${dispatchLogin};
 GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text),
 sabora.store_staff_invitation_custody_restricted_candidate(uuid,uuid,integer,text,text,text,text,text)
 TO ${FIRST_ADMIN_BOOTSTRAP_LOGIN},${normalLogin};
 GRANT EXECUTE ON FUNCTION sabora.resolve_staff_first_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text),
 sabora.read_staff_first_admin_state_candidate(text,uuid,bigint,bigint,text) TO ${FIRST_ADMIN_BOOTSTRAP_LOGIN};
 GRANT EXECUTE ON FUNCTION sabora.resolve_staff_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text) TO ${normalLogin};
 GRANT EXECUTE ON FUNCTION sabora.read_staff_invitation_directory_dispatch_candidate(uuid,uuid) TO ${dispatchLogin};
 GRANT EXECUTE ON FUNCTION sabora.accept_staff_invitation_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,text),
 sabora.check_staff_registration_candidate(text,uuid,uuid,uuid,text,bigint,text),
 sabora.register_staff_passkey_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,uuid,uuid,text) TO ${STAFF_ENROLLMENT_LOGIN};
 GRANT ${OWNERSHIP_ROLE} TO ${ownershipLogin} WITH SET TRUE,INHERIT FALSE`);
 for(const [key,secret] of [[firstKey,firstSecret],[normalKey,normalSecret]]){
  await admin.query(`INSERT INTO sabora.staff_lifecycle_signing_keys(key_id,hmac_key,not_before,expires_at)
  VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,[key,secret]);
 }
 await admin.query(`INSERT INTO sabora.order_operation_signing_keys(key_id,hmac_key,not_before,expires_at)
 VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,[ownershipKey,ownershipSecret]);
 firstPool=new Pool({connectionString:connection(FIRST_ADMIN_BOOTSTRAP_LOGIN),max:4});
 normalPool=new Pool({connectionString:connection(normalLogin),max:4});
 ownershipPool=new Pool({connectionString:connection(ownershipLogin)});
 enrollmentPool=new Pool({connectionString:connection(STAFF_ENROLLMENT_LOGIN)});
 dispatchPool=new Pool({connectionString:connection(dispatchLogin)});
});
test.after(async()=>{await Promise.allSettled([pool?.end(),staffPool?.end(),firstPool?.end(),normalPool?.end(),ownershipPool?.end(),enrollmentPool?.end(),dispatchPool?.end()]);await admin.end();});

test('PG17 + Fastify + Chromium: ROOT and first ADMIN bootstrap, concurrency, revocation and ownership closure',{timeout:180_000},async()=>{
 const bootstrap=createStaffRootBootstrapCandidate({pool,databaseRole:login});
 const issuer='https://root-bootstrap-ci.test/auth/v1',origin='https://localhost:4189';
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'ci-root'};
 const challenges=new Map(),sessions=new Map();
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const provider={
  async options(){
   const id=randomUUID(),challenge=randomBytes(32).toString('base64url');
   challenges.set(id,challenge);
   return {challenge_id:id,expires_at:Math.floor(Date.now()/1000)+60,
    options:{challenge,rpId:new URL(origin).hostname}};
  },
  async verify(id,credential){
   const challenge=challenges.get(id);challenges.delete(id);
   const data=JSON.parse(Buffer.from(credential.response.clientDataJSON,'base64url').toString());
   if(challenge!==data.challenge)return null;
   const uid=Buffer.from(credential.response.userHandle,'base64url').toString();
   const now=Math.floor(Date.now()/1000);
   const sid=randomUUID();
   const msg=enc({typ:'JWT',alg:'RS256',kid:jwk.kid})+'.'+enc({iss:issuer,aud:'authenticated',
    sub:uid,role:'authenticated',iat:now,exp:now+120,is_anonymous:false,session_id:sid,
    amr:[{method:'passkey',timestamp:now}]});
   const token=msg+'.'+sign('RSA-SHA256',Buffer.from(msg),privateKey).toString('base64url');
   sessions.set(token,uid);return {access_token:token};
  },
  async user(token){return sessions.has(token)?{id:sessions.get(token)}:null;},
  async logout(token){return sessions.delete(token);}
 };
 const app=Fastify(),passkey=createStaffPasskeySession({issuer,origin,provider,getTrustedKeys:async()=>[jwk],secret:randomBytes(32)});
 const forRoles=createStaffProtectedHooksFromPool({pool:staffPool,issuer,
  getTrustedKeys:async()=>[jwk],authenticate:passkey.authenticate});
 const issueFirst=createStaffLifecycleDirectoryCapabilityIssuer({keyId:firstKey,secret:firstSecret,databaseRole:FIRST_ADMIN_BOOTSTRAP_LOGIN});
 const first=await createVerifiedDurableFirstAdminCandidate({pool:firstPool,role:FIRST_ADMIN_BOOTSTRAP_LOGIN,
  keyId:firstKey,secret:firstSecret,emailHashSecret,keyring});
 const normal=await createVerifiedDurableStaffAdminCandidate({pool:normalPool,role:normalLogin,
  keyId:normalKey,secret:normalSecret,emailHashSecret,keyring});
 first.register(app,{forRoles});normal.register(app,{forRoles});
 await assertOwnershipRuntimeIdentity({pool:ownershipPool,expectedLogin:ownershipLogin});
 const ownership=createOwnershipGovernanceRepository({
  withTransaction:createRoleScopedPostgresTransaction({pool:ownershipPool,role:OWNERSHIP_ROLE,allowedSql:new Set([OWNERSHIP_SQL])}),
  issueCapability:createOwnershipCapabilityIssuer({keyId:ownershipKey,secret:ownershipSecret,databaseRole:ownershipLogin})});
 registerOwnershipGovernanceHttp(app,{forRoles,repository:ownership});
 passkey.register(app,{forRoles,features:{tableChange:false,waiterCalls:false,management:false,ownership:true,staffFirstAdmin:true},rootBootstrap:bootstrap});
 let preview,browser;
 const auth='/api/v1/staff/auth';
 const post=(path,body,cookie)=>app.inject({method:'POST',url:auth+path,payload:body,
  headers:{host:new URL(origin).host,origin,...(cookie?{cookie}:{})}});
 async function attempt(userId,id,authorizationCode,endpoint='/bootstrap/root'){
  const start=await post('/options');
  assert.equal(start.statusCode,200);
  const cookie=start.headers['set-cookie'].split(';')[0];
  const data=Buffer.alloc(37);data[32]=5;
  const credential={type:'public-key',id:'fixture',rawId:'fixture',response:{
   clientDataJSON:enc({type:'webauthn.get',origin,challenge:start.json().options.challenge}),
   authenticatorData:data.toString('base64url'),signature:'fixture',userHandle:Buffer.from(userId).toString('base64url')
  }};
  return post(endpoint,endpoint==='/verify'?{credential}:{credential,grantId:id,authorizationCode},cookie);
 }
 try{
  const apiOrigin=await app.listen({host:'127.0.0.1',port:0});
  // The provider fixture signs JWTs and consumes challenges; it does not
  // implement actual WebAuthn cryptographic verification or hosted Auth.
  assert.equal((await attempt(rootId,grantId,code,'/verify')).statusCode,403);
  assert.equal((await attempt(otherId,grantId,code)).statusCode,401);
  assert.equal((await attempt(rootId,expiredId,code)).statusCode,401);
  assert.equal((await attempt(rootId,grantId,randomBytes(32).toString('base64url'))).statusCode,401);
  await assert.rejects(pool.query('SELECT verifier FROM sabora.root_bootstrap_grants'),e=>e.code==='42501');
  await assert.rejects(pool.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'root','active')",[rootId]),e=>e.code==='42501');
  await assert.rejects(pool.query(ROOT_BOOTSTRAP_SQL,[grantId,rootId,randomUUID(),login,Date.now(),Date.now()+10000,'0'.repeat(64)]),e=>e.code==='42501');
  const attempts=await Promise.all([attempt(rootId,grantId,code),attempt(rootId,grantId,code)]);
  assert.deepEqual(attempts.map(r=>r.statusCode).sort((a,b)=>a-b),[200,401],attempts.map(r=>r.body).join(' | '));
  const success=attempts.find(r=>r.statusCode===200);
  assert.equal(success.json().role,'root');
  assert.equal((await attempt(rootId,grantId,code)).statusCode,401);
  assert.deepEqual((await admin.query('SELECT user_id,role,state FROM sabora.staff_members')).rows,
   [{user_id:rootId,role:'root',state:'active'}]);
  const receipt=(await admin.query('SELECT grant_id,root_user_id,session_id FROM sabora.root_bootstrap_receipt')).rows;
  assert.deepEqual(receipt,[{grant_id:grantId,root_user_id:rootId,session_id:success.json().sessionId}]);
  assert.equal((await admin.query('SELECT verifier IS NULL AS erased FROM sabora.root_bootstrap_grants WHERE id=$1',[grantId])).rows[0].erased,true);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,null);
  await assert.rejects(admin.query('DELETE FROM sabora.root_bootstrap_receipt'),e=>e.code==='42501');
  await assert.rejects(admin.query("UPDATE sabora.staff_members SET role='admin' WHERE user_id=$1",[rootId]),e=>e.code==='42501');
  assert.equal((await attempt(rootId,grantId,code,'/verify')).statusCode,200);
  const rootCookie=success.headers['set-cookie'].find(value=>value.startsWith('__Host-sabora-staff=')).split(';')[0];
  const rootHeaders={host:new URL(origin).host,origin,cookie:rootCookie,'x-sabora-staff-session':success.json().sessionId};
  const rootPost=(payload)=>app.inject({method:'POST',url:'/api/v1/staff/bootstrap/first-admin',headers:rootHeaders,payload});
  const state=async(headers=rootHeaders)=>app.inject({method:'GET',url:'/api/v1/staff/bootstrap/first-admin',headers});
  assert.deepEqual((await state()).json(),{phase:'empty',member:null});
  preview=await startPublishedManagementPwa({apiOrigin,port:4189,tls:true});
  const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  browser=await chromium.launch({headless:true});
  const rootContext=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  const sessionCookie=(cookie)=>({name:cookie.slice(0,cookie.indexOf('=')),value:cookie.slice(cookie.indexOf('=')+1),
   url:origin,secure:true,httpOnly:true,sameSite:'Strict'});
  await rootContext.addCookies([sessionCookie(rootCookie)]);
  const rootPage=await rootContext.newPage();
  await rootPage.goto(origin+'/#equipo');
  const panel=rootPage.getByRole('region',{name:'Primer ADMIN'});
  await panel.getByRole('button',{name:'Invitar primer ADMIN'}).waitFor();
  const actionResponse=()=>rootPage.waitForResponse(r=>r.url().endsWith('/api/v1/staff/bootstrap/first-admin')&&r.request().method()==='POST');
  assert.ok([401,403].includes((await state({host:new URL(origin).host,origin})).statusCode));
  const correlation=()=>randomUUID().replaceAll('-','_');
  const inviteBody=(email,requestedRole='admin')=>({action:'invite',email,givenName:'Primer',familyName:'Admin',
   requestedRole,correlationId:correlation()});
  assert.equal((await rootPost(inviteBody('waiter@demo.invalid','waiter'))).statusCode,400);
  const sqlRepo=createStaffLifecycleRepository();
  const forbidden=issueFirst({actorId:rootId,action:'invite',enrollmentId:randomUUID(),subjectUserId:null,
   requestedRole:'waiter',inviteeEmailHashHex:hashEmail('waiter@demo.invalid'),
   inviteTokenHashHex:createHash('sha256').update('fixture').digest('hex'),
   credentialEvidenceHashHex:null,reason:null,givenName:'Persona',familyName:'Sala',
   inviteeEmail:'waiter@demo.invalid',correlationId:correlation()});
  await assert.rejects(sqlRepo.transition((_sql,values)=>firstPool.query(DIRECTORY_OUTBOX_SQL,values),forbidden),e=>e.code==='42501');
  const ordinary=(payload,headers=rootHeaders)=>app.inject({method:'POST',url:'/api/v1/staff/lifecycle',headers,payload});
  assert.equal((await ordinary(inviteBody('ordinary-root@demo.invalid'))).statusCode,403);
  const repository=createStaffInvitationOutboxRepository();
  const withTransaction=async work=>{const c=await admin.connect();try{await c.query('BEGIN');const result=await work(q=>c.query(q));await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
  const delivered=new Map();
  const readDelivery=createStaffDirectoryDispatchReaderCandidate({query:(...args)=>dispatchPool.query(...args),keyring,
   createEnrollmentUrl:async({token,enrollmentId,recipient})=>{
    return origin+'/#enrolamiento?'+new URLSearchParams({enrollmentId,token,proof:randomBytes(32).toString('base64url')});
   }});
  const send=createStaffInvitationResendSender({managementOrigin:origin,from:'sab@example.test',apiKey:'re_first_admin_fixture',
   fetchImpl:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');
    const body=JSON.parse(options.body),link=new URL(body.text.split('\n\n').at(-1));
    const fields=new URLSearchParams(link.hash.split('?')[1]);delivered.set(fields.get('enrollmentId'),{email:body.to[0],token:fields.get('token')});
    return Response.json({id:randomUUID()});}});
  async function deliver(id,version){
   const jobId=(await admin.query('SELECT id FROM sabora.staff_invitation_outbox WHERE enrollment_id=$1 AND invite_version=$2',[id,version])).rows[0].id;
   const claim=await claimCurrentStaffInvitation({withTransaction,repository,jobId});
   assert.equal(claim.claimed,true);
   assert.deepEqual(await dispatchStaffInvitation({withTransaction,repository,jobId,fence:claim.fence,readDelivery,send,
    recordOutcome:input=>recordStaffInvitationDeliveryOutcome({withTransaction,repository,...input})}),
    {recorded:true,state:'delivered',retryable:false,ambiguous:false});
   return delivered.get(id);
  }
  await panel.getByLabel('Nombre',{exact:true}).fill('Primer');
  await panel.getByLabel('Apellidos',{exact:true}).fill('Admin');
  await panel.getByLabel('Correo de invitación',{exact:true}).fill('revoked-first@demo.invalid');
  const pendingResponse=actionResponse();await panel.getByRole('button',{name:'Invitar primer ADMIN'}).click();
  const pending=await pendingResponse;assert.equal(pending.status(),201,await pending.text());
  const pendingInput=pending.request().postDataJSON(),pendingJson=await pending.json();
  const pendingId=pendingJson.enrollmentId,pendingDelivery=await deliver(pendingId,1);
  const currentState=await state();assert.equal(currentState.statusCode,200,currentState.body);
  assert.deepEqual(currentState.json(),{phase:'current',member:{enrollmentId:pendingId,givenName:'Primer',familyName:'Admin',
   email:pendingInput.email,operationalDisplayId:pendingJson.operationalDisplayId,state:'invited'}});
  assert.ok(!currentState.body.includes(pendingDelivery.token));
  assert.ok(!(await pending.text()).includes(pendingDelivery.token));
  await rootPage.reload();await panel.getByRole('heading',{name:'Primer Admin',exact:true}).waitFor();
  const replay=await rootPost(pendingInput);assert.equal(replay.statusCode,200,replay.body);
  assert.equal(replay.json().repeated,true);assert.equal(replay.json().enrollmentId,pendingId);
  assert.equal((await rootPost(inviteBody('parallel-denied@demo.invalid'))).statusCode,403);
  await panel.getByLabel('Motivo de revocación').fill('Revocación previa a la aceptación');
  const revokedResponse=actionResponse();await panel.getByRole('button',{name:'Revocar acceso'}).click();
  const revoked=await revokedResponse;assert.equal(revoked.status(),200,await revoked.text());
  await panel.getByRole('button',{name:'Invitar primer ADMIN'}).waitFor();
  assert.deepEqual((await state()).json(),{phase:'empty',member:null});
  const enrollmentSession=randomUUID();
  const mintEnrollment=()=>{
   const now=Math.floor(Date.now()/1000);
   const msg=enc({typ:'JWT',alg:'RS256',kid:jwk.kid})+'.'+enc({iss:issuer,aud:'authenticated',
    sub:otherId,role:'authenticated',iat:now,exp:now+300,is_anonymous:false,session_id:enrollmentSession,
    amr:[{method:'otp',timestamp:now}]});
   return msg+'.'+sign('RSA-SHA256',Buffer.from(msg),privateKey).toString('base64url');
  };
  let confirmedEmail=pendingDelivery.email,accessToken=mintEnrollment();
  const challengeId=randomUUID(),nonce=randomBytes(32).toString('base64url'),credentialId=randomUUID();
  const enrollment=createStaffVerifiedEnrollmentCandidate({pool:enrollmentPool,issuer,managementOrigin:origin,
   getTrustedKeys:async()=>[jwk],keyId:normalKey,secret:normalSecret,hashInviteeEmail:hashEmail,
   provider:{user:async token=>token===accessToken?{id:otherId,email:confirmedEmail,is_anonymous:false,email_confirmed_at:new Date(Date.now()-1000).toISOString()}:null,
    registrationOptions:async()=>({challenge_id:challengeId,expires_at:Math.floor(Date.now()/1000)+60,
     options:{rp:{id:new URL(origin).hostname},challenge:nonce,authenticatorSelection:{userVerification:'required'}}}),
    verifyRegistration:async(_token,challenge)=>{assert.equal(challenge,challengeId);return {id:credentialId};}}});
  const accept=(id,token)=>enrollment.accept({accessToken,enrollmentId:id,inviteToken:token,correlationId:correlation()});
  await assert.rejects(accept(pendingId,pendingDelivery.token),e=>e.code==='42501');
  const invitations=await Promise.all([rootPost(inviteBody('first-admin-a@demo.invalid')),
   rootPost(inviteBody('first-admin-b@demo.invalid'))]);
  assert.deepEqual(invitations.map(r=>r.statusCode).sort((a,b)=>a-b),[201,403],invitations.map(r=>r.body).join(' | '));
  const winner=invitations.find(r=>r.statusCode===201).json(),id=winner.enrollmentId;
  assert.match(winner.employeeCode,/^[0-9A-Z]{3}$/);
  const activate={action:'activate',enrollmentId:id,subjectUserId:null,correlationId:correlation()};
  assert.equal((await rootPost(activate)).statusCode,403);
  assert.equal((await rootPost({...activate,subjectUserId:otherId})).statusCode,400);
  const original=await deliver(id,1);
  const resent=await rootPost({action:'resend',enrollmentId:id,correlationId:correlation()});
  assert.equal(resent.statusCode,200,resent.body);
  const current=await deliver(id,2);confirmedEmail=current.email;
  await assert.rejects(accept(id,original.token),e=>e.code==='42501');
  confirmedEmail='wrong@example.invalid';await assert.rejects(accept(id,current.token),e=>e.code==='42501');
  confirmedEmail=current.email;assert.equal((await accept(id,current.token)).state,'accepted');
  assert.equal((await attempt(otherId,grantId,code,'/verify')).statusCode,403);
  assert.equal((await rootPost(activate)).statusCode,403);
  const noReceipt=issueFirst({actorId:rootId,action:'activate',enrollmentId:id,subjectUserId:otherId,
   requestedRole:null,inviteeEmailHashHex:null,inviteTokenHashHex:null,credentialEvidenceHashHex:null,
   reason:null,givenName:null,familyName:null,inviteeEmail:null,correlationId:correlation()});
  await assert.rejects(sqlRepo.transition((_sql,args)=>firstPool.query(DIRECTORY_OUTBOX_SQL,args),noReceipt),
   e=>e.code==='42501'&&e.message==='staff_registration_receipt_required');
  const options=await enrollment.registrationOptions({accessToken,enrollmentId:id});
  const rawId=randomBytes(32).toString('base64url');
  const credential={type:'public-key',id:rawId,rawId,response:{
   clientDataJSON:enc({type:'webauthn.create',origin,challenge:nonce}),attestationObject:enc('provider-fixture-only')}};
  assert.equal((await enrollment.register({accessToken,enrollmentId:id,ticket:options.ticket,credential,correlationId:correlation()})).state,'registered');
  assert.equal((await attempt(otherId,grantId,code,'/verify')).statusCode,403);
  assert.equal((await state()).json().member.state,'registered');
  await rootPage.reload();await panel.getByRole('button',{name:'Activar acceso'}).waitFor();
  const activationResponse=actionResponse();await panel.getByRole('button',{name:'Activar acceso'}).click();
  const activated=await activationResponse;assert.equal(activated.status(),200,await activated.text());
  assert.equal((await rootPost(activated.request().postDataJSON())).json().repeated,true);
  await panel.getByText('Usa el panel Titularidad de escritura para asignar el ADMIN activo.').waitFor();
  const adminSession=await attempt(otherId,grantId,code,'/verify');
  assert.equal(adminSession.statusCode,200,adminSession.body);
  assert.equal(adminSession.json().role,'admin');
  assert.equal((await rootPost(inviteBody('another-before-owner@demo.invalid'))).statusCode,403);
  const ownerAction=await app.inject({method:'POST',url:'/api/v1/admin/ownership/actions',headers:rootHeaders,
   payload:{requestId:randomUUID(),action:'force',proposalId:null,targetUserId:otherId,reason:'Titularidad inicial'}});
  assert.equal(ownerAction.statusCode,200,ownerAction.body);
  assert.equal(ownerAction.json().ownerUserId,otherId);
  assert.deepEqual((await state()).json(),{phase:'closed',member:null});
  await rootPage.reload();await panel.getByText('Arranque cerrado. La gestión ordinaria corresponde al ADMIN titular.').waitFor();
  assert.equal(await panel.getByRole('button',{name:'Invitar primer ADMIN'}).count(),0);
  assert.equal((await rootPost(inviteBody('another-after-owner@demo.invalid'))).statusCode,403);
  assert.equal((await rootPost(activate)).statusCode,403);
  assert.equal((await rootPost({action:'revoke',enrollmentId:id,subjectUserId:null,
   reason:'Intento fuera de la excepción',correlationId:correlation()})).statusCode,403);
  const adminCookie=adminSession.headers['set-cookie'].find(value=>value.startsWith('__Host-sabora-staff=')).split(';')[0];
  const adminHeaders={host:new URL(origin).host,origin,cookie:adminCookie,'x-sabora-staff-session':adminSession.json().sessionId};
  assert.equal((await app.inject({method:'POST',url:'/api/v1/staff/bootstrap/first-admin',headers:adminHeaders,payload:inviteBody('forbidden-admin@demo.invalid')})).statusCode,403);
  assert.equal((await state(adminHeaders)).statusCode,403);
  const adminContext=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  await adminContext.addCookies([sessionCookie(adminCookie)]);
  const adminPage=await adminContext.newPage();await adminPage.goto(origin+'/#equipo');
  await adminPage.getByRole('button',{name:'Cerrar sesión'}).waitFor();
  assert.equal(await adminPage.getByRole('region',{name:'Primer ADMIN'}).count(),0);
  assert.equal((await ordinary(inviteBody('ordinary-waiter@demo.invalid','waiter'),adminHeaders)).statusCode,201);
  const audit=(await admin.query(`SELECT action,actor_kind FROM sabora.staff_lifecycle_audit
    WHERE enrollment_id=$1 ORDER BY occurred_at`,[id])).rows;
  assert.deepEqual(audit,[{action:'invite',actor_kind:'root'},{action:'resend',actor_kind:'root'},
   {action:'accept',actor_kind:'invitee'},{action:'register',actor_kind:'invitee'},{action:'activate',actor_kind:'root'}]);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,otherId);
  assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.staff_members WHERE role='root'")).rows[0].n,1);
 }finally{await browser?.close();await preview?.close();await app.close();}
});
