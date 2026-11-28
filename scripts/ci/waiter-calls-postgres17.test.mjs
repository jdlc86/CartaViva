// CV-014: integrated disposable PG17, real cookie and JWT/HMAC Fastify,
// concurrency, append-only events and client/management Chromium PWA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {startPublishedClientPwa,startPublishedManagementPwa} from './published-client-pwa-fixture.mjs';
import {createStaffPasskeyBrowserFixture} from './staff-passkey-browser-fixture.mjs';
import {createStaffPasskeySession} from '../../apps/api/src/staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createCustomerCookieAuth,readCustomerCookie} from '../../apps/api/src/customer-cookie-session-candidate.mjs';
import {hashCustomerSessionToken} from '../../apps/api/src/customer-session.mjs';
import {createCustomerSessionVerifier} from '../../apps/api/src/customer-session-verifier.mjs';
import {registerPublishedCustomerFeatures} from '../../apps/api/src/published-customer-features.mjs';
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
const admin=new Pool({connectionString:target,max:3,connectionTimeoutMillis:3000});
test('CV-014 PG17 + Fastify + Chromium passkey login, one waiter call per table and durable attendance',
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
 const origin='https://127.0.0.1:4178',password='ci_call_'+randomBytes(12).toString('hex');
 const managementOrigin='https://localhost:4179';
 const pools=[];let api,browser,clientPreview,managementPreview;
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
  const issuer='https://sabora-cv014-ci.test/auth/v1';
  const authFixture=createStaffPasskeyBrowserFixture({
   issuer,origin:managementOrigin,kid:'call-ci-'+suffix,userIds:[waiterA]
  });
  const {getTrustedKeys,provider,token:jwt}=authFixture;
  const guardHooks=createStaffProtectedHooksFromPool({pool:pools[2],issuer,getTrustedKeys});
  const passkey=createStaffPasskeySession({origin:managementOrigin,issuer,secret,
   getTrustedKeys,provider});
  const passkeyGuard=createStaffProtectedHooksFromPool({pool:pools[2],issuer,
   getTrustedKeys,authenticate:passkey.authenticate});
  const forRoles=roles=>async(req,reply)=>{
   // Direct Fastify injections still exercise the two independent Bearer
   // fixtures for concurrency. The browser uses only the passkey session.
   const hooks=req.headers.host===new URL(managementOrigin).host?passkeyGuard:guardHooks;
   for(const hook of hooks(roles)){await hook(req,reply);if(reply.sent)return;}
  };
  const verify=createCustomerSessionVerifier({query:(sql,params)=>admin.query(sql,params)});
  const cookieAuth=createCustomerCookieAuth({verifyCustomerSession:verify,
   revokeCustomerSession:async()=>false,allowedOrigin:origin});
  api=Fastify({logger:false,trustProxy:false});
  passkey.register(api,{forRoles:passkeyGuard,features:{
   waiterCalls:true,tableChange:false,management:false,ownership:false
  }});
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
  registerPublishedCustomerFeatures(api,{tableChange:false,waiterCalls:true,isAvailable:()=>true});
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
  clientPreview=await startPublishedClientPwa({apiOrigin:apiUrl,port:4178,tls:true});
  managementPreview=await startPublishedManagementPwa({apiOrigin:apiUrl,port:4179,tls:true});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
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
  const managementContext=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  await managementContext.addInitScript(()=>{
   window.fixtureFloorVibrations=0;
   Object.defineProperty(navigator,'vibrate',{value:()=>{window.fixtureFloorVibrations++;return true;}});
  });
  const manager=await managementContext.newPage();
  await manager.setViewportSize({width:1200,height:900});
  await manager.goto(managementOrigin);
  await authFixture.registerDevice(managementContext,manager,waiterA);
  await manager.getByRole('button',{name:'Entrar con passkey'}).click();
  await manager.getByRole('button',{name:'Cerrar sesión'}).waitFor();
  assert((await managementContext.cookies()).some(item=>
   item.name==='__Host-sabora-staff'&&item.httpOnly&&item.secure&&item.sameSite==='Strict'));
  await manager.reload();
  await manager.getByRole('button',{name:'Cerrar sesión'}).waitFor();
  await manager.getByRole('complementary',{name:'Avisos de sala'})
   .getByText('Llamadas pendientes de atender: 1.').waitFor();
  assert.equal(await manager.getByRole('link',{name:/Configuración/}).count(),0);
  assert.equal(await manager.getByRole('link',{name:/Equipo/}).count(),0);
  await manager.getByRole('link',{name:/Comandas/}).click();
  await manager.getByRole('button',{name:'Sala'}).click();
  await manager.getByRole('button',{name:'Marcar atendida'}).waitFor({timeout:15000});
  await managementContext.setOffline(true);
  await manager.getByText(/Sin conexión\. Se comprobarán las llamadas/).waitFor();
  assert.equal(await manager.getByRole('button',{name:'Marcar atendida'}).count(),0);
  assert.equal(await manager.getByText('No hay llamadas pendientes confirmadas.').count(),0);
  assert.equal((await getStaff(waiterB)).json().items[0].id,call.id);
  await managementContext.setOffline(false);
  await manager.getByRole('button',{name:'Marcar atendida'}).waitFor({timeout:15000});
  await manager.getByRole('button',{name:'Marcar atendida'}).click();
  await manager.getByText('No hay llamadas pendientes confirmadas.').waitFor({timeout:15000});
  assert.equal((await getStaff(waiterB)).json().items.length,0);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.waiter_call_events WHERE call_id=$1',[call.id])).rows[0].n,2);
  await client.getByRole('button',{name:'Consultar llamada'}).click();
  await client.getByText('Puedes avisar a sala',{exact:false}).waitFor({timeout:12000});
  const emptySummary=manager.waitForResponse(r=>r.url().endsWith('/api/v1/operations/waiter-calls'));
  const readySummary=manager.waitForResponse(r=>r.url().includes('/api/v1/operations/order-lines?status=ready'));
  await manager.getByRole('link',{name:/Resumen/}).click();
  assert.equal((await emptySummary).status(),200);
  await (await readySummary).finished();
  await manager.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await manager.getByRole('complementary',{name:'Avisos de sala'}).count(),0);
  await managementContext.setOffline(true);
  const followupId=randomUUID();
  assert.equal((await customerPost(followupId)).statusCode,200);
  await managementContext.setOffline(false);
  await manager.getByRole('complementary',{name:'Avisos de sala'})
   .getByText('Llamadas pendientes de atender: 1.').waitFor();
  assert.equal(await manager.evaluate(()=>window.fixtureFloorVibrations),1);
  const repeatedSummary=manager.waitForResponse(r=>r.url().endsWith('/api/v1/operations/waiter-calls'));
  await manager.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal((await repeatedSummary).status(),200);
  assert.equal(await manager.evaluate(()=>window.fixtureFloorVibrations),1);
  assert.equal((await attend(waiterB,followupId)).statusCode,200);
  await manager.getByRole('button',{name:'Cerrar sesión'}).click();
  await manager.getByText('Sesión cerrada.').waitFor();
  await manager.reload();
  await manager.getByRole('button',{name:'Entrar con passkey'}).waitFor();
  await managementContext.close();
  await context.close();
 }finally{
  await browser?.close().catch(()=>{});
  await clientPreview?.close().catch(()=>{});
  await managementPreview?.close().catch(()=>{});
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
