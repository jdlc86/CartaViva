// CV-014: integrated disposable PG17, real cookie and JWT/HMAC Fastify,
// concurrency, append-only events and client/management Chromium PWA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash,createECDH} from 'node:crypto';
import {readFile} from 'node:fs/promises';
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
import {createFloorPushComposition,FLOOR_PUSH_ROUTINES} from '../../apps/api/src/floor-web-push.mjs';
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
 const suffix=process.pid.toString(36),logins=['sabora_call_c_'+suffix,'sabora_call_s_'+suffix,'sabora_call_reader_'+suffix,'sabora_call_push_'+suffix];
 const [loginC,loginS,loginR,loginPush]=logins;
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
 const vapid=createECDH('prime256v1'),device=createECDH('prime256v1');
 const publicKey=vapid.generateKeys('base64url'),p256dh=device.generateKeys('base64url'),auth=randomBytes(16).toString('base64url');
 const chromeEndpoint='https://fcm.googleapis.com/fcm/send/fixture-waiter-a';
 const safariEndpoint='https://web.push.apple.com/fixture-waiter-b';
 const expiredEndpoint='https://fcm.googleapis.com/fcm/send/fixture-expired';
 const deliveries=[];
 const send=async(subscription,payload)=>{
  deliveries.push({endpoint:subscription.endpoint,payload});
  return subscription.endpoint===expiredEndpoint?'gone':'accepted';
 };
 const pools=[];let api,browser,clientPreview,managementPreview;
 try{
  await admin.query(await readFile(new URL('../../docs/security/sql-candidates/floor_web_push_pg17.sql',import.meta.url),'utf8'));
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
  await admin.query('GRANT USAGE ON SCHEMA sabora TO '+loginPush);
  await admin.query('GRANT EXECUTE ON FUNCTION '+FLOOR_PUSH_ROUTINES.join(',')+' TO '+loginPush);
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
  await assert.rejects(pools[3].query('SELECT * FROM sabora.floor_push_subscriptions'),/permission denied/);
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
  const makePush=()=>createFloorPushComposition({pool:pools[3],expectedLogin:loginPush,origin:managementOrigin,publicKey,send});
  const push=makePush(),restarted=makePush();
  await push.readiness();
  api.addHook('onClose',async()=>{await Promise.all([push.close(),restarted.close()]);});
  passkey.register(api,{forRoles:passkeyGuard,features:{
   waiterCalls:true,tableChange:false,management:false,ownership:false,floorPush:true
  }});
  registerWaiterCallHttp(api,{cookieAuth,forRoles,repository});
  push.register(api,{forRoles});
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
  const deviceAction=(actor,action,endpoint,deviceOrigin=managementOrigin)=>api.inject({method:'POST',
   url:'/api/v1/operations/floor-push',headers:{authorization:'Bearer '+jwt(actor),origin:deviceOrigin},
   payload:{action,endpoint,p256dh,auth}});
  assert.equal((await deviceAction(kitchen,'enable',safariEndpoint)).statusCode,403);
  assert.equal((await deviceAction(waiterB,'enable',safariEndpoint,origin)).statusCode,403);
  for(const endpoint of ['https://fcm.googleapis.com.attacker.invalid/fcm/send/demo',
   'https://foo.push.apple.com/demo','https://fcm.googleapis.com:444/fcm/send/demo',
   'https://fcm.googleapis.com/fcm/send/demo?next=external','https://web.push.apple.com@127.0.0.1/demo'])
   assert.equal((await deviceAction(waiterB,'enable',endpoint)).statusCode,400);
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
  const managementContext=await browser.newContext({ignoreHTTPSErrors:true});
  await managementContext.grantPermissions(['notifications'],{origin:managementOrigin});
  await managementContext.addInitScript(({endpoint,keys})=>{
   window.fixtureFloorVibrations=0;
   Object.defineProperty(navigator,'vibrate',{value:()=>{window.fixtureFloorVibrations++;return true;}});
   const subscription={toJSON:()=>({endpoint,keys}),unsubscribe:async()=>{
    window.localStorage.removeItem('ci-push-device');return true;
   }};
   PushManager.prototype.getSubscription=async()=>window.localStorage.getItem('ci-push-device')?subscription:null;
   PushManager.prototype.subscribe=async()=>{window.localStorage.setItem('ci-push-device','active');return subscription;};
  },{endpoint:chromeEndpoint,keys:{p256dh,auth}});
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
  await manager.getByRole('button',{name:'Activar avisos en este dispositivo'}).click();
  await manager.getByRole('status').filter({hasText:'Avisos activos en este dispositivo.'}).waitFor();
  assert.equal((await deviceAction(waiterB,'enable',chromeEndpoint)).statusCode,409);
  assert.equal((await deviceAction(waiterB,'enable',safariEndpoint)).statusCode,200);
  assert.equal((await deviceAction(waiterB,'enable',expiredEndpoint)).statusCode,200);
  const pushCall=randomUUID();
  assert.equal((await customerPost(pushCall)).statusCode,200);
  assert.equal((await customerPost(randomUUID(),otherToken)).json().id,pushCall);
  const pushState=async()=> (await admin.query(`SELECT fence,round(extract(epoch FROM due_at-statement_timestamp()))::int AS seconds
   FROM sabora.floor_push_schedule WHERE signal_id=$1`,[pushCall])).rows[0];
  assert.ok((await pushState()).seconds<=0);
  push.start();restarted.start();
  await Promise.all([push.tick(),restarted.tick()]);
  assert.deepEqual(deliveries.map(entry=>entry.endpoint).sort(),[chromeEndpoint,safariEndpoint,expiredEndpoint].sort());
  const initialPayload=deliveries.find(entry=>entry.endpoint===chromeEndpoint).payload;
  assert.equal(initialPayload.kind,'call');
  const {seconds,fence}=await pushState();
  assert.ok(seconds>=29&&seconds<=30);
  assert.equal((await deviceAction(waiterB,'status',expiredEndpoint)).json().enabled,false);
  await push.close();
  await restarted.tick();
  assert.equal(deliveries.length,3);
  assert.equal((await pushState()).fence,fence);
  await admin.query("UPDATE sabora.floor_push_schedule SET due_at=clock_timestamp()-interval '1 second' WHERE signal_id=$1",[pushCall]);
  await restarted.tick();
  assert.equal(deliveries.length,5);
  assert.equal(deliveries.at(-1).payload.tag,initialPayload.tag);
  assert.notEqual(deliveries.at(-1).payload.occurrence,initialPayload.occurrence);
  const protocol=await managementContext.newCDPSession(manager);
  const readyRegistration=new Promise(resolve=>protocol.on('ServiceWorker.workerRegistrationUpdated',({registrations})=>{
   const current=registrations.find(item=>item.scopeURL===managementOrigin+'/'&&!item.isDeleted);
   if(current)resolve(current.registrationId);
  }));
  await protocol.send('ServiceWorker.enable');
  const registrationId=await readyRegistration;
  await manager.goto('about:blank');
  await protocol.send('ServiceWorker.deliverPushMessage',{origin:managementOrigin,registrationId,
   data:JSON.stringify(initialPayload)});
  await manager.goto(managementOrigin);
  await manager.waitForFunction(async tag=>{
   const worker=await navigator.serviceWorker.getRegistration();
   return (await worker?.getNotifications({tag:'sabora-floor-'+tag}))?.some(item=>item.title==='Llamada pendiente');
  },initialPayload.tag);
  await protocol.detach();
  await manager.getByRole('button',{name:'Ir a comandas'}).click();
  await manager.getByRole('button',{name:'Sala'}).click();
  await manager.getByRole('button',{name:'Marcar atendida'}).click();
  await manager.getByText('No hay llamadas pendientes confirmadas.').waitFor();
  assert.equal(await pushState(),undefined);
  await restarted.tick();assert.equal(deliveries.length,5);
  await admin.query("UPDATE sabora.staff_members SET state='suspended' WHERE user_id=$1",[waiterB]);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM sabora.floor_push_subscriptions WHERE staff_id=$1',[waiterB])).rows[0].n,0);
  await manager.getByRole('button',{name:'Cerrar sesión'}).click();
  await manager.getByText('Sesión cerrada.').waitFor();
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM sabora.floor_push_subscriptions WHERE staff_id=$1',[waiterA])).rows[0].n,0);
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
