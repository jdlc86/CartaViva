import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign,verify} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startPublishedManagementPwa} from './published-client-pwa-fixture.mjs';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffRootSecurityCandidate} from '../../apps/api/src/staff-root-security-candidate.mjs';
import {createStaffRecoveryRegistrationCandidate,createStaffRecoveryCeremonyCandidate,createStaffRecoveryReceiptReconcilerCandidate} from '../../apps/api/src/staff-recovery-registration-candidate.mjs';
import {createStaffRecoveryHttpComposition,registerStaffRecoveryHttpCandidate,STAFF_RECOVERY_PATH,STAFF_RECOVERY_ADMIN_PATH} from '../../apps/api/src/staff-recovery-http-candidate.mjs';
import {createStaffRecoveryDeliveryCandidate} from '../../apps/api/src/staff-recovery-delivery-candidate.mjs';
import {createStaffInvitationClassificationCandidate,createStaffRecoveryIntentCandidate} from '../../apps/api/src/staff-invitation-classification-candidate.mjs';
import {registerRootRecoveryFactorHttpCandidate,ROOT_RECOVERY_PATH} from '../../apps/api/src/staff-root-recovery-http-candidate.mjs';
import {createVerifiedRootRecoveryCandidate} from '../../apps/api/src/staff-root-recovery-composition.mjs';
import {createPublicRootRecoveryCandidate} from '../../apps/api/src/staff-root-recovery-public-candidate.mjs';
import {hashRootCredentialId} from '../../apps/api/src/staff-root-credential-id.mjs';
import {createRootRecoveryKernelCandidate,generateRootRecoveryCode,generateRootRecoveryToken,ROOT_MUTATION_PROOF_SQL,ROOT_RECOVERY_LOGIN,ROOT_RECOVERY_SQL} from '../../apps/api/src/staff-root-recovery-candidate.mjs';
import {ROOT_BOOTSTRAP_SQL} from '../../apps/api/src/staff-root-bootstrap-candidate.mjs';
import {createStaffPasskeySession} from '../../apps/api/src/staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createStaffLifecycleDirectoryCapabilityIssuer,createStaffInviteeEmailHasher} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {createVerifiedStaffIdentityLifecycleCandidate} from '../../apps/api/src/staff-identity-lifecycle-composition.mjs';
import {createStaffVerifiedEnrollmentCandidate,STAFF_ENROLLMENT_LOGIN} from '../../apps/api/src/staff-verified-enrollment-candidate.mjs';
import {createStaffDirectoryDispatchReaderCandidate,DIRECTORY_OUTBOX_SQL} from '../../apps/api/src/staff-invitation-durable-lifecycle-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';
import {claimCurrentStaffInvitation} from '../../apps/api/src/staff-invitation-claim-candidate.mjs';
import {dispatchStaffInvitation} from '../../apps/api/src/staff-invitation-dispatch-guard.mjs';
import {recordStaffInvitationDeliveryOutcome} from '../../apps/api/src/staff-invitation-delivery-outcome-candidate.mjs';
import {createStaffInvitationResendSender,createRootRecoveryResendSender,createStaffRecoveryResendSender} from '../../apps/api/src/staff-invitation-resend.mjs';
import {createRootRecoveryMailCandidate,ROOT_MAIL_LOGIN} from '../../apps/api/src/staff-root-recovery-mail-candidate.mjs';
import {FIRST_ADMIN_BOOTSTRAP_LOGIN} from '../../apps/api/src/staff-lifecycle-coordinator.mjs';
import {createStaffLifecycleRepository} from '../../apps/api/src/staff-lifecycle-repository.mjs';
import {createOwnershipCapabilityIssuer,createOwnershipGovernanceRepository,registerOwnershipGovernanceHttp,assertOwnershipRuntimeIdentity,OWNERSHIP_ROLE,OWNERSHIP_SQL} from '../../apps/api/src/ownership-governance-candidate.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';

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
const enrollmentSecret=randomBytes(32),enrollmentKey='ci_staff_enrollment_s55';
const emailHashSecret=randomBytes(32),hashEmail=createStaffInviteeEmailHasher({secret:emailHashSecret});
const dispatchLogin='sabora_ci_first_admin_dispatch',custodyKey=randomBytes(32),custodyKeyId='first_admin_custody_ci';
const keyring={active:()=>({keyId:custodyKeyId,key:custodyKey}),resolveKey:id=>id===custodyKeyId?custodyKey:null};
const recoverySigning=randomBytes(32),recoveryFactors=randomBytes(32),recoveryKey='ci_root_recovery_key';
const mailSigning=randomBytes(32),mailKey='ci_root_mail_worker_key';
const genesisCredential=Buffer.from('fixture-root-primary').toString('base64url');
let pool,staffPool,firstPool,normalPool,ownershipPool,enrollmentPool,dispatchPool,recoveryPool,mailPool;
const connection=role=>{const u=new URL(url);u.username=role;u.password=password;return u.href;};

test.before(async()=>{
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members')).rows[0].n,0);
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_root_bootstrap_pg17.sql',import.meta.url),'utf8'));
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_first_admin_bootstrap_pg17.sql',import.meta.url),'utf8'));
 for(const filename of ['staff_invitation_outbox_schema_pg17.sql','staff_invitation_custody_pg17.sql',
  'staff_invitation_custody_restricted_pg17.sql','staff_invitation_dispatch_envelope_pg17.sql',
  'staff_invitation_directory_outbox_pg17.sql','staff_first_admin_durable_pg17.sql','staff_root_recovery_pg17.sql'])
  {
   const sql=await readFile(new URL('../../docs/security/sql-candidates/'+filename,import.meta.url),'utf8');
   try{await admin.query(sql);}catch(error){
    const position=Number(error.position),line=Number.isSafeInteger(position)&&position>0?sql.slice(0,position-1).split('\n').length:null;
    throw Error(`candidate SQL installation failed: ${filename}, SQLSTATE ${error.code??'unknown'}, line ${line??'unknown'}`,{cause:error});
   }
  }
 await admin.query(`CREATE ROLE ${login} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';
 CREATE ROLE ${reader} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';
 GRANT USAGE ON SCHEMA sabora TO ${login},${reader};
 GRANT EXECUTE ON FUNCTION sabora.consume_root_bootstrap_candidate(uuid,uuid,uuid,text,bigint,bigint,text,text) TO ${login};
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
 for(const [key,secret] of [[firstKey,firstSecret],[normalKey,normalSecret],[enrollmentKey,enrollmentSecret]]){
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
  await admin.query("CREATE ROLE sabora_root_recovery_login LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
  await admin.query('GRANT USAGE ON SCHEMA sabora TO '+ROOT_RECOVERY_LOGIN);
  await admin.query('GRANT EXECUTE ON FUNCTION sabora.root_recovery_transition_candidate(text,text,uuid,uuid,text,text,text,integer,bigint,bigint,text), sabora.root_recovery_access_candidate(text,uuid,text,bigint,bigint,text), sabora.root_recovery_mail_candidate(text,uuid,uuid,text,text,bigint,bigint,text), sabora.classify_staff_invitation_candidate(text,uuid,text,text,uuid,bigint,bigint,text), sabora.authorize_staff_recovery_intent_candidate(text,uuid,text,uuid,uuid,integer,bigint,bigint,text), sabora.staff_recovery_delivery_candidate(text,text,uuid,text,bigint,bigint,text), sabora.staff_recovery_registration_candidate(text,text,uuid,uuid,uuid,text,text,bigint,bigint,text) TO '+ROOT_RECOVERY_LOGIN);
  await admin.query("INSERT INTO sabora.root_recovery_keys_candidate(key_id,hmac_key,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[recoveryKey,recoverySigning]);
  recoveryPool=new Pool({connectionString:connection(ROOT_RECOVERY_LOGIN),max:12});
  await admin.query(`CREATE ROLE ${ROOT_MAIL_LOGIN} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';
   GRANT USAGE ON SCHEMA sabora TO ${ROOT_MAIL_LOGIN};
   GRANT EXECUTE ON FUNCTION sabora.root_recovery_mail_candidate(text,uuid,uuid,text,text,bigint,bigint,text), sabora.staff_recovery_delivery_candidate(text,text,uuid,text,bigint,bigint,text) TO ${ROOT_MAIL_LOGIN}`);
  await admin.query("INSERT INTO sabora.root_recovery_keys_candidate(key_id,hmac_key,expires_at,purpose) VALUES($1,$2,clock_timestamp()+interval '1 hour','mail_worker')",[mailKey,mailSigning]);
  mailPool=new Pool({connectionString:connection(ROOT_MAIL_LOGIN),max:4});

});
test.after(async()=>{await Promise.allSettled([pool?.end(),staffPool?.end(),firstPool?.end(),normalPool?.end(),ownershipPool?.end(),enrollmentPool?.end(),dispatchPool?.end(),recoveryPool?.end(),mailPool?.end()]);await admin.end();});

test('PG17 + Fastify + Chromium: ROOT and first ADMIN bootstrap, concurrency, revocation and ownership closure',{timeout:180_000},async()=>{
 const issuer='https://root-bootstrap-ci.test/auth/v1',origin='https://localhost:4189';
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'ci-root'};
 const challenges=new Map(),sessions=new Map(),registrations=new Map();
 let loseRegistrationResponse=false;
 const rootKeys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
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
   if(credential.response.signature!=='fixture'){
    const authenticator=Buffer.from(credential.response.authenticatorData,'base64url');
    const clientData=Buffer.from(credential.response.clientDataJSON,'base64url');
    if(uid!==rootId||credential.id!==genesisCredential||!authenticator.subarray(0,32).equals(createHash('sha256').update(new URL(origin).hostname).digest())||
     !verify('sha256',Buffer.concat([authenticator,createHash('sha256').update(clientData).digest()]),rootKeys.publicKey,Buffer.from(credential.response.signature,'base64url')))return null;
   }
   const now=Math.floor(Date.now()/1000);
   const sid=randomUUID();
   const msg=enc({typ:'JWT',alg:'RS256',kid:jwk.kid})+'.'+enc({iss:issuer,aud:'authenticated',
    sub:uid,role:'authenticated',iat:now,exp:now+120,is_anonymous:false,session_id:sid,
    amr:[{method:'passkey',timestamp:now}]});
   const token=msg+'.'+sign('RSA-SHA256',Buffer.from(msg),privateKey).toString('base64url');
   sessions.set(token,uid);return {access_token:token};
  },
  async registrationOptions(token){
   assert.equal(sessions.get(token),rootId);
   const id=randomUUID(),challenge=randomBytes(32).toString('base64url');
   registrations.set(id,{token,challenge});
   return {challenge_id:id,expires_at:Math.floor(Date.now()/1000)+60,options:{challenge,
    rp:{id:new URL(origin).hostname,name:'Sabora CI'},user:{id:Buffer.from(rootId).toString('base64url'),name:'root',displayName:'ROOT'},
    pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{userVerification:'required'}}};
  },
  async verifyRegistration(token,id,credential){
   const registration=registrations.get(id);registrations.delete(id);
   assert.equal(registration?.token,token);assert.equal(sessions.get(token),rootId);
   assert.equal(JSON.parse(Buffer.from(credential.response.clientDataJSON,'base64url').toString()).challenge,registration.challenge);
   // Registration provider is a fixture: it does not cryptographically
   // verify attestation or establish behavior of hosted Auth.
   if(loseRegistrationResponse)throw Error('fixture_registration_response_lost');
   return {id:randomUUID()};
  },
  async user(token){return sessions.has(token)?{id:sessions.get(token)}:null;},
  async logout(token){return sessions.delete(token);}
 };
 const recoveryConfig={pool:recoveryPool,keyId:recoveryKey,signingSecret:recoverySigning,factorSecret:recoveryFactors};
 const rootKernel=createRootRecoveryKernelCandidate(recoveryConfig);
 const rootMail=createRootRecoveryMailCandidate({pool:recoveryPool,keyId:recoveryKey,signingSecret:recoverySigning,hash:rootKernel.hash,keyring});
 const app=Fastify(),passkey=createStaffPasskeySession({issuer,origin,provider,getTrustedKeys:async()=>[jwk],secret:randomBytes(32),rootAccess:rootKernel.allowsAccess});
 const forRoles=createStaffProtectedHooksFromPool({pool:staffPool,issuer,
  getTrustedKeys:async()=>[jwk],authenticate:passkey.authenticate});
 const issueFirst=createStaffLifecycleDirectoryCapabilityIssuer({keyId:firstKey,secret:firstSecret,databaseRole:FIRST_ADMIN_BOOTSTRAP_LOGIN});
 let enrollmentProvider,exchangeEnrollment,dispatchStarted=false;
 const enrollmentConfig={pool:enrollmentPool,expectedLogin:STAFF_ENROLLMENT_LOGIN,keyId:enrollmentKey,
  secret:enrollmentSecret,cookieSecret:randomBytes(32),exchangeInvitation:input=>exchangeEnrollment(input),
  provider:{user:token=>enrollmentProvider.user(token),
   registrationOptions:token=>enrollmentProvider.registrationOptions(token),
   verifyRegistration:(...args)=>enrollmentProvider.verifyRegistration(...args)}};
 const staffIdentity=await createVerifiedStaffIdentityLifecycleCandidate({origin,issuer,getTrustedKeys:async()=>[jwk],
  bootstrap:{pool,expectedLogin:login},
  firstAdmin:{pool:firstPool,expectedLogin:FIRST_ADMIN_BOOTSTRAP_LOGIN,keyId:firstKey,secret:firstSecret},
  admin:{pool:normalPool,expectedLogin:normalLogin,keyId:normalKey,secret:normalSecret},
  enrollment:enrollmentConfig,invitationWorker:{
   async readiness(){assert.equal((await dispatchPool.query('SELECT current_user AS role')).rows[0].role,dispatchLogin);},
   async start(){dispatchStarted=true;},async close(){dispatchStarted=false;}
  },keyring,emailHashSecret,issueRootMutationProof:rootKernel.issueMutationProof});
 staffIdentity.register(app,{forRoles});
 app.addHook('onClose',()=>staffIdentity.close());
 await staffIdentity.start();
 await assertOwnershipRuntimeIdentity({pool:ownershipPool,expectedLogin:ownershipLogin});
 const ownership=createOwnershipGovernanceRepository({
  withTransaction:createRoleScopedPostgresTransaction({pool:ownershipPool,role:OWNERSHIP_ROLE,allowedSql:new Set([OWNERSHIP_SQL,ROOT_MUTATION_PROOF_SQL])}),
  issueCapability:createOwnershipCapabilityIssuer({keyId:ownershipKey,secret:ownershipSecret,databaseRole:ownershipLogin}),
  issueRootMutationProof:rootKernel.issueMutationProof});
 registerOwnershipGovernanceHttp(app,{forRoles,repository:ownership});
 passkey.register(app,{forRoles,features:{tableChange:false,waiterCalls:false,management:false,ownership:true,staffFirstAdmin:true,rootSecurity:true,staffRecovery:true},rootBootstrap:staffIdentity.rootBootstrap,rootSecurity:createStaffRootSecurityCandidate({kernel:rootKernel,mail:rootMail})});
 registerRootRecoveryFactorHttpCandidate(app,{origin,kernel:rootKernel,mail:rootMail,getRootUserId:async()=>rootId});
 let rootAuthProvider;
 registerStaffRecoveryHttpCandidate(app,{origin,root:true,secret:randomBytes(32),
  service:createPublicRootRecoveryCandidate({origin,kernel:rootKernel,issuer,getTrustedKeys:async()=>[jwk],
   getRootUserId:async()=>rootId,ticketSecret:randomBytes(32),
   providerForRoot:async({subjectId})=>{assert.equal(subjectId,rootId);return rootAuthProvider;}})});
 let recoveryProviderFor;
 createStaffRecoveryHttpComposition({control:recoveryConfig,keyring,hashInviteeEmail:hashEmail,
  origin,issuer,getTrustedKeys:async()=>[jwk],providerFor:scope=>recoveryProviderFor(scope),
  ttlSeconds:600,httpSecret:randomBytes(32),ticketSecret:randomBytes(32)}).register(app,{forRoles});
 let preview,browser,recoveryWorker;
 const auth='/api/v1/staff/auth';
 const post=(path,body,cookie)=>app.inject({method:'POST',url:auth+path,payload:body,
  headers:{host:new URL(origin).host,origin,...(cookie?{cookie}:{})}});
 async function attempt(userId,id,authorizationCode,endpoint='/bootstrap/root',credentialId=genesisCredential){
  const start=await post('/options');
  assert.equal(start.statusCode,200);
  const cookie=start.headers['set-cookie'].split(';')[0];
  const data=Buffer.alloc(37);data[32]=5;
  const credential={type:'public-key',id:credentialId,rawId:credentialId,response:{
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
  await assert.rejects(pool.query(ROOT_BOOTSTRAP_SQL,[grantId,rootId,randomUUID(),login,Date.now(),Date.now()+10000,hashRootCredentialId(genesisCredential),'0'.repeat(64)]),e=>e.code==='42501');
  const attempts=await Promise.all([attempt(rootId,grantId,code),attempt(rootId,grantId,code)]);
  assert.deepEqual(attempts.map(r=>r.statusCode).sort((a,b)=>a-b),[200,401],attempts.map(r=>r.body).join(' | '));
  const success=attempts.find(r=>r.statusCode===200);
  assert.equal(success.json().role,'root');
  assert.equal((await attempt(rootId,grantId,code)).statusCode,401);
  assert.deepEqual((await admin.query('SELECT user_id,role,state FROM sabora.staff_members')).rows,
   [{user_id:rootId,role:'root',state:'active'}]);
  const receipt=(await admin.query('SELECT grant_id,root_user_id,session_id FROM sabora.root_bootstrap_receipt')).rows;
  assert.deepEqual(receipt,[{grant_id:grantId,root_user_id:rootId,session_id:success.json().sessionId}]);
  assert.equal((await admin.query('SELECT credential_hash FROM sabora.root_bootstrap_receipt')).rows[0].credential_hash,hashRootCredentialId(genesisCredential));
  assert.equal((await admin.query('SELECT verifier IS NULL AS erased FROM sabora.root_bootstrap_grants WHERE id=$1',[grantId])).rows[0].erased,true);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,null);
  await assert.rejects(admin.query('DELETE FROM sabora.root_bootstrap_receipt'),e=>e.code==='42501');
  await assert.rejects(admin.query("UPDATE sabora.staff_members SET role='admin' WHERE user_id=$1",[rootId]),e=>e.code==='42501');
  assert.equal((await attempt(rootId,grantId,code,'/verify')).statusCode,200);
  assert.equal((await attempt(rootId,grantId,code,'/verify',Buffer.from('unapproved').toString('base64url'))).statusCode,401);
  const rootCookie=success.headers['set-cookie'].find(value=>value.startsWith('__Host-sabora-staff=')).split(';')[0];
  const rootProof=success.headers['set-cookie'].find(value=>value.startsWith('__Host-sabora-root-proof=')).split(';')[0];
  const rootHeaders={host:new URL(origin).host,origin,cookie:rootCookie+'; '+rootProof,'x-sabora-staff-session':success.json().sessionId};
  const rootPost=(payload)=>app.inject({method:'POST',url:'/api/v1/staff/bootstrap/first-admin',headers:rootHeaders,payload});
  const state=async(headers=rootHeaders)=>app.inject({method:'GET',url:'/api/v1/staff/bootstrap/first-admin',headers});
  assert.deepEqual((await state()).json(),{phase:'empty',member:null});
  assert.equal((await state({...rootHeaders,cookie:rootCookie})).statusCode,401);
  const another=await attempt(rootId,grantId,code,'/verify');
  const otherCookie=another.headers['set-cookie'].find(value=>value.startsWith('__Host-sabora-staff=')).split(';')[0];
  assert.equal((await state({...rootHeaders,cookie:otherCookie+'; '+rootProof,'x-sabora-staff-session':another.json().sessionId})).statusCode,401);
  preview=await startPublishedManagementPwa({apiOrigin,port:4189,tls:true});
  const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  browser=await chromium.launch({headless:true});
  const rootContext=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  const sessionCookie=(cookie)=>({name:cookie.slice(0,cookie.indexOf('=')),value:cookie.slice(cookie.indexOf('=')+1),
   url:origin,secure:true,httpOnly:true,sameSite:'Strict'});
  await rootContext.addCookies([sessionCookie(rootCookie),sessionCookie(rootProof)]);
  const rootPage=await rootContext.newPage();
  const cdp=await rootContext.newCDPSession(rootPage);
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await cdp.send('WebAuthn.addCredential',{authenticatorId,credential:{credentialId:Buffer.from(genesisCredential,'base64url').toString('base64'),privateKey:rootKeys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),rpId:new URL(origin).hostname,isResidentCredential:true,signCount:0,userHandle:Buffer.from(rootId).toString('base64')}});
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
   assert.equal(dispatchStarted,true);
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
  let enrollmentSession=randomUUID(),enrollmentUserId=otherId;
  const mintEnrollment=()=>{
   const now=Math.floor(Date.now()/1000);
   const msg=enc({typ:'JWT',alg:'RS256',kid:jwk.kid})+'.'+enc({iss:issuer,aud:'authenticated',
    sub:enrollmentUserId,role:'authenticated',iat:now,exp:now+300,is_anonymous:false,session_id:enrollmentSession,
    amr:[{method:'otp',timestamp:now}]});
   return msg+'.'+sign('RSA-SHA256',Buffer.from(msg),privateKey).toString('base64url');
  };
  let confirmedEmail=pendingDelivery.email,accessToken=mintEnrollment();
  let challengeId=randomUUID(),nonce=randomBytes(32).toString('base64url'),credentialId=randomUUID();
  enrollmentProvider={user:async token=>token===accessToken?{id:enrollmentUserId,email:confirmedEmail,is_anonymous:false,email_confirmed_at:new Date(Date.now()-1000).toISOString()}:null,
   registrationOptions:async()=>({challenge_id:challengeId,expires_at:Math.floor(Date.now()/1000)+60,
    options:{rp:{id:new URL(origin).hostname,name:'Sabora'},challenge:nonce,
     user:{id:enc(enrollmentUserId),name:confirmedEmail,displayName:'Personal de prueba'},
     pubKeyCredParams:[{type:'public-key',alg:-7}],
     authenticatorSelection:{residentKey:'required',userVerification:'required'},attestation:'none'}}),
   verifyRegistration:async(_token,challenge)=>{assert.equal(challenge,challengeId);return {id:credentialId};}};
  const enrollment=createStaffVerifiedEnrollmentCandidate({...enrollmentConfig,issuer,managementOrigin:origin,
   getTrustedKeys:async()=>[jwk],hashInviteeEmail:hashEmail});
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
  confirmedEmail=current.email;
  const enrollmentProof=randomBytes(32).toString('base64url');
  exchangeEnrollment=async input=>input.enrollmentId===id&&input.authProof===enrollmentProof?{accessToken}:null;
  const enrolmentContext=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
  try{
   const page=await enrolmentContext.newPage(),virtual=await enrolmentContext.newCDPSession(page);
   await virtual.send('WebAuthn.enable');
   await virtual.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',
    hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
   await page.goto(origin+'/#enrolamiento?'+new URLSearchParams({enrollmentId:id,token:current.token,proof:enrollmentProof}));
   await page.getByRole('heading',{name:'Alta de personal en Sabora Gestión'}).waitFor();
   assert.equal(new URL(page.url()).hash,'#enrolamiento');
   await page.getByRole('button',{name:'Aceptar invitación'}).click();
   await page.getByRole('button',{name:'Registrar passkey'}).waitFor();
   const enrollmentCookie=(await enrolmentContext.cookies()).find(c=>c.name==='__Host-sabora-enrollment');
   assert.ok(enrollmentCookie?.httpOnly&&enrollmentCookie.secure&&enrollmentCookie.sameSite==='Strict');
   assert.ok(!enrollmentCookie.value.includes(accessToken));
   assert.equal((await attempt(otherId,grantId,code,'/verify')).statusCode,403);
   assert.equal((await rootPost(activate)).statusCode,403);
   const noReceipt=issueFirst({actorId:rootId,action:'activate',enrollmentId:id,subjectUserId:otherId,
    requestedRole:null,inviteeEmailHashHex:null,inviteTokenHashHex:null,credentialEvidenceHashHex:null,
    reason:null,givenName:null,familyName:null,inviteeEmail:null,correlationId:correlation()});
   await assert.rejects(sqlRepo.transition((_sql,args)=>firstPool.query(DIRECTORY_OUTBOX_SQL,args),noReceipt),
    e=>e.code==='42501'&&e.message==='staff_registration_receipt_required');
   const registered=page.waitForResponse(r=>r.url().endsWith('/api/v1/staff/enrollment/register'));
   await page.getByRole('button',{name:'Registrar passkey'}).click();
   const response=await registered;
   assert.equal(response.status(),200,await response.text());
   assert.deepEqual(await response.json(),{enrollmentId:id,state:'registered'});
   await page.getByText('Passkey registrada. Tu cuenta está pendiente de activación administrativa.').waitFor();
   assert.equal((await enrolmentContext.cookies()).some(c=>c.name===enrollmentCookie.name),false);
  }finally{await enrolmentContext.close();}
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
  const adminProof=adminSession.headers['set-cookie'].find(value=>value.startsWith('__Host-sabora-root-proof=')).split(';')[0];
  const adminHeaders={host:new URL(origin).host,origin,cookie:adminCookie+'; '+adminProof,'x-sabora-staff-session':adminSession.json().sessionId};
  assert.equal((await app.inject({method:'POST',url:'/api/v1/staff/bootstrap/first-admin',headers:adminHeaders,payload:inviteBody('forbidden-admin@demo.invalid')})).statusCode,403);
  assert.equal((await state(adminHeaders)).statusCode,403);
  const adminContext=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  await adminContext.addCookies([sessionCookie(adminCookie),sessionCookie(adminProof)]);
  const securityPath=auth+'/root-security';
  const security=(suffix='',headers=rootHeaders,body)=>app.inject({method:body===undefined?'GET':'POST',url:securityPath+suffix,headers,...(body===undefined?{}:{payload:body})});
  assert.deepEqual((await security()).json(),{configured:false,failures:'0',blockedUntil:null,mailEnabled:true,backupEnabled:true,backupConfigured:false});
  assert.equal((await security('',adminHeaders)).statusCode,403);
  assert.equal((await security('/options',adminHeaders,{action:'reset'})).statusCode,403);
  assert.equal((await security('/options',rootHeaders,{action:'configure'})).statusCode,400);
  assert.equal((await security('/verify',rootHeaders,{action:'reset',credential:{}})).statusCode,401);
  const adminPage=await adminContext.newPage();await adminPage.goto(origin+'/#equipo');
  await adminPage.getByRole('button',{name:'Cerrar sesión'}).waitFor();
  assert.equal(await adminPage.getByRole('region',{name:'Primer ADMIN'}).count(),0);
  const ordinaryWaiter=await ordinary(inviteBody('ordinary-waiter@demo.invalid','waiter'),adminHeaders);
  assert.equal(ordinaryWaiter.statusCode,201,ordinaryWaiter.body);
  const classify=createStaffInvitationClassificationCandidate({...recoveryConfig,hashInviteeEmail:hashEmail});
  const recoveryAdminRequest=(payload,headers=rootHeaders)=>app.inject({method:'POST',url:STAFF_RECOVERY_ADMIN_PATH,headers,payload});
  assert.equal((await recoveryAdminRequest({action:'classify',email:'new-person@demo.invalid'},rootHeaders)).statusCode,403);
  assert.deepEqual((await recoveryAdminRequest({action:'classify',email:'new-person@demo.invalid'},adminHeaders)).json(),{outcome:'not_recoverable'});
  assert.deepEqual((await recoveryAdminRequest({action:'classify',email:'ordinary-waiter@demo.invalid'},adminHeaders)).json(),{outcome:'not_recoverable'});
  assert.equal((await recoveryAdminRequest({action:'classify',email:current.email,subjectId:rootId})).statusCode,400);
  assert.equal((await recoveryAdminRequest({action:'classify',email:current.email},adminHeaders)).statusCode,403);
  const authority=(userId,role,credential=hashRootCredentialId(genesisCredential))=>({verifiedIdentity:{userId,expiresAt:Math.floor(Date.now()/1000)+60},
   verifiedStaff:{userId,role},verifiedRootCredential:credential});
  const rootAuthority=authority(rootId,'root',hashRootCredentialId(genesisCredential));
  const adminAuthority=authority(otherId,'admin');
  assert.deepEqual(await classify(adminAuthority,{email:'new-person@demo.invalid'}),{purpose:'new',enrollmentId:null,state:null});
  assert.deepEqual(await classify(adminAuthority,{email:'ordinary-waiter@demo.invalid'}),
   {purpose:'resend',enrollmentId:ordinaryWaiter.json().enrollmentId,state:'invited'});
  assert.deepEqual(await classify(rootAuthority,{enrollmentId:id}),{purpose:'recover',enrollmentId:id,state:'active'});
  assert.deepEqual(await classify(rootAuthority,{email:current.email}),{purpose:'recover',enrollmentId:id,state:'active'});
  await assert.rejects(classify(adminAuthority,{enrollmentId:id}),e=>e.code==='42501'); // no self-recovery
  await assert.rejects(classify(rootAuthority,{email:'new-person@demo.invalid'}),e=>e.code==='42501');
  await assert.rejects(classify(rootAuthority,{enrollmentId:ordinaryWaiter.json().enrollmentId}),e=>e.code==='42501');
  await assert.rejects(classify(rootAuthority,{enrollmentId:pendingId}),e=>e.code==='42501');
  await assert.rejects(classify(authority(rootId,'root','0'.repeat(64)),{enrollmentId:id}),e=>e.code==='42501');
  await assert.rejects(classify(adminAuthority,{email:'new-person@demo.invalid',actorId:rootId}),e=>e.code==='42501');
  const nonOwner=randomUUID();
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active')",[nonOwner]);
  await assert.rejects(classify(authority(nonOwner,'admin'),{enrollmentId:id}),e=>e.code==='42501');
  const nonOwnerSession=await attempt(nonOwner,grantId,code,'/verify');
  assert.equal(nonOwnerSession.statusCode,200,nonOwnerSession.body);
  const nonOwnerCookies=nonOwnerSession.headers['set-cookie'].filter(v=>v.startsWith('__Host-sabora-staff=')||v.startsWith('__Host-sabora-root-proof=')).map(v=>v.split(';')[0]).join('; ');
  assert.equal((await recoveryAdminRequest({action:'classify',email:current.email},{host:new URL(origin).host,origin,cookie:nonOwnerCookies,'x-sabora-staff-session':nonOwnerSession.json().sessionId})).statusCode,403);
  const authorizeRecovery=createStaffRecoveryIntentCandidate({...recoveryConfig,ttlSeconds:600});
  const recoveryRequest={enrollmentId:id,requestId:randomUUID()};
  await assert.rejects(authorizeRecovery(adminAuthority,recoveryRequest),e=>e.code==='42501');
  await assert.rejects(authorizeRecovery(authority(nonOwner,'admin'),recoveryRequest),e=>e.code==='42501');
  await assert.rejects(authorizeRecovery(rootAuthority,{enrollmentId:pendingId,requestId:randomUUID()}),e=>e.code==='42501');
  await assert.rejects(authorizeRecovery(rootAuthority,{enrollmentId:ordinaryWaiter.json().enrollmentId,requestId:randomUUID()}),e=>e.code==='42501');
  await assert.rejects(recoveryPool.query('SELECT * FROM sabora.staff_recovery_intent_candidate'),e=>e.code==='42501');
  const authorizedIntents=await Promise.all(Array.from({length:4},()=>authorizeRecovery(rootAuthority,recoveryRequest)));
  assert.equal(authorizedIntents.filter(x=>!x.repeated).length,1);
  assert.ok(authorizedIntents.every(x=>x.intentId===recoveryRequest.requestId&&x.version===1&&x.enrollmentId===id));
  const newerRequest={enrollmentId:id,requestId:randomUUID()};
  assert.equal((await authorizeRecovery(rootAuthority,newerRequest)).version,2);
  await assert.rejects(authorizeRecovery(rootAuthority,recoveryRequest),e=>e.code==='40001');
  assert.equal((await authorizeRecovery(rootAuthority,newerRequest)).repeated,true);
  const intents=(await admin.query('SELECT subject_user_id,actor_user_id,subject_role,subject_state,version FROM sabora.staff_recovery_intent_candidate ORDER BY version')).rows;
  assert.deepEqual(intents,[1,2].map(version=>({subject_user_id:otherId,actor_user_id:rootId,subject_role:'admin',subject_state:'active',version})));
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_invitation_outbox WHERE enrollment_id=$1',[id])).rows[0].n,2);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,otherId);
  await admin.query('DELETE FROM sabora.staff_members WHERE user_id=$1',[nonOwner]);
  const existing=(await admin.query('SELECT auth_user_id,state,employee_code FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0];
  assert.deepEqual(existing,{auth_user_id:otherId,state:'active',employee_code:winner.employeeCode});
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members WHERE user_id=$1',[otherId])).rows[0].n,1);
  // Real PG17 authorization + encrypted delivery + Resend/verified Auth fixtures.
  let proofCalls=0,exchangeCalls=0,recoveryProviderExtras={};const recoveryProof=randomBytes(32).toString('hex');
  const recoveryDeliveryConfig={...recoveryConfig,keyring,hashInviteeEmail:hashEmail,
   issuer,getTrustedKeys:async()=>[jwk],recoveryProviderFor:async({subjectId,email})=>{
    assert.equal(subjectId,enrollmentUserId);
    assert.ok([current.email,'ordinary-waiter@demo.invalid','recovery-kitchen@demo.invalid'].includes(email));
    return {
     ...recoveryProviderExtras,
     generateRecoveryProof:async()=>{proofCalls++;return {authProof:recoveryProof};},
     exchangeRecoveryProof:async proof=>{assert.equal(proof,recoveryProof);exchangeCalls++;return {accessToken};},
     user:async token=>token===accessToken?{id:enrollmentUserId,email:confirmedEmail,is_anonymous:false,
      email_confirmed_at:new Date(Date.now()-1000).toISOString()}:null,
    };
   }};
  recoveryProviderFor=recoveryDeliveryConfig.recoveryProviderFor;
  const recoveryDelivery=createStaffRecoveryDeliveryCandidate(recoveryDeliveryConfig);
  const recoveryDispatch=createStaffRecoveryDeliveryCandidate({pool:mailPool,keyId:mailKey,signingSecret:mailSigning,
   keyring,hashInviteeEmail:hashEmail,mode:'worker'});
  const queueRecovery=createStaffRecoveryIntentCandidate({...recoveryConfig,ttlSeconds:600,delivery:recoveryDelivery});
  const staleRequest={enrollmentId:id,requestId:randomUUID()};
  await queueRecovery(rootAuthority,staleRequest);
  const authorizeFromPanel=async(page,email)=>{
   const recoveryPanel=page.getByRole('region',{name:'Recuperar acceso del personal'});
   await recoveryPanel.getByLabel('Correo de la cuenta existente').fill(email);
   const classified=page.waitForResponse(r=>r.url().endsWith(STAFF_RECOVERY_ADMIN_PATH)&&r.request().method()==='POST');
   await recoveryPanel.getByRole('button',{name:'Comprobar cuenta'}).click();
   const classResponse=await classified;
   assert.equal(classResponse.status(),200,await classResponse.text());
   const classification=await classResponse.json();assert.equal(classification.outcome,'recoverable');
   await recoveryPanel.getByRole('checkbox',{name:/Confirmo la recuperación/}).check();
   const authorized=page.waitForResponse(r=>r.url().endsWith(STAFF_RECOVERY_ADMIN_PATH)&&r.request().method()==='POST');
   await recoveryPanel.getByRole('button',{name:'Autorizar recuperación'}).click();
   const authResponse=await authorized;assert.equal(authResponse.status(),201,await authResponse.text());
   const result=await authResponse.json();assert.equal(result.outcome,'queued');assert.equal(result.enrollmentId,classification.enrollmentId);
   assert.deepEqual(Object.keys(result).sort(),['enrollmentId','expiresAt','outcome','repeated','requestId','version'].sort());
   await recoveryPanel.getByText(/Invitación de recuperación en cola. Entrega aún no confirmada/).waitFor();
   return {enrollmentId:result.enrollmentId,requestId:result.requestId};
  };
  const latestRequest=await authorizeFromPanel(rootPage,current.email);
  assert.equal(latestRequest.enrollmentId,id);
  const replayRecovery=await recoveryAdminRequest({action:'authorize',email:current.email,...latestRequest});
  assert.equal(replayRecovery.statusCode,200,replayRecovery.body);assert.equal(replayRecovery.json().repeated,true);
  assert.equal((await recoveryAdminRequest({action:'authorize',email:current.email,enrollmentId:ordinaryWaiter.json().enrollmentId,requestId:randomUUID()})).statusCode,403);
  assert.ok((await recoveryDispatch.list()).includes(latestRequest.requestId));
  const staffInbox=[];
  const staffResend={managementOrigin:origin,from:'sab@example.test',apiKey:'re_staff_recovery_fixture',
   fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.resend.com/emails');
    assert.match(options.headers['Idempotency-Key'],/^sabora-staff-staff-recovery\//);
    const body=JSON.parse(options.body),link=new URL(body.text.split('\n\n').at(-1));
    assert.equal(body.to[0],current.email);
    assert.equal(link.hash.split('?')[0],'#recuperacion-personal');
    const params=new URLSearchParams(link.hash.split('?')[1]);
    staffInbox.push({intentId:params.get('intentId'),token:params.get('token')});
    return Response.json({id:randomUUID()});
   }};
  const recoverySender=createStaffRecoveryResendSender(staffResend);
  const workerFailures=[];
  const staffWorkerConfig={
   control:{pool:recoveryPool,expectedLogin:ROOT_RECOVERY_LOGIN,keyId:recoveryKey,signingSecret:recoverySigning},
   worker:{pool:mailPool,expectedLogin:ROOT_MAIL_LOGIN,keyId:mailKey,signingSecret:mailSigning},
   getRootUserId:async()=>null,factorSecret:recoveryFactors,keyring,resend:staffResend,hashInviteeEmail:hashEmail,
   observeFailure:error=>workerFailures.push(error.message),
  };
  const workers=await Promise.all(Array.from({length:3},()=>createVerifiedRootRecoveryCandidate(staffWorkerConfig)));
  try{
   await Promise.all(workers.map(worker=>worker.start()));
   await Promise.all(workers.map(worker=>worker.tick()));
  }finally{await Promise.all(workers.map(worker=>worker.close()));}
  assert.deepEqual(workerFailures,[]);
  assert.deepEqual((await admin.query('SELECT state,envelope FROM sabora.staff_recovery_delivery_candidate WHERE intent_id=$1',[staleRequest.requestId])).rows[0],{state:'cancelled',envelope:null});
  assert.equal((await recoveryDispatch.dispatch(latestRequest.requestId,recoverySender)).outcome,'denied');
  assert.equal(staffInbox.length,1);
  assert.equal(staffInbox[0].intentId,latestRequest.requestId);
  const stored=(await admin.query('SELECT state,envelope FROM sabora.staff_recovery_delivery_candidate WHERE intent_id=$1',[latestRequest.requestId])).rows[0];
  assert.deepEqual(stored,{state:'delivered',envelope:null});
  const recoveryInput={...staffInbox[0]};
  await assert.rejects(recoveryDelivery.exchange({...recoveryInput,token:generateRootRecoveryToken()}),e=>e.code==='42501');
  assert.deepEqual([proofCalls,exchangeCalls],[0,0]);
  confirmedEmail=current.email;
  const exchanged=await Promise.allSettled(Array.from({length:3},()=>recoveryDelivery.exchange(recoveryInput)));
  assert.equal(exchanged.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(exchanged.filter(x=>x.status==='rejected'&&x.reason.code==='42501').length,2);
  const restricted=exchanged.find(x=>x.status==='fulfilled').value;
  assert.deepEqual(restricted,{outcome:'consumed',enrollmentId:id,version:4});
  assert.equal(restricted.accessToken,accessToken);
  assert.equal(JSON.stringify(restricted).includes(accessToken),false);
  await assert.rejects(recoveryDelivery.exchange(recoveryInput),e=>e.code==='42501');
  assert.deepEqual([proofCalls,exchangeCalls],[1,1]);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members WHERE user_id=$1',[otherId])).rows[0].n,1);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,otherId);
  // Authorize recoveries for two ordinary active staff before the titular
  // ADMIN's credential changes. Use the existing enrollment flow, not
  // fabricated memberships. Keep one job queued and consume the other.
  const oldEnrollmentContext={enrollmentSession,enrollmentUserId,accessToken,confirmedEmail};
  async function activateForRecovery(enrollmentId,expectedRole){
   const invitation=await deliver(enrollmentId,1);
   enrollmentUserId=randomUUID();enrollmentSession=randomUUID();accessToken=mintEnrollment();
   confirmedEmail=invitation.email;
   challengeId=randomUUID();nonce=randomBytes(32).toString('base64url');credentialId=randomUUID();
   assert.equal((await accept(enrollmentId,invitation.token)).state,'accepted');
   const opt=await enrollment.registrationOptions({accessToken,enrollmentId});
   const raw=randomBytes(32).toString('base64url');
   assert.equal((await enrollment.register({accessToken,enrollmentId,ticket:opt.ticket,credential:{
    type:'public-key',id:raw,rawId:raw,response:{clientDataJSON:enc({type:'webauthn.create',origin,challenge:nonce}),
    attestationObject:enc('provider-fixture-only')}},correlationId:correlation()})).state,'registered');
   // The HTTP boundary resolves the subject from the durable enrollment.
   // A caller-supplied UUID must be rejected, even when it is correct.
   const supplied=await ordinary({action:'activate',enrollmentId,subjectUserId:enrollmentUserId,correlationId:correlation()},adminHeaders);
   assert.equal(supplied.statusCode,400,supplied.body);
   assert.equal(supplied.json().error,'invalid_staff_lifecycle_request');
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members WHERE user_id=$1',[enrollmentUserId])).rows[0].n,0);
   const activation=await ordinary({action:'activate',enrollmentId,subjectUserId:null,correlationId:correlation()},adminHeaders);
   assert.equal(activation.statusCode,200,activation.body);
   assert.equal(activation.json().state,'active');
   assert.deepEqual((await admin.query('SELECT role,state FROM sabora.staff_members WHERE user_id=$1',[enrollmentUserId])).rows,[{role:expectedRole,state:'active'}]);
   return {enrollmentId,subjectId:enrollmentUserId,sessionId:enrollmentSession};
  }
  const queuedTarget=await activateForRecovery(ordinaryWaiter.json().enrollmentId,'waiter');
  const kitchen=await ordinary(inviteBody('recovery-kitchen@demo.invalid','kitchen'),adminHeaders);
  assert.equal(kitchen.statusCode,201,kitchen.body);
  const consumedTarget=await activateForRecovery(kitchen.json().enrollmentId,'kitchen');
  const queuedByAdmin=await authorizeFromPanel(adminPage,'ordinary-waiter@demo.invalid');
  assert.equal(queuedByAdmin.enrollmentId,queuedTarget.enrollmentId);
  const consumedByAdmin=await authorizeFromPanel(adminPage,'recovery-kitchen@demo.invalid');
  assert.equal(consumedByAdmin.enrollmentId,consumedTarget.enrollmentId);
  const preRecoveryAdmin=authority(otherId,'admin',hashRootCredentialId(genesisCredential));
  assert.equal((await recoveryAdminRequest({action:'authorize',email:'recovery-kitchen@demo.invalid',...consumedByAdmin},adminHeaders)).json().repeated,true);
  let consumedRecoveryToken;
  assert.equal((await recoveryDispatch.dispatch(consumedByAdmin.requestId,async job=>{
   assert.equal(job.intentId,consumedByAdmin.requestId);
   consumedRecoveryToken=job.token;
   return {outcome:'accepted',providerId:randomUUID()};
  })).outcome,'accepted');
  assert.equal((await recoveryDelivery.exchange({intentId:consumedByAdmin.requestId,token:consumedRecoveryToken})).outcome,'consumed');
  const retiredAuthoritySession=accessToken;
  ({enrollmentSession,enrollmentUserId,accessToken,confirmedEmail}=oldEnrollmentContext);
  const staffRegistration=createStaffRecoveryRegistrationCandidate(recoveryConfig);
  const consumedSession=(await admin.query('SELECT consumed_session FROM sabora.staff_recovery_delivery_candidate WHERE intent_id=$1',[latestRequest.requestId])).rows[0].consumed_session;
  const staffNewCredential=Buffer.from('fixture-staff-replacement').toString('base64url');
  const staffNewHash=hashRootCredentialId(staffNewCredential);
  const staffOldHash=hashRootCredentialId(genesisCredential);
  const evidence=label=>createHash('sha256').update(label).digest('hex');
  const staffBinding={intentId:latestRequest.requestId,subjectId:otherId,sessionId:consumedSession,credentialHash:staffNewHash};
  assert.equal((await staffRegistration('complete',staffBinding)).outcome,'denied');
  assert.equal((await staffRegistration('prepare',{...staffBinding,sessionId:randomUUID(),evidenceHash:evidence('staff-ceremony'),details:{challengeId:randomUUID(),previousProviderIds:[]}})).outcome,'denied');
  assert.equal(await rootKernel.allowsAccess(otherId,staffOldHash),true);
  // Integrate the signed Auth-session ceremony with the real PG17 fence.
  const oldProviderId=randomUUID(),newProviderId=randomUUID();
  let providerIds=[oldProviderId],registrationCalls=0,revocationCalls=0,logoutCalls=0;
  const recoveryCeremonyChallenge=randomUUID(),recoveryCeremonyNonce=randomBytes(32).toString('base64url');
  const ceremonyProvider={
   user:async token=>token===accessToken?{id:enrollmentUserId,email:confirmedEmail,is_anonymous:false,
    email_confirmed_at:new Date(Date.now()-1000).toISOString()}:null,
   registrationOptions:async token=>{
    assert.equal(token,accessToken);
    return {challenge_id:recoveryCeremonyChallenge,expires_at:Math.floor(Date.now()/1000)+60,
     options:{rp:{id:new URL(origin).hostname},challenge:recoveryCeremonyNonce,authenticatorSelection:{userVerification:'required'}}};
   },
   listPasskeys:async subject=>{assert.equal(subject,otherId);return [...providerIds];},
   verifyRegistration:async(token,challenge,credential)=>{
    assert.equal(token,accessToken);assert.equal(challenge,recoveryCeremonyChallenge);
    assert.equal(credential.id,staffNewCredential);registrationCalls++;
    const preparedSnapshot=await staffRegistration('inspect',{intentId:latestRequest.requestId});
    assert.equal(preparedSnapshot.outcome,'inspected');
    assert.equal(preparedSnapshot.subjectId,otherId);assert.equal(preparedSnapshot.sessionId,consumedSession);
    assert.equal(preparedSnapshot.credentialHash,staffNewHash);assert.equal(preparedSnapshot.challengeId,recoveryCeremonyChallenge);
    assert.deepEqual(preparedSnapshot.previousProviderIds,[oldProviderId]);
    assert.equal(preparedSnapshot.replacementProviderId,null);assert.equal(preparedSnapshot.registrationReceiptHash,null);
    assert.equal(preparedSnapshot.revocationReceiptHash,null);assert.equal(preparedSnapshot.completed,false);
    assert.ok(!JSON.stringify(preparedSnapshot).includes(accessToken));
    assert.equal(await rootKernel.allowsAccess(otherId,staffOldHash),false);
    assert.equal(await rootKernel.allowsAccess(otherId,staffNewHash),false);
    assert.equal((await state(adminHeaders)).statusCode,401);
    await assert.rejects(authorizeRecovery(rootAuthority,{enrollmentId:id,requestId:randomUUID()}),e=>e.code==='42501');
    assert.equal((await staffRegistration('record_revocation',{...staffBinding,evidenceHash:evidence('staff-revoke')})).outcome,'denied');
    assert.equal((await staffRegistration('record_registration',{...staffBinding,credentialHash:staffOldHash,evidenceHash:evidence('staff-register'),details:{replacementProviderId:newProviderId}})).outcome,'denied');
    assert.equal((await staffRegistration('record_registration',{...staffBinding,evidenceHash:evidence('wrong-existing-provider'),details:{replacementProviderId:oldProviderId}})).outcome,'denied');
    providerIds.push(newProviderId);return {id:newProviderId};
   },
   revokePasskey:async(subject,previous)=>{
    assert.equal(subject,otherId);assert.equal(previous,oldProviderId);revocationCalls++;
    assert.equal((await staffRegistration('complete',staffBinding)).outcome,'denied');
    providerIds=providerIds.filter(x=>x!==previous);return true;
   },
   logoutAll:async token=>{assert.equal(token,accessToken);logoutCalls++;assert.deepEqual(providerIds,[newProviderId]);return true;},
  };
  let lostFinalReceipt=false;
  const ceremonyConfig={registration:async(action,binding)=>{
   const result=await staffRegistration(action,binding);
   if(action==='record_revocation'&&result.outcome==='revocation_recorded'&&!lostFinalReceipt){
    lostFinalReceipt=true;throw Error('fixture_durable_revocation_receipt_response_lost');
   }
   return result;
  },provider:ceremonyProvider,issuer,
   getTrustedKeys:async()=>[jwk],managementOrigin:origin,ticketSecret:randomBytes(32)};
  const recoveryCeremony=createStaffRecoveryCeremonyCandidate(ceremonyConfig);
  const ceremonyOptions=await recoveryCeremony.options({accessToken,intentId:latestRequest.requestId});
  const ceremonyCredential={type:'public-key',id:staffNewCredential,rawId:staffNewCredential,response:{
   clientDataJSON:enc({type:'webauthn.create',origin,challenge:recoveryCeremonyNonce}),
   attestationObject:enc('provider-fixture-only')}};
  const ceremonyInput={accessToken,intentId:latestRequest.requestId,ticket:ceremonyOptions.ticket,credential:ceremonyCredential};
  await assert.rejects(recoveryCeremony.register({...ceremonyInput,intentId:randomUUID()}),e=>e.code==='42501');
  await assert.rejects(recoveryCeremony.register({...ceremonyInput,ticket:ceremonyOptions.ticket.slice(0,-1)+
   (ceremonyOptions.ticket.endsWith('0')?'1':'0')}),e=>e.code==='42501');
  assert.equal(registrationCalls,0);
  assert.equal(await rootKernel.allowsAccess(otherId,staffOldHash),true);
  const raced=await Promise.allSettled(Array.from({length:3},()=>recoveryCeremony.register(ceremonyInput)));
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,0);
  assert.equal(raced.filter(x=>x.status==='rejected'&&x.reason.code==='42501').length,2);
  assert.equal(raced.filter(x=>x.status==='rejected'&&x.reason.message==='staff_recovery_provider_reconciliation_required').length,1);
  assert.equal(lostFinalReceipt,true);
  const durableSnapshot=await createStaffRecoveryRegistrationCandidate(recoveryConfig)('inspect',{intentId:latestRequest.requestId});
  assert.equal(durableSnapshot.outcome,'inspected');assert.equal(durableSnapshot.completed,false);
  assert.equal(durableSnapshot.replacementProviderId,newProviderId);
  assert.deepEqual(durableSnapshot.previousProviderIds,[oldProviderId]);
  assert.match(durableSnapshot.registrationReceiptHash,/^[0-9a-f]{64}$/);
  assert.match(durableSnapshot.revocationReceiptHash,/^[0-9a-f]{64}$/);
  assert.equal(await rootKernel.allowsAccess(otherId,staffOldHash),false);
  assert.equal(await rootKernel.allowsAccess(otherId,staffNewHash),false);
  assert.deepEqual(await staffRegistration('list_ready'),[latestRequest.requestId]);
  const restartedWorkers=await Promise.all(Array.from({length:2},()=>createVerifiedRootRecoveryCandidate(staffWorkerConfig)));
  try{
   await Promise.all(restartedWorkers.map(worker=>worker.start()));
  }finally{await Promise.all(restartedWorkers.map(worker=>worker.close()));}
  assert.deepEqual(await staffRegistration('list_ready'),[]);
  assert.equal((await staffRegistration('inspect',{intentId:latestRequest.requestId})).completed,true);
  assert.deepEqual([registrationCalls,revocationCalls,logoutCalls],[1,1,1]);
  assert.deepEqual(providerIds,[newProviderId]);
  await assert.rejects(createStaffRecoveryCeremonyCandidate(ceremonyConfig).register(ceremonyInput),e=>e.code==='42501');
  assert.deepEqual([registrationCalls,revocationCalls,logoutCalls],[1,1,1]);
  assert.equal((await staffRegistration('complete',staffBinding)).outcome,'denied');
  assert.equal(await rootKernel.allowsAccess(otherId,staffOldHash),false);
  assert.equal(await rootKernel.allowsAccess(otherId,null),false);
  assert.equal(await rootKernel.allowsAccess(otherId,staffNewHash),true);
  assert.equal((await state(adminHeaders)).statusCode,401);
  assert.equal((await attempt(otherId,grantId,code,'/verify')).statusCode,401);
  assert.equal((await attempt(otherId,grantId,code,'/verify',staffNewCredential)).statusCode,200);
  // The retired ADMIN credential may not authorize new or outstanding
  // recovery work, even when a verified HTTP context was admitted earlier.
  const freshAdminAuthority=authority(otherId,'admin',staffNewHash);
  const retiredAdminAuthority=authority(otherId,'admin',staffOldHash);
  const issueNormal=createStaffLifecycleDirectoryCapabilityIssuer({
   keyId:normalKey,secret:normalSecret,databaseRole:normalLogin});
  const ordinaryCorrelation=correlation();
  const ordinaryCapability=issueNormal({actorId:otherId,action:'suspend',enrollmentId:queuedTarget.enrollmentId,
   subjectUserId:queuedTarget.subjectId,requestedRole:null,inviteeEmailHashHex:null,inviteTokenHashHex:null,
   credentialEvidenceHashHex:null,reason:'Comprobación de autoridad vigente',givenName:null,familyName:null,
   inviteeEmail:null,correlationId:ordinaryCorrelation});
  const ordinaryTx=createPostgresTransaction({pool:normalPool});
  const runOrdinary=(credentialHash,rollback)=>ordinaryTx(async query=>{
   const proof=rootKernel.issueMutationProof({actorId:otherId,credentialHash,scope:'staff-admin',
    deadlineMs:ordinaryCapability.expiresAtMs,binding:ordinaryCorrelation});
   await query(ROOT_MUTATION_PROOF_SQL,[proof]);
   const result=await sqlRepo.transition((_sql,args)=>query(DIRECTORY_OUTBOX_SQL,args),ordinaryCapability);
   assert.equal(result.currentState,'suspended');
   throw rollback;
  });
  const rollback=Error('fixture_rollback_authorized_staff_mutation');
  await assert.rejects(runOrdinary(staffOldHash,rollback),e=>e.code==='42501'&&e.message==='staff_mutation_recovery_forbidden');
  assert.deepEqual((await admin.query('SELECT state FROM sabora.staff_members WHERE user_id=$1',
   [queuedTarget.subjectId])).rows,[{state:'active'}]);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_lifecycle_audit WHERE correlation_id=$1',
   [ordinaryCorrelation])).rows[0].n,0);
  await assert.rejects(runOrdinary(staffNewHash,rollback),e=>e===rollback);
  await assert.rejects(classify(retiredAdminAuthority,{enrollmentId:queuedTarget.enrollmentId}),e=>e.code==='42501');
  await assert.rejects(classify(authority(otherId,'admin',null),{enrollmentId:queuedTarget.enrollmentId}),e=>e.code==='42501');
  await assert.rejects(queueRecovery(retiredAdminAuthority,{enrollmentId:queuedTarget.enrollmentId,requestId:randomUUID()}),e=>e.code==='42501');
  assert.deepEqual((await admin.query('SELECT state,envelope FROM sabora.staff_recovery_delivery_candidate WHERE intent_id=$1',
   [queuedByAdmin.requestId])).rows,[{state:'cancelled',envelope:null}]);
  assert.equal((await recoveryDispatch.dispatch(queuedByAdmin.requestId,async()=>{assert.fail('retired authorizer must not send');})).outcome,'denied');
  assert.equal((await staffRegistration('prepare',{intentId:consumedByAdmin.requestId,subjectId:consumedTarget.subjectId,
   sessionId:consumedTarget.sessionId,credentialHash:evidence('kitchen-replacement'),evidenceHash:evidence('kitchen-ceremony'),details:{challengeId:randomUUID(),previousProviderIds:[]}})).outcome,'denied');
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_recovery_registration_candidate WHERE intent_id=$1',[consumedByAdmin.requestId])).rows[0].n,0);
  await assert.rejects(recoveryDelivery.sessionContext({intentId:consumedByAdmin.requestId,accessToken:retiredAuthoritySession}),e=>e.code==='42501');
  assert.deepEqual(await classify(freshAdminAuthority,{enrollmentId:queuedTarget.enrollmentId}),
   {purpose:'recover',enrollmentId:queuedTarget.enrollmentId,state:'active'});
  const freshIntent=await queueRecovery(freshAdminAuthority,{enrollmentId:queuedTarget.enrollmentId,requestId:randomUUID()});
  assert.equal(freshIntent.version,2);
  let freshRecoveryToken;
  assert.equal((await recoveryDispatch.dispatch(freshIntent.intentId,async job=>{
   assert.equal(job.intentId,freshIntent.intentId);freshRecoveryToken=job.token;
   return {outcome:'accepted',providerId:randomUUID()};
  })).outcome,'accepted');
  // A lost provider response must leave the waiter fenced after restart.
  const adminEnrollmentContext={enrollmentSession,enrollmentUserId,accessToken,confirmedEmail};
  enrollmentUserId=queuedTarget.subjectId;enrollmentSession=randomUUID();accessToken=mintEnrollment();
  confirmedEmail='ordinary-waiter@demo.invalid';
  assert.equal((await recoveryDelivery.exchange({intentId:freshIntent.intentId,token:freshRecoveryToken})).outcome,'consumed');
  const waiterReplacement=randomBytes(32).toString('base64url'),waiterHash=hashRootCredentialId(waiterReplacement);
  const waiterOldProviderId=randomUUID(),waiterNewProviderId=randomUUID();
  let waiterProviderIds=[waiterOldProviderId],uncertainCalls=0;
  const waiterChallenge=randomUUID(),waiterNonce=randomBytes(32).toString('base64url');
  const uncertainProvider={...ceremonyProvider,
   registrationOptions:async token=>{assert.equal(token,accessToken);return {challenge_id:waiterChallenge,expires_at:Math.floor(Date.now()/1000)+60,
    options:{rp:{id:new URL(origin).hostname},challenge:waiterNonce,authenticatorSelection:{userVerification:'required'}}};},
   listPasskeys:async subject=>{assert.equal(subject,queuedTarget.subjectId);return [...waiterProviderIds];},
   verifyRegistration:async()=>{
    uncertainCalls++;assert.equal(await rootKernel.allowsAccess(queuedTarget.subjectId,waiterHash),false);
    waiterProviderIds.push(waiterNewProviderId);throw Error('fixture_registration_response_lost');
   },
   revokePasskey:async()=>assert.fail('uncertain registration must not revoke'),
   logoutAll:async()=>assert.fail('uncertain registration must not complete'),
  };
  const uncertainConfig={...ceremonyConfig,provider:uncertainProvider};
  const uncertainCeremony=createStaffRecoveryCeremonyCandidate(uncertainConfig);
  const waiterOptions=await uncertainCeremony.options({accessToken,intentId:freshIntent.intentId});
  const waiterInput={accessToken,intentId:freshIntent.intentId,ticket:waiterOptions.ticket,
   credential:{...ceremonyCredential,id:waiterReplacement,rawId:waiterReplacement,response:{...ceremonyCredential.response,
    clientDataJSON:enc({type:'webauthn.create',origin,challenge:waiterNonce})}}};
  await assert.rejects(uncertainCeremony.register(waiterInput),/staff_recovery_provider_reconciliation_required/);
  await assert.rejects(createStaffRecoveryCeremonyCandidate(uncertainConfig).register(waiterInput),e=>e.code==='42501');
  assert.equal(uncertainCalls,1);
  const unknownSnapshot=await createStaffRecoveryRegistrationCandidate(recoveryConfig)('inspect',{intentId:freshIntent.intentId});
  assert.equal(unknownSnapshot.outcome,'inspected');assert.equal(unknownSnapshot.completed,false);
  assert.equal(unknownSnapshot.challengeId,waiterChallenge);assert.equal(unknownSnapshot.credentialHash,waiterHash);
  assert.deepEqual(unknownSnapshot.previousProviderIds,[waiterOldProviderId]);
  assert.equal(unknownSnapshot.replacementProviderId,null);
  assert.equal(unknownSnapshot.registrationReceiptHash,null);
  assert.deepEqual(await staffRegistration('list_ready'),[]);
  const unknownResume=createStaffRecoveryReceiptReconcilerCandidate({registration:createStaffRecoveryRegistrationCandidate(recoveryConfig)});
  assert.deepEqual(await Promise.all([unknownResume(freshIntent.intentId),unknownResume(freshIntent.intentId)]),
   [{outcome:'requires_provider_evidence'},{outcome:'requires_provider_evidence'}]);
  assert.equal(uncertainCalls,1);
  assert.equal(await rootKernel.allowsAccess(queuedTarget.subjectId,waiterHash),false);
  assert.equal(await rootKernel.allowsAccess(queuedTarget.subjectId,hashRootCredentialId(genesisCredential)),false);
  assert.deepEqual((await admin.query('SELECT completed_at,registration_receipt_hash,revocation_receipt_hash FROM sabora.staff_recovery_registration_candidate WHERE intent_id=$1',[freshIntent.intentId])).rows,
   [{completed_at:null,registration_receipt_hash:null,revocation_receipt_hash:null}]);
  // A provider email mismatch consumes the right to exchange, not the
  // invitation or membership. No further remote attempt after restart.
  const wrongEmailIntent=await queueRecovery(freshAdminAuthority,{enrollmentId:consumedTarget.enrollmentId,requestId:randomUUID()});
  let wrongEmailToken;
  assert.equal((await recoveryDispatch.dispatch(wrongEmailIntent.intentId,async job=>{
   wrongEmailToken=job.token;return {outcome:'accepted',providerId:randomUUID()};
  })).outcome,'accepted');
  enrollmentUserId=consumedTarget.subjectId;enrollmentSession=randomUUID();accessToken=mintEnrollment();
  confirmedEmail='wrong@example.invalid';
  const wrongEmailInput={intentId:wrongEmailIntent.intentId,token:wrongEmailToken};
  const beforeWrong=[proofCalls,exchangeCalls];
  await assert.rejects(recoveryDelivery.exchange(wrongEmailInput),e=>e.code==='42501');
  confirmedEmail='recovery-kitchen@demo.invalid';
  await assert.rejects(createStaffRecoveryDeliveryCandidate(recoveryDeliveryConfig).exchange(wrongEmailInput),e=>e.code==='42501');
  assert.deepEqual([proofCalls,exchangeCalls],beforeWrong.map(n=>n+1));
  assert.deepEqual((await admin.query('SELECT state,consumed_session FROM sabora.staff_recovery_delivery_candidate WHERE intent_id=$1',[wrongEmailIntent.intentId])).rows,
   [{state:'exchanging',consumed_session:null}]);
  // New authorized recovery for kitchen, through the published PWA, HTTPS
  // proxy, Fastify, real SQL, and Chromium virtual authenticator. Provider
  // calls remain fixtures, not evidence of the hosted service.
  const browserIntent=await queueRecovery(freshAdminAuthority,{enrollmentId:consumedTarget.enrollmentId,requestId:randomUUID()});
  let browserRecoveryToken;
  assert.equal((await recoveryDispatch.dispatch(browserIntent.intentId,async job=>{
   browserRecoveryToken=job.token;return {outcome:'accepted',providerId:randomUUID()};
  })).outcome,'accepted');
  enrollmentSession=randomUUID();accessToken=mintEnrollment();
  const kitchenOldProviderId=randomUUID(),kitchenNewProviderId=randomUUID(),kitchenChallengeId=randomUUID();
  const kitchenNonce=randomBytes(32).toString('base64url');
  let kitchenProviderIds=[kitchenOldProviderId],kitchenCredential,kitchenRegistrations=0,kitchenRevocations=0,kitchenLogouts=0;
  recoveryProviderExtras={
   registrationOptions:async token=>{
    assert.equal(token,accessToken);
    return {challenge_id:kitchenChallengeId,expires_at:Math.floor(Date.now()/1000)+60,options:{
     rp:{id:new URL(origin).hostname,name:'Sabora'},user:{id:Buffer.from(consumedTarget.subjectId).toString('base64url'),name:'kitchen@example.invalid',displayName:'Cocina'},
     challenge:kitchenNonce,pubKeyCredParams:[{type:'public-key',alg:-7}],timeout:60000,
     authenticatorSelection:{residentKey:'required',userVerification:'required'},attestation:'none'}};
   },
   listPasskeys:async subject=>{assert.equal(subject,consumedTarget.subjectId);return [...kitchenProviderIds];},
   verifyRegistration:async(token,challenge,credential)=>{
    assert.equal(token,accessToken);assert.equal(challenge,kitchenChallengeId);
    kitchenCredential=credential.id;kitchenRegistrations++;
    assert.equal(await rootKernel.allowsAccess(consumedTarget.subjectId,hashRootCredentialId(kitchenCredential)),false);
    kitchenProviderIds.push(kitchenNewProviderId);return {id:kitchenNewProviderId};
   },
   revokePasskey:async(subject,previous)=>{
    assert.equal(subject,consumedTarget.subjectId);assert.equal(previous,kitchenOldProviderId);kitchenRevocations++;
    kitchenProviderIds=kitchenProviderIds.filter(x=>x!==previous);return true;
   },
   logoutAll:async token=>{assert.equal(token,accessToken);kitchenLogouts++;return true;}
  };
  const publicHeaders={host:new URL(origin).host,origin};
  const publicRecovery=(suffix,payload,headers=publicHeaders)=>app.inject({method:'POST',url:STAFF_RECOVERY_PATH+suffix,headers,payload});
  assert.equal((await publicRecovery('/options',{})).statusCode,403);
  assert.equal((await publicRecovery('/accept',{intentId:browserIntent.intentId,token:browserRecoveryToken,subjectId:rootId})).statusCode,400);
  assert.equal((await publicRecovery('/accept',{intentId:browserIntent.intentId,token:browserRecoveryToken},{...publicHeaders,origin:'https://other.invalid'})).statusCode,403);
  const recoveryContext=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
  try{
   const page=await recoveryContext.newPage(),virtual=await recoveryContext.newCDPSession(page);
   await virtual.send('WebAuthn.enable');
   await virtual.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,
    hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
   await page.goto(origin+'/#recuperacion-personal?'+new URLSearchParams({intentId:browserIntent.intentId,token:browserRecoveryToken}));
   await page.getByRole('heading',{name:'Recuperar acceso a Sabora Gestión'}).waitFor();
   assert.equal(new URL(page.url()).hash,'#recuperacion-personal');
   const acceptance=page.waitForResponse(r=>r.url().endsWith(STAFF_RECOVERY_PATH+'/accept')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Aceptar recuperación'}).click();
   const acceptedResponse=await acceptance;assert.equal(acceptedResponse.status(),200,await acceptedResponse.text());
   assert.deepEqual(await acceptedResponse.json(),{outcome:'ready'});
   const session=(await recoveryContext.cookies()).find(c=>c.name==='__Host-sabora-staff-recovery');
   assert.ok(session?.httpOnly&&session.secure&&session.sameSite==='Strict');
   assert.ok(!session.value.includes(accessToken));
   const recoveryCookie=session.name+'='+session.value;
   assert.equal((await app.inject({method:'GET',url:auth+'/session',headers:{...publicHeaders,cookie:recoveryCookie}})).statusCode,401);
   const changed=session.value[0]==='A'?'B':'A';
   assert.equal((await publicRecovery('/options',{}, {...publicHeaders,cookie:session.name+'='+changed+session.value.slice(1)})).statusCode,403);
   const registered=page.waitForResponse(r=>r.url().endsWith(STAFF_RECOVERY_PATH+'/register')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Registrar nueva passkey'}).click();
   const registeredResponse=await registered;assert.equal(registeredResponse.status(),200,await registeredResponse.text());
   assert.deepEqual(await registeredResponse.json(),{outcome:'completed'});
   await page.getByText('Recuperación completada. Vuelve al acceso e identifícate con tu nueva passkey.',{exact:true}).waitFor();
   assert.equal((await recoveryContext.cookies()).some(c=>c.name===session.name),false);
   assert.deepEqual([kitchenRegistrations,kitchenRevocations,kitchenLogouts],[1,1,1]);
   assert.equal(await rootKernel.allowsAccess(consumedTarget.subjectId,hashRootCredentialId(kitchenCredential)),true);
   assert.equal(await rootKernel.allowsAccess(consumedTarget.subjectId,hashRootCredentialId(genesisCredential)),false);
   assert.equal((await publicRecovery('/options',{}, {...publicHeaders,cookie:recoveryCookie})).statusCode,403);
   assert.equal((await publicRecovery('/accept',{intentId:browserIntent.intentId,token:browserRecoveryToken})).statusCode,403);
   assert.deepEqual((await admin.query('SELECT role,state FROM sabora.staff_members WHERE user_id=$1',[consumedTarget.subjectId])).rows,[{role:'kitchen',state:'active'}]);
  }finally{await recoveryContext.close();}
  recoveryProviderExtras={};
  ({enrollmentSession,enrollmentUserId,accessToken,confirmedEmail}=adminEnrollmentContext);
  assert.equal((await admin.query('SELECT authorizer_credential_hash FROM sabora.staff_recovery_intent_candidate WHERE request_id=$1',[freshIntent.intentId])).rows[0].authorizer_credential_hash,staffNewHash);
  assert.deepEqual((await admin.query('SELECT auth_user_id,state,employee_code FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0],existing);
  // Recovery kernel uses the same disposable genesis ROOT after the full
  // browser path. No new staff identity or hosted provider is created.
  try{
   const config=recoveryConfig;
   let kernel=createRootRecoveryKernelCandidate(config);
   const run=(action,fields={})=>kernel.command(action,rootId,fields);
   const hash=(kind,value)=>kernel.hash(kind,value);
   let recoveryCode=generateRootRecoveryCode();
   assert.match(recoveryCode,/^[A-Z2-7]{25}[AEIMQUY4]$/);
   assert.notEqual(recoveryCode,generateRootRecoveryCode());
   const configFields={a:hash('email','security@demo.invalid'),b:hash('code',recoveryCode),days:28};
   await assert.rejects(kernel.command('configure',otherId,configFields),e=>e.code==='42501');
   await assert.rejects(recoveryPool.query('SELECT * FROM sabora.root_recovery_state_candidate'),e=>e.code==='42501');
   await assert.rejects(recoveryPool.query(ROOT_RECOVERY_SQL,[recoveryKey,'reset',rootId,randomUUID(),null,null,null,null,Date.now(),Date.now()+10000,'0'.repeat(64)]),e=>e.code==='42501');
   const mail=createRootRecoveryMailCandidate({pool:mailPool,keyId:mailKey,signingSecret:mailSigning,hash,keyring,mode:'worker'});
   const securityContext=()=>({identity:{userId:rootId},credentialHash:hashRootCredentialId(genesisCredential),
    deadlineMs:Date.now()+30000,requestId:randomUUID()});
   const inbox=[],providerReceipts=new Set();
   let sendMode='accepted';
   const resend={managementOrigin:origin,from:'sab@example.test',apiKey:'re_root_mail_fixture',
    fetchImpl:async(url,options)=>{
     assert.equal(url,'https://api.resend.com/emails');
     assert.match(options.headers['Idempotency-Key'],/^sabora-staff-root-recovery\//);
     assert.ok(!providerReceipts.has(options.headers['Idempotency-Key']));
     providerReceipts.add(options.headers['Idempotency-Key']);
     const body=JSON.parse(options.body);
     assert.ok(!body.text.includes(recoveryCode));
     if(sendMode==='rejected')return new Response('',{status:422});
     if(sendMode==='unknown')throw Error('fixture_lost_response');
     const fields=body.text.includes('\n\n')?new URLSearchParams(new URL(body.text.split('\n\n').at(-1)).hash.split('?')[1]):null;
     inbox.push({email:body.to[0],purpose:fields?.get('purpose')??(body.subject==='Recuperación ROOT completada en Sabora'?'recovered':'notice'),token:fields?.get('token')??null});
     return Response.json({id:randomUUID()});
    }};
   const mailSender=createRootRecoveryResendSender(resend);
   const workerConfig={
    control:{pool:recoveryPool,expectedLogin:ROOT_RECOVERY_LOGIN,keyId:recoveryKey,signingSecret:recoverySigning},
    worker:{pool:mailPool,expectedLogin:ROOT_MAIL_LOGIN,keyId:mailKey,signingSecret:mailSigning},
    getRootUserId:async()=>rootId,factorSecret:recoveryFactors,keyring,resend,hashInviteeEmail:hashEmail,
   };
   recoveryWorker=await createVerifiedRootRecoveryCandidate(workerConfig);
   await admin.query(`GRANT TRIGGER ON sabora.root_recovery_mail_contact_candidate TO ${ROOT_MAIL_LOGIN}`);
   await assert.rejects(recoveryWorker.readiness(),/staff_durable_admin_sql_identity_rejected/);
   await admin.query(`REVOKE TRIGGER ON sabora.root_recovery_mail_contact_candidate FROM ${ROOT_MAIL_LOGIN}`);
   await recoveryWorker.readiness();
   await assert.rejects(rootMail.stage({...securityContext(),identity:{userId:otherId},email:'security@demo.invalid'}),e=>e.code==='42501');
   await assert.rejects(rootMail.stage({...securityContext(),credentialHash:'0'.repeat(64),email:'security@demo.invalid'}),e=>e.code==='42501');
   await assert.rejects(recoveryPool.query('SELECT * FROM sabora.root_recovery_mail_contact_candidate'),e=>e.code==='42501');
   const forgedWorker=createRootRecoveryMailCandidate({pool:recoveryPool,keyId:mailKey,signingSecret:mailSigning,hash,keyring,mode:'worker'});
   const forgedControl=createRootRecoveryMailCandidate({pool:mailPool,keyId:recoveryKey,signingSecret:recoverySigning,hash,keyring});
   await assert.rejects(forgedWorker.list(rootId),e=>e.code==='42501');
   await assert.rejects(forgedControl.stage({...securityContext(),email:'security@demo.invalid'}),e=>e.code==='42501');
   await assert.rejects(mailPool.query(ROOT_RECOVERY_SQL,[mailKey,'reset',rootId,randomUUID(),null,null,null,null,Date.now(),Date.now()+10000,'0'.repeat(64)]),e=>e.code==='42501');
   await rootPage.goto(origin+'/#configuracion');
   const securityPanel=rootPage.getByRole('region',{name:'Recuperación de ROOT'});
   const ceremony=()=>rootPage.waitForResponse(r=>r.url().endsWith(securityPath+'/verify')&&r.request().method()==='POST');
   await securityPanel.getByLabel('Correo de seguridad',{exact:true}).fill('security@demo.invalid');
   const stageResponse=ceremony();
   await securityPanel.getByRole('button',{name:'Solicitar verificación con passkey'}).click();
   assert.deepEqual(await (await stageResponse).json(),{outcome:'verification_queued'});
   await assert.rejects(rootMail.confirm({...securityContext(),proof:generateRootRecoveryToken(),initial:true}),e=>e.code==='42501');
   assert.equal((await security()).json().configured,false);
   const [verifyJob]=await mail.list(rootId);
   assert.ok(verifyJob);
   await Promise.all([recoveryWorker.start(),mail.dispatch(rootId,verifyJob,mailSender)]);
   await recoveryWorker.close();
   assert.equal(inbox.length,1);assert.equal(inbox[0].purpose,'verify');
   const material=(await admin.query('SELECT recipient_envelope,token_envelope,state FROM sabora.root_recovery_mail_job_candidate WHERE id=$1',[verifyJob])).rows[0];
   assert.deepEqual(material,{recipient_envelope:null,token_envelope:null,state:'accepted'});
   await rootPage.goto('about:blank');
   await rootPage.goto(origin+'/#recuperacion-root?purpose=verify&token='+inbox[0].token);
   assert.equal((await security()).json().configured,false);
   const confirmationResponse=ceremony();
   await securityPanel.getByRole('button',{name:'Verificar correo con passkey'}).click();
   const confirmed=await (await confirmationResponse).json();
   assert.equal(confirmed.outcome,'configured');recoveryCode=confirmed.code;assert.match(recoveryCode,/^[A-Z2-7]{25}[AEIMQUY4]$/);
   await securityPanel.getByText(recoveryCode,{exact:true}).waitFor();
   await securityPanel.getByRole('button',{name:'He guardado el código'}).click();
   await assert.rejects(rootMail.confirm({...securityContext(),proof:inbox[0].token,initial:true}),e=>e.code==='42501');
   assert.equal((await run('configure',configFields)).outcome,'denied');
   const [dayZeroJob]=await mail.list(rootId);
   assert.deepEqual(await mail.dispatch(rootId,dayZeroJob,mailSender),{outcome:'accepted',promotion:'link_confirmed'});
   assert.equal(inbox[1].purpose,'link');
   assert.equal((await admin.query('SELECT email_hash FROM sabora.root_recovery_mail_contact_candidate')).rows[0].email_hash,hash('email','security@demo.invalid'));
   assert.ok(!(await admin.query('SELECT recipient_envelope FROM sabora.root_recovery_mail_contact_candidate')).rows[0].recipient_envelope.includes('security@demo.invalid'));
   assert.equal((await mail.queueLink(rootId)).outcome,'denied');
   // A sensitive capability must never outlive its authenticated ceremony.
   await assert.rejects(run('security_reset',{a:hashRootCredentialId(genesisCredential),deadlineMs:Date.now()-1}),e=>e.code==='42501');
   assert.equal((await security()).json().failures,'0');
   const backupId=Buffer.from('fixture-root-backup').toString('base64url');
   const backupHash=hashRootCredentialId(backupId),primaryHash=hashRootCredentialId(genesisCredential);
   const evidenceHash=createHash('sha256').update('fixture-negative').digest('hex');
   await assert.rejects(run('add_backup',{a:backupHash}),e=>e.code==='42501');
   assert.equal((await run('add_backup',{a:'0'.repeat(64),b:backupHash,c:evidenceHash})).outcome,'denied');
   async function backupCeremony(){
    const options=await security('/options',rootHeaders,{action:'add_backup'});
    assert.equal(options.statusCode,200,options.body);
    const challengeCookie=options.headers['set-cookie'].split(';')[0];
    const data=Buffer.alloc(37);data[32]=5;
    const credential={type:'public-key',id:genesisCredential,rawId:genesisCredential,response:{
     clientDataJSON:enc({type:'webauthn.get',origin,challenge:options.json().options.challenge}),
     authenticatorData:data.toString('base64url'),signature:'fixture',userHandle:Buffer.from(rootId).toString('base64url')}};
    const start=await security('/verify',{...rootHeaders,cookie:rootHeaders.cookie+'; '+challengeCookie},{action:'add_backup',credential});
    assert.equal(start.statusCode,200,start.body);
    const cookies=[start.headers['set-cookie']].flat();
    const backupCookie=cookies.find(v=>v.startsWith('__Host-sabora-root-backup-challenge=')).split(';')[0];
    const creation={type:'public-key',id:backupId,rawId:backupId,response:{
     clientDataJSON:enc({type:'webauthn.create',origin,challenge:start.json().options.challenge}),
     attestationObject:Buffer.from('fixture').toString('base64url')}};
    return {headers:{...rootHeaders,cookie:rootHeaders.cookie+'; '+backupCookie},creation};
   }
   const lost=await backupCeremony();loseRegistrationResponse=true;
   assert.equal((await security('/backup/verify',lost.headers,{credential:lost.creation})).statusCode,503);
   loseRegistrationResponse=false;
   assert.equal((await attempt(rootId,grantId,code,'/verify',backupId)).statusCode,401);
   assert.equal((await security()).json().backupConfigured,false);
   const registration=await backupCeremony();
   assert.equal((await security('/backup/verify',adminHeaders,{credential:registration.creation})).statusCode,401);
   const malformed={...registration.creation,response:{...registration.creation.response,
    clientDataJSON:enc({type:'webauthn.create',origin,challenge:'wrong'})}};
   assert.equal((await security('/backup/verify',registration.headers,{credential:malformed})).statusCode,401);
   assert.equal((await security('/backup/verify',registration.headers,{credential:registration.creation})).statusCode,200);
   assert.equal((await security()).json().backupConfigured,true);
   assert.equal((await security('/backup/verify',registration.headers,{credential:registration.creation})).statusCode,409);
   assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.root_recovery_audit_candidate WHERE action='add_backup' AND outcome='backup_added' AND credential_evidence_hash IS NOT NULL")).rows[0].n,1);
   assert.equal((await run('add_backup',{a:primaryHash,b:backupHash,c:evidenceHash})).outcome,'denied');
   assert.equal((await attempt(rootId,grantId,code,'/verify',backupId)).statusCode,200);
   const linkToken=inbox[1].token,link=hash('link',linkToken);
   let nextLink;
   const publicRecovery=(suffix,body,headers={host:new URL(origin).host,origin})=>app.inject({
    method:body===undefined?'GET':'POST',url:ROOT_RECOVERY_PATH+suffix,headers,...(body===undefined?{}:{payload:body})});
   assert.equal((await publicRecovery('/begin')).statusCode,404);
   assert.equal((await publicRecovery('/begin',{link:linkToken},{host:new URL(origin).host,origin:'https://other.invalid'})).statusCode,403);
   assert.equal((await publicRecovery('/begin',{link:linkToken,actor:otherId})).statusCode,400);
   const invalidLink=await publicRecovery('/begin',{link:generateRootRecoveryToken()});
   assert.equal(invalidLink.statusCode,202);
   assert.equal((await mail.list(rootId)).length,0);
   const started=await publicRecovery('/begin',{link:linkToken});
   assert.equal(started.statusCode,202);assert.deepEqual(started.json(),invalidLink.json());
   assert.deepEqual((await publicRecovery('/begin',{link:linkToken})).json(),started.json());
   assert.equal((await mail.list(rootId)).length,1);
   const [challengeJob]=await mail.list(rootId);
   assert.deepEqual(await mail.dispatch(rootId,challengeJob,mailSender),{outcome:'accepted'});
   assert.equal(inbox[2].purpose,'challenge');
   let challenge=hash('challenge',inbox[2].token);
   const wrong=hash('code','000000');let grant=hash('grant',generateRootRecoveryToken());
   const recoveryAttempt=(b=wrong,a=challenge)=>run('attempt',{a,b,c:grant});
   assert.equal((await recoveryAttempt(wrong,hash('challenge',generateRootRecoveryToken()))).failures,'0');
   const concurrent=await Promise.all(Array.from({length:12},()=>recoveryAttempt()));
   assert.equal(concurrent.filter(r=>r.outcome==='denied').length,3);
   assert.equal(concurrent.filter(r=>r.outcome==='blocked').length,9);
   const third=concurrent.find(r=>r.failures==='3'&&r.outcome==='denied');
   assert.ok(Math.abs(Date.parse(third.blockedUntil)-Date.now()-900000)<10000);
   kernel=createRootRecoveryKernelCandidate(config); // restart does not reset
   const blocked=await recoveryAttempt();assert.deepEqual(blocked,{...third,outcome:'blocked'});
   assert.equal((await state()).statusCode,200); // existing ROOT session unaffected
   await rootPage.goto(origin+'/#configuracion');
   await securityPanel.getByText('Fallos acumulados').waitFor();
   await securityPanel.getByRole('checkbox').check();
   const replacementResponse=rootPage.waitForResponse(r=>r.url().endsWith(securityPath+'/verify')&&r.request().method()==='POST');
   await securityPanel.getByRole('button',{name:'Sustituir código con passkey'}).click();
   const replacement=await replacementResponse;assert.equal(replacement.status(),200,await replacement.text());
   assert.equal(replacement.headers()['cache-control'],'no-store');
   assert.equal((await security('/verify',rootHeaders,replacement.request().postDataJSON())).statusCode,401);
   const newCode=(await replacement.json()).code;
   assert.match(newCode,/^[A-Z2-7]{25}[AEIMQUY4]$/);assert.notEqual(newCode,recoveryCode);
   await securityPanel.getByText(newCode,{exact:true}).waitFor();
   assert.equal((await security()).json().failures,'3');
   assert.equal((await security()).json().blockedUntil,third.blockedUntil);
   assert.ok(!(await security()).body.includes(newCode));
   await securityPanel.getByRole('button',{name:'He guardado el código'}).click();
   assert.equal(await securityPanel.getByText(newCode,{exact:true}).count(),0);
   recoveryCode=newCode;
   // A rotated code invalidates the previous challenge. No recovery
   // factor is injected by the DBA; after the block a fresh challenge is issued.
   assert.deepEqual((await admin.query('SELECT challenge_hash,grant_hash FROM sabora.root_recovery_state_candidate')).rows[0],{challenge_hash:null,grant_hash:null});
   // Only the disposable DBA advances timestamps, never the restricted login.
   const expireBlock=()=>admin.query("UPDATE sabora.root_recovery_state_candidate SET blocked_until=clock_timestamp()-interval '1 second' WHERE singleton");
   await expireBlock();
   assert.equal((await recoveryAttempt()).failures,'3');
   challenge=hash('challenge',generateRootRecoveryToken());
   assert.equal((await run('challenge',{a:link,b:challenge})).outcome,'challenge_created');
   assert.equal((await recoveryAttempt()).failures,'4');
   const fifth=await recoveryAttempt();assert.equal(fifth.failures,'5');
   assert.ok(Math.abs(Date.parse(fifth.blockedUntil)-Date.now()-3600000)<10000);
   await expireBlock();
   for(let n=6;n<=10;n++)assert.equal((await recoveryAttempt()).failures,String(n));
   const tenth=await recoveryAttempt();assert.equal(tenth.outcome,'blocked');
   assert.ok(Math.abs(Date.parse(tenth.blockedUntil)-Date.now()-86400000)<10000);
   await expireBlock();
   const eleventh=await recoveryAttempt();assert.equal(eleventh.failures,'11');
   assert.ok(Math.abs(Date.parse(eleventh.blockedUntil)-Date.now()-86400000)<10000);
   await admin.query("UPDATE sabora.root_recovery_state_candidate SET link_expires_at=clock_timestamp()+interval '1 hour' WHERE singleton");
   assert.equal((await mail.queueLink(rootId)).outcome,'link_queued');
   const [failedJob]=await mail.list(rootId);sendMode='rejected';
   assert.deepEqual(await mail.dispatch(rootId,failedJob,mailSender),{outcome:'rejected'});
   const preserved=(await admin.query('SELECT link_hash,pending_link_hash,failures FROM sabora.root_recovery_state_candidate')).rows[0];
   assert.deepEqual(preserved,{link_hash:link,pending_link_hash:null,failures:'11'});
   assert.equal((await mail.queueLink(rootId)).outcome,'denied');
   await admin.query("UPDATE sabora.root_recovery_mail_job_candidate SET finished_at=clock_timestamp()-interval '16 minutes' WHERE id=$1",[failedJob]);
   assert.equal((await mail.queueLink(rootId)).outcome,'link_queued');
   const [uncertainJob]=await mail.list(rootId);sendMode='unknown';
   assert.deepEqual(await mail.dispatch(rootId,uncertainJob,mailSender),{outcome:'unknown'});
   assert.equal((await mail.dispatch(rootId,uncertainJob,mailSender)).outcome,'denied');
   assert.equal((await mail.queueLink(rootId)).outcome,'denied');
   assert.equal((await mail.promote(rootId,uncertainJob)).outcome,'denied');
   assert.equal((await admin.query('SELECT link_hash FROM sabora.root_recovery_state_candidate')).rows[0].link_hash,link);
   // The original link is still live. Only the abandoned job's cooldown moves.
   await admin.query("UPDATE sabora.root_recovery_mail_job_candidate SET finished_at=clock_timestamp()-interval '16 minutes' WHERE id=$1",[uncertainJob]);
   assert.equal((await mail.queueLink(rootId)).outcome,'link_queued');
   const [nextJob]=await mail.list(rootId);sendMode='accepted';
   assert.deepEqual(await mail.dispatch(rootId,nextJob,mailSender),{outcome:'accepted',promotion:'link_confirmed'});
   nextLink=hash('link',inbox.at(-1).token);
   assert.equal((await admin.query('SELECT failures FROM sabora.root_recovery_state_candidate')).rows[0].failures,'11');
   assert.equal((await recoveryAttempt()).outcome,'blocked');
   const resetResponse=rootPage.waitForResponse(r=>r.url().endsWith(securityPath+'/verify')&&r.request().method()==='POST');
   await securityPanel.getByRole('button',{name:'Restablecer contador con passkey'}).click();
   const reset=await resetResponse;assert.equal(reset.status(),200,await reset.text());assert.deepEqual(await reset.json(),{configured:true,failures:'0',blockedUntil:null});
   assert.equal((await security()).json().failures,'0');
   await securityPanel.getByText('Contador restablecido.',{exact:true}).waitFor();
   assert.equal((await run('challenge',{a:link,b:challenge})).outcome,'denied');
   const renewed=hash('challenge',generateRootRecoveryToken());
   assert.equal((await run('challenge',{a:nextLink,b:renewed})).outcome,'challenge_created');
   await admin.query("UPDATE sabora.root_recovery_state_candidate SET challenge_expires_at=clock_timestamp()-interval '1 second' WHERE singleton");
   assert.equal((await recoveryAttempt(hash('code',recoveryCode),renewed)).outcome,'denied');
   // Expiry of an unprepared claim must not destroy the original code or
   // reopen an external effect. Only the disposable DBA advances the clock.
   const expiredToken=generateRootRecoveryToken(),expiredChallenge=hash('challenge',expiredToken);
   const expiredGrant=hash('grant',generateRootRecoveryToken());
   assert.equal((await run('challenge',{a:nextLink,b:expiredChallenge})).outcome,'challenge_created');
   assert.equal((await run('attempt',{a:expiredChallenge,b:hash('code',recoveryCode),c:expiredGrant})).outcome,'authorized');
   assert.equal((await run('claim',{a:expiredGrant})).outcome,'claimed');
   assert.equal((await state()).statusCode,401);
   assert.equal((await run('expire_unprepared')).outcome,'registration_pending');
   await admin.query("UPDATE sabora.root_recovery_state_candidate SET pending_registration_deadline=clock_timestamp()-interval '1 second' WHERE singleton");
   const neverPrepared=hashRootCredentialId(Buffer.from('expired-registration').toString('base64url'));
   assert.equal((await run('prepare_registration',{a:expiredGrant,b:neverPrepared,c:createHash('sha256').update('expired').digest('hex')})).outcome,'registration_pending');
   assert.equal((await run('expire_unprepared')).outcome,'registration_expired');
   assert.equal((await state()).statusCode,200);
   assert.equal((await run('claim',{a:expiredGrant})).outcome,'denied');
   assert.equal((await admin.query('SELECT code_hash,failures FROM sabora.root_recovery_state_candidate')).rows[0].code_hash,hash('code',recoveryCode));
   const finalToken=generateRootRecoveryToken(),finalChallenge=hash('challenge',finalToken);
   assert.equal((await run('challenge',{a:nextLink,b:finalChallenge})).outcome,'challenge_created');
   assert.equal((await publicRecovery('/authorize',{challenge:finalToken,code:recoveryCode},{host:new URL(origin).host,origin:'https://other.invalid'})).statusCode,403);
   assert.equal((await publicRecovery('/authorize',{challenge:generateRootRecoveryToken(),code:recoveryCode})).statusCode,403);
   const successful=await publicRecovery('/authorize',{challenge:finalToken,code:recoveryCode});
   assert.equal(successful.statusCode,200,successful.body);
   assert.deepEqual(successful.json(),{outcome:'registration_authorized'});
   assert.equal(successful.headers['cache-control'],'no-store');
   const grantCookie=successful.headers['set-cookie'];
   assert.match(grantCookie,/^__Host-sabora-root-recovery-grant=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=300; Secure; HttpOnly; SameSite=Strict$/);
   const rawGrant=grantCookie.split(';')[0].split('=')[1];grant=hash('grant',rawGrant);
   assert.equal((await publicRecovery('/authorize',{challenge:finalToken,code:recoveryCode})).statusCode,403);
   assert.equal((await app.inject({method:'GET',url:auth+'/session',headers:{host:new URL(origin).host,cookie:grantCookie.split(';')[0]}})).statusCode,401);
   assert.equal((await publicRecovery('/claim',{})).statusCode,404);
   const granted=(await admin.query('SELECT grant_expires_at FROM sabora.root_recovery_state_candidate')).rows[0];
   assert.ok(Math.abs(granted.grant_expires_at.getTime()-Date.now()-300000)<10000);
   // The verified ROOT request reaches the ownership SQL before the claim,
   // waits on ownership, then encounters the new recovery state at the audit.
   const secondAdmin=randomUUID(),requestId=randomUUID();
   await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active')",[secondAdmin]);
   const blocker=await admin.connect();
   let contenders,transition;
   try{
    await blocker.query('BEGIN');
    await blocker.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton FOR UPDATE');
    transition=ownership.transition({
     verifiedIdentity:{userId:rootId,expiresAt:Math.floor(Date.now()/1000)+60},
     verifiedStaff:{userId:rootId,role:'root'},
     verifiedRootCredential:hashRootCredentialId(genesisCredential),
    },{requestId,action:'force',proposalId:null,targetUserId:secondAdmin,reason:'Carrera de recuperación aislada'})
     .then(result=>({result}),error=>({error}));
    let waiting=false;
    for(let attempt=0;attempt<50&&!waiting;attempt++){
     const probe=await admin.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
      WHERE usename=$1 AND wait_event_type='Lock' AND query LIKE '%admin_ownership_action_candidate%') AS waiting`,[ownershipLogin]);
     waiting=probe.rows[0].waiting;
     if(!waiting)await delay(20);
    }
    assert.equal(waiting,true);
    contenders=await Promise.all(Array.from({length:8},()=>run('claim',{a:grant})));
   }finally{
    await blocker.query('ROLLBACK');
    blocker.release();
   }
   assert.equal((await transition).error?.code,'42501');
   assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,otherId);
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.admin_ownership_audit WHERE correlation_id=$1',[requestId])).rows[0].n,0);
   assert.equal(contenders.filter(r=>r.outcome==='claimed').length,1);
   await assert.rejects(classify(rootAuthority,{enrollmentId:id}),e=>e.code==='42501');
   await assert.rejects(authorizeRecovery(rootAuthority,{enrollmentId:id,requestId:randomUUID()}),e=>e.code==='42501');
   assert.equal(contenders.filter(r=>r.outcome==='registration_pending').length,7);
   assert.equal((await run('reset')).outcome,'registration_pending');
   assert.equal((await state()).statusCode,401);
   assert.equal((await attempt(rootId,grantId,code,'/verify',backupId)).statusCode,401);
   assert.equal((await attempt(otherId,grantId,code,'/verify',staffNewCredential)).statusCode,200);
   const durable=(await admin.query('SELECT failures,registration_pending,grant_hash FROM sabora.root_recovery_state_candidate')).rows[0];
   assert.deepEqual(durable,{failures:'0',registration_pending:true,grant_hash:null});
   assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.root_recovery_audit_candidate WHERE action='attempt' AND outcome='code_mismatch'")).rows[0].n,11);
   await assert.rejects(recoveryPool.query('DELETE FROM sabora.root_recovery_audit_candidate'),e=>e.code==='42501');
   const replacementId=Buffer.from('fixture-root-replacement').toString('base64url');
   const replacementCode=generateRootRecoveryCode(),completion={a:grant,b:hashRootCredentialId(replacementId),c:hash('code',replacementCode)};
   assert.equal((await run('complete',{...completion,a:hash('grant',generateRootRecoveryToken())})).outcome,'registration_pending');
   assert.equal((await run('complete',{...completion,b:hashRootCredentialId(genesisCredential)})).outcome,'registration_pending');
   // No finalization on an arbitrary credential, even from an internal
   // signed command. Persist the expected binding before the remote step.
   const fixtureEvidence=label=>createHash('sha256').update(label).digest('hex');
   assert.equal((await run('complete',completion)).outcome,'registration_pending');
   assert.equal((await run('record_registration',{a:grant,b:completion.b,c:fixtureEvidence('early')})).outcome,'registration_pending');
   assert.equal((await run('prepare_registration',{a:grant,b:hashRootCredentialId(genesisCredential),c:fixtureEvidence('ceremony')})).outcome,'registration_pending');
   assert.equal((await run('prepare_registration',{a:grant,b:completion.b,c:fixtureEvidence('ceremony')})).outcome,'registration_prepared');
   await admin.query("UPDATE sabora.root_recovery_state_candidate SET pending_registration_deadline=clock_timestamp()-interval '1 second' WHERE singleton");
   assert.equal((await run('expire_unprepared')).outcome,'registration_pending');
   assert.equal((await state()).statusCode,401);
   const restartedMail=()=>createRootRecoveryMailCandidate({pool:mailPool,keyId:mailKey,signingSecret:mailSigning,hash,keyring,mode:'worker'});
   const checks=await Promise.all([mail.queueAttention(rootId),restartedMail().queueAttention(rootId)]);
   assert.equal(checks[0]+checks[1],1);
   const warning=(await admin.query(`SELECT j.id,j.purpose,j.state,j.token_hash,j.token_envelope
    FROM sabora.root_recovery_state_candidate s JOIN sabora.root_recovery_mail_job_candidate j ON j.id=s.attention_mail_id
    WHERE s.singleton`)).rows;
   assert.equal(warning.length,1);
   assert.deepEqual({...warning[0],id:null},{id:null,purpose:'recovery_attention',state:'queued',token_hash:null,token_envelope:null});
   assert.equal((await restartedMail().dispatch(rootId,warning[0].id,mailSender)).outcome,'accepted');
   assert.equal(await mail.queueAttention(rootId),0);
   assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.root_recovery_audit_candidate WHERE mail_job_id=$1 AND action='mail_queue_attention'",[warning[0].id])).rows[0].n,1);
   assert.equal((await state()).statusCode,401);
   assert.equal((await run('prepare_registration',{a:grant,b:hashRootCredentialId(Buffer.from('unbound').toString('base64url')),c:fixtureEvidence('other')})).outcome,'registration_pending');
   assert.equal((await run('record_revocation',{a:grant,b:completion.b,c:fixtureEvidence('early')})).outcome,'registration_pending');
   assert.equal((await run('record_registration',{a:grant,b:hashRootCredentialId(backupId),c:fixtureEvidence('wrong')})).outcome,'registration_pending');
   // Restart preserves the pending operation and its exact binding.
   kernel=createRootRecoveryKernelCandidate(config);
   assert.equal((await run('record_registration',{a:grant,b:completion.b,c:fixtureEvidence('provider-registration-fixture')})).outcome,'registration_recorded');
   assert.equal((await run('complete',completion)).outcome,'registration_pending');
   assert.equal((await state()).statusCode,401);
   assert.equal((await run('record_revocation',{a:grant,b:completion.b,c:fixtureEvidence('provider-revocation-fixture')})).outcome,'revocation_recorded');
   // These receipts represent fixture evidence, not actual remote effects.
   assert.equal((await run('complete',completion)).outcome,'completed');
   const recoveryNotice=(await admin.query("SELECT id,purpose,token_hash,token_envelope FROM sabora.root_recovery_mail_job_candidate WHERE purpose='recovered'")).rows;
   assert.equal(recoveryNotice.length,1);
   assert.deepEqual({...recoveryNotice[0],id:null},{id:null,purpose:'recovered',token_hash:null,token_envelope:null});
   assert.equal((await admin.query("SELECT mail_job_id FROM sabora.root_recovery_audit_candidate WHERE action='complete' AND outcome='completed'")).rows[0].mail_job_id,recoveryNotice[0].id);
   assert.equal((await mail.dispatch(rootId,recoveryNotice[0].id,mailSender)).outcome,'accepted');
   assert.equal((await mail.dispatch(rootId,recoveryNotice[0].id,mailSender)).outcome,'denied');
   assert.deepEqual((await admin.query('SELECT recipient_envelope,token_envelope,state FROM sabora.root_recovery_mail_job_candidate WHERE id=$1',[recoveryNotice[0].id])).rows[0],{recipient_envelope:null,token_envelope:null,state:'accepted'});
   assert.deepEqual((await admin.query('SELECT pending_credential_hash,pending_ceremony_hash,pending_registration_receipt_hash,pending_revocation_receipt_hash FROM sabora.root_recovery_state_candidate')).rows[0],
    {pending_credential_hash:null,pending_ceremony_hash:null,pending_registration_receipt_hash:null,pending_revocation_receipt_hash:null});
   assert.equal((await run('complete',completion)).outcome,'denied');
   assert.equal((await run('add_backup',{a:hashRootCredentialId(replacementId),b:hashRootCredentialId(backupId),c:evidenceHash})).outcome,'denied');
   assert.equal((await state()).statusCode,401);
   assert.equal((await attempt(rootId,grantId,code,'/verify',backupId)).statusCode,401);
   assert.equal((await attempt(rootId,grantId,code,'/verify')).statusCode,401);
   const restored=await attempt(rootId,grantId,code,'/verify',replacementId);
   assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().role,'root');
   assert.equal((await run('challenge',{a:nextLink,b:finalChallenge})).outcome,'denied');
   // Changing the confirmed recipient requires the replacement credential,
   // leaves the replacement code intact and queues notice to the old address.
   const newContext=()=>({...securityContext(),credentialHash:hashRootCredentialId(replacementId)});
   await assert.rejects(rootMail.stage({...securityContext(),email:'new-security@demo.invalid'}),e=>e.code==='42501');
   assert.equal((await rootMail.stage({...newContext(),email:'new-security@demo.invalid',days:1})).outcome,'verification_queued');
   const [newVerify]=await mail.list(rootId);
   assert.deepEqual(await mail.dispatch(rootId,newVerify,mailSender),{outcome:'accepted'});
   const proof=inbox.at(-1).token;
   assert.deepEqual(await rootMail.confirm({...newContext(),proof,initial:false}),{outcome:'email_changed'});
   const afterChange=(await admin.query('SELECT code_hash,email_hash,failures FROM sabora.root_recovery_state_candidate')).rows[0];
   assert.deepEqual(afterChange,{code_hash:hash('code',replacementCode),email_hash:hash('email','new-security@demo.invalid'),failures:'0'});
   for(const job of await mail.list(rootId))assert.equal((await mail.dispatch(rootId,job,mailSender)).outcome,'accepted');
   assert.equal((await mail.queueLink(rootId)).outcome,'denied');
   assert.ok(inbox.some(m=>m.email==='security@demo.invalid'&&m.purpose==='recovered'&&m.token===null));
   assert.ok(inbox.some(m=>m.email==='security@demo.invalid'&&m.purpose==='notice'&&m.token===null));
   assert.ok(inbox.some(m=>m.email==='new-security@demo.invalid'&&m.purpose==='link'));
   // Full public ROOT path through the built PWA. Auth scopes are restricted
   // in the fixture exactly as the production provider adapter requires.
   const receivedLink=inbox.findLast(m=>m.email==='new-security@demo.invalid'&&m.purpose==='link').token;
   const formerProviderId=randomUUID(),newRootProviderId=randomUUID(),challengeId=randomUUID();
   const rootNonce=randomBytes(32).toString('base64url'),authProof=generateRootRecoveryToken();
   enrollmentUserId=rootId;enrollmentSession=randomUUID();
   const rootAuthToken=mintEnrollment(),authEmail='root-auth@demo.invalid';
   let providerIds=[formerProviderId],proofExchanges=0,registrations=0,revocations=0,logouts=0,newRootCredential;
   rootAuthProvider={
    generateRecoveryProof:async()=>({authProof}),
    exchangeRecoveryProof:async proof=>{
     assert.equal(proof,authProof);proofExchanges++;return {accessToken:rootAuthToken};
    },
    user:async token=>token===rootAuthToken?{id:rootId,email:authEmail,is_anonymous:false,
     email_confirmed_at:new Date(Date.now()-1000).toISOString()}:null,
    registrationOptions:async token=>{
     assert.equal(token,rootAuthToken);
     return {challenge_id:challengeId,expires_at:Math.floor(Date.now()/1000)+60,
      options:{rp:{id:new URL(origin).hostname,name:'Sabora'},challenge:rootNonce,
       user:{id:enc(rootId),name:authEmail,displayName:'ROOT'},pubKeyCredParams:[{type:'public-key',alg:-7}],
       authenticatorSelection:{residentKey:'required',userVerification:'required'},attestation:'none'}};
    },
    listPasskeys:async subject=>{assert.equal(subject,rootId);return [...providerIds];},
    verifyRegistration:async(token,challenge,credential)=>{
     assert.equal(token,rootAuthToken);assert.equal(challenge,challengeId);
     newRootCredential=credential.id;registrations++;
     assert.equal(await rootKernel.allowsAccess(rootId,hashRootCredentialId(newRootCredential)),false);
     providerIds.push(newRootProviderId);return {id:newRootProviderId};
    },
    revokePasskey:async(subject,previous)=>{
     assert.equal(subject,rootId);assert.equal(previous,formerProviderId);revocations++;
     providerIds=providerIds.filter(x=>x!==previous);return true;
    },
    logoutAll:async token=>{assert.equal(token,rootAuthToken);logouts++;return true;}
   };
   assert.equal((await publicRecovery('/accept',{})).statusCode,403);
   const publicContext=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
   try{
    const page=await publicContext.newPage(),virtual=await publicContext.newCDPSession(page);
    await virtual.send('WebAuthn.enable');
    await virtual.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',
     hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    await page.goto(origin+'/#recuperacion-root?'+new URLSearchParams({purpose:'link',token:receivedLink}));
    await page.getByRole('heading',{name:'Recuperar acceso ROOT'}).waitFor();
    assert.equal(new URL(page.url()).hash,'#recuperacion-root');
    assert.equal((await mail.list(rootId)).length,0,'opening the link must not queue anything');
    await page.getByRole('button',{name:'Solicitar comprobación'}).click();
    await page.getByText('Revisa el correo de seguridad y abre el enlace del nuevo desafío.').waitFor();
    const [publicChallengeJob]=await mail.list(rootId);
    assert.equal((await mail.dispatch(rootId,publicChallengeJob,mailSender)).outcome,'accepted');
    const publicChallenge=inbox.at(-1);
    assert.equal(publicChallenge.purpose,'challenge');
    await page.goto(origin+'/#recuperacion-root?'+new URLSearchParams({purpose:'challenge',token:publicChallenge.token}));
    await page.reload();
    await page.getByLabel('Código de recuperación').fill(replacementCode);
    await page.getByRole('button',{name:'Verificar código'}).click();
    await page.getByRole('button',{name:'Registrar nueva passkey'}).waitFor();
    const restricted=(await publicContext.cookies()).find(c=>c.name==='__Host-sabora-root-recovery-session');
    assert.ok(restricted?.httpOnly&&restricted.secure&&restricted.sameSite==='Strict');
    assert.ok(!restricted.value.includes(rootAuthToken));
    assert.equal((await state({host:new URL(origin).host,origin,cookie:restricted.name+'='+restricted.value})).statusCode,401);
    const registered=page.waitForResponse(r=>r.url().endsWith(ROOT_RECOVERY_PATH+'/register'));
    await page.getByRole('button',{name:'Registrar nueva passkey'}).click();
    const registrationResponse=await registered;
    assert.equal(registrationResponse.status(),200,await registrationResponse.text());
    const result=await registrationResponse.json();
    assert.deepEqual(Object.keys(result).sort(),['outcome','recoveryCode']);
    assert.equal(result.outcome,'completed');
    await page.getByText(result.recoveryCode,{exact:true}).waitFor();
    assert.ok(!(await publicContext.cookies()).some(c=>c.name===restricted.name));
    assert.equal((await publicRecovery('/options',{},
     {host:new URL(origin).host,origin,cookie:restricted.name+'='+restricted.value})).statusCode,403);
    assert.equal((await admin.query('SELECT code_hash FROM sabora.root_recovery_state_candidate WHERE singleton')).rows[0].code_hash,
     hash('code',result.recoveryCode));
    assert.deepEqual([proofExchanges,registrations,revocations,logouts],[1,1,1,1]);
    assert.deepEqual(providerIds,[newRootProviderId]);
    assert.equal((await attempt(rootId,grantId,code,'/verify',replacementId)).statusCode,401);
    assert.equal((await attempt(rootId,grantId,code,'/verify',newRootCredential)).statusCode,200);
   }finally{await publicContext.close();}
  }finally{/* pool owned by test.after */}
  const audit=(await admin.query(`SELECT action,actor_kind FROM sabora.staff_lifecycle_audit
    WHERE enrollment_id=$1 ORDER BY occurred_at`,[id])).rows;
  assert.deepEqual(audit,[{action:'invite',actor_kind:'root'},{action:'resend',actor_kind:'root'},
   {action:'accept',actor_kind:'invitee'},{action:'register',actor_kind:'invitee'},{action:'activate',actor_kind:'root'}]);
  assert.equal((await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id,otherId);
  assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.staff_members WHERE role='root'")).rows[0].n,1);
 }finally{await recoveryWorker?.close();await browser?.close();await preview?.close();await app.close();}
});
