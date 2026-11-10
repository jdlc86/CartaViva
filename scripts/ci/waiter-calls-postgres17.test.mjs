// CV-014: integrated disposable PG17, real cookie and JWT/HMAC Fastify,
// concurrency, append-only events and client/management Chromium PWA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createCustomerCookieAuth,readCustomerCookie} from '../../apps/api/src/customer-cookie-session-candidate.mjs';
import {hashCustomerSessionToken} from '../../apps/api/src/customer-session.mjs';
import {createCustomerSessionVerifier} from '../../apps/api/src/customer-session-verifier.mjs';
import {assertWaiterCallRuntimeIdentity,createWaiterCallStaffIssuer,
 createWaiterCallComposition,registerWaiterCallHttp,
 WAITER_CALL_CUSTOMER_ROLE,WAITER_CALL_STAFF_ROLE}
 from '../../apps/api/src/waiter-call-candidate.mjs';

const target=process.env.SABORA_CI_PG_URL,pg=process.env.SABORA_CI_PG_MODULE;
const playwright=process.env.SABORA_CI_PLAYWRIGHT_MODULE;
if(process.env.GITHUB_ACTIONS!=='true'||!target||!pg||!playwright||
 !isDisposablePgModulePath(pg))throw Error('disposable_waiter_call_harness_required');
const u=new URL(target);
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.username!=='postgres'||
 u.password!=='sabora_ci_ephemeral_only'||u.pathname!=='/postgres'||!u.port||u.search||u.hash)
 throw Error('unsafe_waiter_call_harness_target');
const {Pool}=createRequire(import.meta.url)(pg);
const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
const {chromium}=await import(pathToFileURL(playwright).href);
const dir=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const admin=new Pool({connectionString:target,max:3,connectionTimeoutMillis:3000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function vite(app,port,api){
 const proc=spawn('pnpm',['exec','vite','--mode','test','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:join(dir,'apps',app),
  env:{...process.env,SABORA_CI_COMMS_API:api,
   VITE_SABORA_ENABLE_WAITER_CALLS:app==='client'?'isolated_pg17':'disabled'},stdio:'pipe'});
 let logs='';proc.stdout.on('data',c=>{logs+=String(c);});
 proc.stderr.on('data',c=>{logs+=String(c);});
 return {proc,logs:()=>logs};
}
async function waitHttp(address){
 for(let n=0;n<120;n++){try{const r=await fetch(address);if(r.ok)return;}catch{}await sleep(200);}
 throw Error('waiter_call_vite_unavailable:'+address);
}
test('CV-014 PG17 + cookie + JWT/HMAC + Fastify + Chromium: one waiter call per table, concurrent attendance, durable events',
 {timeout:180_000},async()=>{
 const suffix=process.pid.toString(36),logins=['sabora_call_c_'+suffix,'sabora_call_s_'+suffix,'sabora_call_reader_'+suffix];
 const [loginC,loginS,loginR]=logins;
 const [customerId,otherId,waiterA,waiterB,kitchen]=Array.from({length:5},()=>randomUUID());
 const tableId=randomUUID(),visitKey='CV014'+randomBytes(12).toString('hex');
 const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXY';
 const publicCode=()=>'SB-'+Array.from(randomBytes(12),byte=>alphabet[byte%alphabet.length]).join('');
 const customerPublicId=publicCode(),otherCustomerPublicId=publicCode();
 if(otherCustomerPublicId===customerPublicId)throw Error('ci_public_id_collision');
 const cookieToken=randomBytes(32).toString('base64url');
 const otherToken=randomBytes(32).toString('base64url');
 const qrToken=randomBytes(32).toString('base64url');
 const keyId='sabora_call_key_'+suffix,secret=randomBytes(32);
 const origin='http://127.0.0.1:4178',password='ci_call_'+randomBytes(12).toString('hex');
 const pools=[],processes=[];let api,browser;
 try{
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'waiter','active'),($2,'waiter','active'),($3,'kitchen','active')",[waiterA,waiterB,kitchen]);
  await admin.query("INSERT INTO sabora.customer_profiles(id,public_id,alias) VALUES($1,$2,'Uno'),($3,$4,'Dos')",
   [customerId,customerPublicId,otherId,otherCustomerPublicId]);
  await admin.query("INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '2 hours'),($3,$4,clock_timestamp()+interval '2 hours')",
   [customerId,hashCustomerSessionToken(cookieToken),otherId,hashCustomerSessionToken(otherToken)]);
  await admin.query("INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,ordering_state,readiness_state) VALUES($1,9911,4,$2,'paused','LISTA')",
   [tableId,createHash('sha256').update(qrToken).digest()]);
  const sessionId=(await admin.query("SELECT session_id FROM sabora.dining_tables WHERE id=$1",[tableId])).rows[0].session_id;
  await admin.query("INSERT INTO sabora.customer_table_visits(table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,granted_at,expires_at) VALUES($1,$2,$3,$4,$5,1,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour'),($1,$2,$6,$7,$8,1,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')",
   [tableId,sessionId,customerId,visitKey,customerId,otherId,visitKey+'B',otherId]);
  await admin.query("INSERT INTO sabora.order_operation_signing_keys(key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')",
   [keyId,secret]);
  for(const login of logins)await admin.query('CREATE ROLE '+login+" LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
  await admin.query('GRANT '+WAITER_CALL_CUSTOMER_ROLE+' TO '+loginC+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT '+WAITER_CALL_STAFF_ROLE+' TO '+loginS+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT USAGE ON SCHEMA sabora TO '+loginR);
  await admin.query('GRANT SELECT(user_id,role,state) ON sabora.staff_members TO '+loginR);
  await admin.query('CREATE POLICY ci_call_reader_'+suffix+' ON sabora.staff_members FOR SELECT TO '+loginR+' USING(true)');
  for(const login of logins){
   const x=new URL(target);x.username=login;x.password=password;
   pools.push(new Pool({connectionString:x.toString(),max:4,connectionTimeoutMillis:3000,
    options:'-c statement_timeout=12000'}));
  }
  assert((await assertWaiterCallRuntimeIdentity({pool:pools[0],expectedLogin:loginC,kind:'customer'})).validated);
  assert((await assertWaiterCallRuntimeIdentity({pool:pools[1],expectedLogin:loginS,kind:'staff'})).validated);
  await assert.rejects(pools[0].query('SELECT * FROM sabora.waiter_calls'),/permission denied/);
  await assert.rejects(pools[1].query('SELECT * FROM sabora.waiter_call_events'),/permission denied/);
  const repository=createWaiterCallComposition({customerPool:pools[0],staffPool:pools[1],
   issueStaffCapability:createWaiterCallStaffIssuer({keyId,secret,databaseRole:loginS})});
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const issuer='https://sabora-cv014-ci.test/auth/v1';
  const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',kid:'call-ci-'+suffix,use:'sig'};
  const jwt=id=>{
   const now=Math.floor(Date.now()/1000);
   const a=Buffer.from(JSON.stringify({typ:'JWT',alg:'RS256',kid:jwk.kid})).toString('base64url');
   const b=Buffer.from(JSON.stringify({iss:issuer,aud:'authenticated',sub:id,role:'authenticated',
    iat:now,exp:now+3600})).toString('base64url');
   return a+'.'+b+'.'+sign('RSA-SHA256',Buffer.from(a+'.'+b),privateKey).toString('base64url');
  };
  const guardHooks=createStaffProtectedHooksFromPool({pool:pools[2],issuer,getTrustedKeys:async()=>[jwk]});
  const forRoles=roles=>async(req,reply)=>{
   for(const hook of guardHooks(roles)){await hook(req,reply);if(reply.sent)return;}
  };
  const verify=createCustomerSessionVerifier({query:(sql,params)=>admin.query(sql,params)});
  const cookieAuth=createCustomerCookieAuth({verifyCustomerSession:verify,
   revokeCustomerSession:async()=>false,allowedOrigin:origin});
  api=Fastify({logger:false,trustProxy:false});
  registerWaiterCallHttp(api,{cookieAuth,forRoles,repository});
  api.get('/api/v1/customer/session',{preHandler:cookieAuth.authenticate},
   async req=>({authenticated:true,publicId:req.customerIdentity.publicId,
    alias:req.customerIdentity.alias,company:req.customerIdentity.company}));
  // Only this QR-binding fixture is supplied by CI. The service call itself
  // is authorized against the real visit/session/occupancy and sealed RPC.
  api.post('/api/v1/customer/visits',{preHandler:cookieAuth.authenticate},
   async(req,reply)=>req.body?.tableId===tableId&&req.body?.qrToken===qrToken
    ?reply.code(201).send({tableId,visitId:visitKey,
     basketId:'CI_CALL_BASKET_1234567890',expiresAt:new Date(Date.now()+3600000).toISOString()})
    :reply.code(403).send({error:'customer_context_forbidden'}));
  await api.ready();
  const cookie=v=>'__Secure-sabora_customer='+v;
  const customerGet=(t=cookieToken)=>api.inject({method:'GET',
   url:'/api/v1/customer/waiter-calls?tableId='+tableId,headers:{cookie:cookie(t)}});
  const customerPost=(requestId,t=cookieToken)=>api.inject({method:'POST',
   url:'/api/v1/customer/waiter-calls',headers:{cookie:cookie(t),origin,
    'content-type':'application/json'},payload:{tableId,requestId}});
  const getStaff=id=>api.inject({method:'GET',url:'/api/v1/operations/waiter-calls',
   headers:{authorization:'Bearer '+jwt(id)}});
  const attend=(id,callId,requestId=randomUUID())=>api.inject({method:'POST',
   url:'/api/v1/operations/waiter-calls/'+callId+'/attend',
   headers:{authorization:'Bearer '+jwt(id),'content-type':'application/json'},
   payload:{requestId}});
  assert.equal((await customerGet()).json().state,'none');
  assert.equal((await api.inject({method:'GET',
   url:'/api/v1/customer/waiter-calls?tableId='+tableId})).statusCode,401);
  assert.equal((await getStaff(kitchen)).statusCode,403);
  const callId=randomUUID(),first=await customerPost(callId);
  assert.equal(first.statusCode,200,first.body);assert.equal(first.json().state,'pending');
  const others=await Promise.all([customerPost(callId),customerPost(randomUUID(),otherToken)]);
  assert(others.every(r=>r.statusCode===200&&r.json().id===callId&&r.json().repeated));
  assert.equal((await getStaff(waiterA)).json().items[0].tableNumber,9911);
  const decisions=await Promise.all([attend(waiterA,callId),attend(waiterB,callId)]);
  assert(decisions.every(x=>x.statusCode===200&&x.json().state==='attended'));
  assert.equal(decisions.filter(x=>x.json().repeated===false).length,1);
  assert.equal((await getStaff(waiterB)).json().items.length,0);
  assert.equal((await customerGet()).json().state,'none');
  const audit=(await admin.query('SELECT event,count(*)::integer AS n FROM sabora.waiter_call_events WHERE call_id=$1 GROUP BY event ORDER BY event',[callId])).rows;
  assert.deepEqual(audit,[{event:'attended',n:1},{event:'requested',n:1}]);
  const outbox=(await admin.query('SELECT event_type FROM sabora.event_outbox WHERE aggregate_id=$1 ORDER BY id',[callId])).rows;
  assert.deepEqual(outbox.map(v=>v.event_type),['sabora.waiter_call.requested','sabora.waiter_call.attended']);

  const apiUrl=await api.listen({host:'127.0.0.1',port:0});
  const cv=vite('client',4178,apiUrl),mv=vite('management',4179,apiUrl);
  processes.push(cv,mv);
  await Promise.all([waitHttp(origin+'/'),waitHttp('http://127.0.0.1:4179/')]);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.addCookies([{name:'__Secure-sabora_customer',value:cookieToken,
   domain:'127.0.0.1',path:'/api/v1/customer',secure:true,httpOnly:true,sameSite:'Strict'}]);
  const client=await context.newPage();
  await client.setViewportSize({width:390,height:844});
  await client.goto(origin+'/qr/v1/SABORA/'+tableId+'#'+qrToken);
  await client.getByRole('button',{name:'Llamar al camarero'}).waitFor({timeout:20000});
  await client.getByRole('button',{name:'Llamar al camarero'}).click();
  await client.getByText('Camarero solicitado.',{exact:false}).waitFor({timeout:12000});
  const call=(await getStaff(waiterB)).json().items[0];
  assert(call&&call.tableNumber===9911);
  const manager=await context.newPage();
  await manager.setViewportSize({width:1200,height:900});
  await manager.goto('http://127.0.0.1:4179/');
  await manager.evaluate(async auth=>{
   const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
   window.__ciCallDispose=mountAuthenticatedManagementApp({
    element:document.getElementById('root'),
    getAccessToken:async()=>auth,enableWaiterCalls:true});
  },jwt(waiterA));
  await manager.getByRole('link',{name:/Comandas/}).click();
  await manager.getByRole('button',{name:'Sala'}).click();
  await manager.getByRole('button',{name:'Marcar atendida'}).waitFor({timeout:15000});
  await manager.getByRole('button',{name:'Marcar atendida'}).click();
  await manager.getByText('No hay llamadas pendientes confirmadas.').waitFor({timeout:15000});
  assert.equal((await getStaff(waiterB)).json().items.length,0);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.waiter_call_events WHERE call_id=$1',[call.id])).rows[0].n,2);
  await client.getByRole('button',{name:'Consultar llamada'}).click();
  await client.getByText('Puedes avisar a sala',{exact:false}).waitFor({timeout:12000});
  await context.close();
 }finally{
  for(const p of processes)p.proc.kill('SIGTERM');
  await browser?.close().catch(()=>{});
  await api?.close().catch(()=>{});
  for(const p of pools)await p.end().catch(()=>{});
  for(const l of logins){
   await admin.query('DROP OWNED BY '+l).catch(()=>{});
   await admin.query('DROP ROLE IF EXISTS '+l).catch(()=>{});
  }
  // Immutable audit is not deleted: the entire PG17 container is ephemeral.
  await admin.end().catch(()=>{});
 }
});
