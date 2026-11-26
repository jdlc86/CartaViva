import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffRootBootstrapCandidate,ROOT_BOOTSTRAP_SQL} from '../../apps/api/src/staff-root-bootstrap-candidate.mjs';
import {createStaffPasskeySession} from '../../apps/api/src/staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer,createStaffInviteeEmailHasher} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {createVerifiedStaffLifecycleFromPool} from '../../apps/api/src/staff-lifecycle-composition.mjs';
import {FIRST_ADMIN_BOOTSTRAP_LOGIN,STAFF_INVITATION_DELIVERY_TOKEN} from '../../apps/api/src/staff-lifecycle-coordinator.mjs';
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
const hashEmail=createStaffInviteeEmailHasher({secret:randomBytes(32)});
let pool,staffPool,firstPool,normalPool,ownershipPool;
const connection=role=>{const u=new URL(url);u.username=role;u.password=password;return u.href;};

test.before(async()=>{
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members')).rows[0].n,0);
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_root_bootstrap_pg17.sql',import.meta.url),'utf8'));
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_first_admin_bootstrap_pg17.sql',import.meta.url),'utf8'));
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
 for(const role of [FIRST_ADMIN_BOOTSTRAP_LOGIN,normalLogin,ownershipLogin]){
  await admin.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`);
 }
 await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${FIRST_ADMIN_BOOTSTRAP_LOGIN},${normalLogin};
 GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)
 TO ${FIRST_ADMIN_BOOTSTRAP_LOGIN},${normalLogin};
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
});
test.after(async()=>{await Promise.allSettled([pool?.end(),staffPool?.end(),firstPool?.end(),normalPool?.end(),ownershipPool?.end()]);await admin.end();});

test('PG17 + Fastify: ROOT and first ADMIN bootstrap, concurrency, revocation and ownership closure',async()=>{
 const bootstrap=createStaffRootBootstrapCandidate({pool,databaseRole:login});
 const issuer='https://root-bootstrap-ci.test/auth/v1',origin='https://gestion-root-ci.test:8443';
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
 const issueNormal=createStaffLifecycleDirectoryCapabilityIssuer({keyId:normalKey,secret:normalSecret,databaseRole:normalLogin});
 const baseConfig={uuid:randomUUID,issueInvitationToken:()=>randomBytes(32).toString('base64url'),hashInviteeEmail:hashEmail};
 // Explicit fixture: no real registration, email confirmation or hosted Auth.
 const first=await createVerifiedStaffLifecycleFromPool({...baseConfig,pool:firstPool,role:FIRST_ADMIN_BOOTSTRAP_LOGIN,
  issueCapability:issueFirst,firstAdminBootstrapOnly:true,
  verifyCredentialRegistration:async()=>{throw Error('root_registration_forbidden');}});
 const normal=await createVerifiedStaffLifecycleFromPool({...baseConfig,pool:normalPool,role:normalLogin,
  issueCapability:issueNormal,verifyCredentialRegistration:async({actorId,enrollmentId,evidence})=>
    createHash('sha256').update(actorId+enrollmentId+evidence).digest()});
 await assertOwnershipRuntimeIdentity({pool:ownershipPool,expectedLogin:ownershipLogin});
 const ownership=createOwnershipGovernanceRepository({
  withTransaction:createRoleScopedPostgresTransaction({pool:ownershipPool,role:OWNERSHIP_ROLE,allowedSql:new Set([OWNERSHIP_SQL])}),
  issueCapability:createOwnershipCapabilityIssuer({keyId:ownershipKey,secret:ownershipSecret,databaseRole:ownershipLogin})});
 registerOwnershipGovernanceHttp(app,{forRoles,repository:ownership});
 const tokens=new Map();
 // Test-only route. Do not mount invitation HTTP before transactional outbox.
 app.post('/ci/first-admin',{preHandler:forRoles(['root'])},async(request,reply)=>{
  try{
   const result=await first.transition({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff},request.body);
   if(result[STAFF_INVITATION_DELIVERY_TOKEN])tokens.set(result.enrollmentId,result[STAFF_INVITATION_DELIVERY_TOKEN]);
   return result;
  }catch(error){
   if(error?.code==='42501'||error?.message==='invalid_staff_lifecycle_request')return reply.code(403).send({error:'forbidden'});
   if(error?.code==='22023')return reply.code(409).send({error:'invalid_transition'});
   throw error;
  }
 });
 passkey.register(app,{forRoles,features:{},rootBootstrap:bootstrap});
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
  const rootPost=(payload)=>app.inject({method:'POST',url:'/ci/first-admin',headers:rootHeaders,payload});
  const correlation=()=>randomUUID().replaceAll('-','_');
  const inviteBody=(email,requestedRole='admin')=>({action:'invite',email,givenName:'Primer',familyName:'Admin',
   requestedRole,correlationId:correlation()});
  assert.equal((await rootPost(inviteBody('waiter@demo.invalid','waiter'))).statusCode,403);
  const sqlRepo=createStaffLifecycleRepository();
  const forbidden=issueFirst({actorId:rootId,action:'invite',enrollmentId:randomUUID(),subjectUserId:null,
   requestedRole:'waiter',inviteeEmailHashHex:hashEmail('waiter@demo.invalid'),
   inviteTokenHashHex:createHash('sha256').update('fixture').digest('hex'),
   credentialEvidenceHashHex:null,reason:null,givenName:'Persona',familyName:'Sala',
   inviteeEmail:'waiter@demo.invalid',correlationId:correlation()});
  await assert.rejects(sqlRepo.transition((sql,values)=>firstPool.query(sql,values),forbidden),e=>e.code==='42501');
  const rootContext={verifiedIdentity:{userId:rootId},verifiedStaff:{userId:rootId,role:'admin'}};
  await assert.rejects(normal.transition(rootContext,inviteBody('ordinary-root@demo.invalid')),e=>e.code==='42501');
  const pendingInput=inviteBody('revoked-first@demo.invalid');
  const pending=await rootPost(pendingInput);
  assert.equal(pending.statusCode,200,pending.body);
  const pendingId=pending.json().enrollmentId,pendingToken=tokens.get(pendingId);
  const replay=await rootPost(pendingInput);
  assert.equal(replay.statusCode,200,replay.body);
  assert.equal(replay.json().repeated,true);
  assert.equal(replay.json().enrollmentId,pendingId);
  assert.equal((await rootPost(inviteBody('parallel-denied@demo.invalid'))).statusCode,403);
  assert.equal((await rootPost({action:'revoke',enrollmentId:pendingId,subjectUserId:null,
   reason:'Revocación previa a la aceptación',correlationId:correlation()})).statusCode,200);
  const invitee={verifiedIdentity:{userId:otherId}};
  await assert.rejects(normal.transition(invitee,{action:'accept',enrollmentId:pendingId,
   inviteToken:pendingToken,correlationId:correlation()}),e=>e.code==='42501');
  const invitations=await Promise.all([rootPost(inviteBody('first-admin-a@demo.invalid')),
   rootPost(inviteBody('first-admin-b@demo.invalid'))]);
  assert.deepEqual(invitations.map(r=>r.statusCode).sort((a,b)=>a-b),[200,403],invitations.map(r=>r.body).join(' | '));
  const winner=invitations.find(r=>r.statusCode===200).json(),id=winner.enrollmentId;
  assert.match(winner.employeeCode,/^[0-9A-Z]{3}$/);
  assert.equal(winner.requestedRole,'admin');
  assert.equal((await rootPost({action:'activate',enrollmentId:id,subjectUserId:otherId,
   correlationId:correlation()})).statusCode,409);
  const originalToken=tokens.get(id);
  const resent=await rootPost({action:'resend',enrollmentId:id,correlationId:correlation()});
  assert.equal(resent.statusCode,200,resent.body);
  assert.equal(resent.json().inviteVersion,2);
  await assert.rejects(normal.transition(invitee,{action:'accept',enrollmentId:id,
   inviteToken:originalToken,correlationId:correlation()}),e=>e.code==='42501');
  assert.equal((await normal.transition(invitee,{action:'accept',enrollmentId:id,
   inviteToken:tokens.get(id),correlationId:correlation()})).currentState,'accepted');
  assert.equal((await attempt(otherId,grantId,code,'/verify')).statusCode,403);
  assert.equal((await normal.transition(invitee,{action:'register',enrollmentId:id,
   credentialRegistration:'disposable-credential-evidence-not-a-real-passkey',correlationId:correlation()})).currentState,'registered');
  assert.equal((await attempt(otherId,grantId,code,'/verify')).statusCode,403);
  assert.equal((await rootPost({action:'activate',enrollmentId:id,subjectUserId:otherId,
   correlationId:correlation()})).statusCode,200);
  const adminSession=await attempt(otherId,grantId,code,'/verify');
  assert.equal(adminSession.statusCode,200,adminSession.body);
  assert.equal(adminSession.json().role,'admin');
  assert.equal((await rootPost(inviteBody('another-before-owner@demo.invalid'))).statusCode,403);
  const ownerAction=await app.inject({method:'POST',url:'/api/v1/admin/ownership/actions',headers:rootHeaders,
   payload:{requestId:randomUUID(),action:'force',proposalId:null,targetUserId:otherId,reason:'Titularidad inicial'}});
  assert.equal(ownerAction.statusCode,200,ownerAction.body);
  assert.equal(ownerAction.json().ownerUserId,otherId);
  assert.equal((await rootPost(inviteBody('another-after-owner@demo.invalid'))).statusCode,403);
  assert.equal((await rootPost({action:'revoke',enrollmentId:id,subjectUserId:null,
   reason:'Intento fuera de la excepción',correlationId:correlation()})).statusCode,403);
  const normalAdmin={verifiedIdentity:{userId:otherId},verifiedStaff:{userId:otherId,role:'admin'}};
  assert.equal((await normal.transition(normalAdmin,inviteBody('ordinary-waiter@demo.invalid','waiter'))).currentState,'invited');
  const audit=(await admin.query(`SELECT action,actor_kind FROM sabora.staff_lifecycle_audit
    WHERE enrollment_id=$1 ORDER BY occurred_at`,[id])).rows;
  assert.deepEqual(audit,[{action:'invite',actor_kind:'root'},{action:'resend',actor_kind:'root'},
   {action:'accept',actor_kind:'invitee'},{action:'register',actor_kind:'invitee'},{action:'activate',actor_kind:'root'}]);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,otherId);
  assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.staff_members WHERE role='root'")).rows[0].n,1);
 }finally{await app.close();}
});
