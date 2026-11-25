import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffRootBootstrapCandidate,ROOT_BOOTSTRAP_SQL} from '../../apps/api/src/staff-root-bootstrap-candidate.mjs';
import {createStaffPasskeySession} from '../../apps/api/src/staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';

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
let pool,staffPool;
const connection=role=>{const u=new URL(url);u.username=role;u.password=password;return u.href;};

test.before(async()=>{
 assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members')).rows[0].n,0);
 await admin.query(await readFile(new URL('../../docs/security/sql-candidates/staff_root_bootstrap_pg17.sql',import.meta.url),'utf8'));
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
});
test.after(async()=>{await Promise.allSettled([pool?.end(),staffPool?.end()]);await admin.end();});

test('PG17 + Fastify: fresh passkey boundary, owner grant, concurrent ROOT bootstrap and durable denial',async()=>{
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
 }finally{await app.close();}
});
