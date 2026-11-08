import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createM3ManagementCapabilityIssuer} from '../../apps/api/src/m3-management-capability.mjs';
import {
 M5_COMMS_ADMIN_ROLE,M5_COMMS_PUBLIC_ROLE,READ_M5_COMMS_ADMIN_SQL,
 MANAGE_M5_COMMS_SQL,READ_M5_COMMS_PUBLIC_SQL,
 assertM5CommunicationsCapability,createM5CommunicationsRepositories,
 createM5CommunicationsStream,registerM5CommunicationsHttp
} from '../../apps/api/src/m5-communications.mjs';

const url=process.env.SABORA_CI_PG_URL,pgModule=process.env.SABORA_CI_PG_MODULE;
const playwrightModule=process.env.SABORA_CI_PLAYWRIGHT_MODULE;
if(!url||!pgModule||!playwrightModule)throw Error('cv014_disposable_pg17_browser_harness_required');
const target=new URL(url);
if(process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(pgModule)||
 target.protocol!=='postgresql:'||target.hostname!=='127.0.0.1'||
 target.username!=='postgres'||target.password!=='sabora_ci_ephemeral_only'||
 target.pathname!=='/postgres'||!/^\d+$/.test(target.port))
 throw Error('cv014_unsafe_pg17_target');
const require=createRequire(import.meta.url);
const {Pool}=require(pgModule);
const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
const {chromium}=await import(pathToFileURL(playwrightModule).href);
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const admin=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000,
 options:'-c statement_timeout=10000'});
const DEFAULT_PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/afnsAAAAASUVORK5CYII=','base64');
const APP_ADMIN_TOKEN='sabora_ci_admin_token_allowed_for_pg17';
const APP_WAITER_TOKEN='sabora_ci_waiter_token_must_fail_pg17';
const after=ms=>new Promise(r=>setTimeout(r,ms));
async function waitHttp(url,deadline=30_000){
 for(let i=0;i<150;i++){
  try{const response=await fetch(url);if(response.ok)return;}catch{}
  await after(200);
 }
 throw Error('cv014_browser_server_unavailable:'+url);
}
function runVite(app,port,api){
 const dir=join(projectRoot,'apps',app);
 const process=spawn('pnpm',['exec','vite','--mode','test','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:dir,
  env:{...globalThis.process.env,SABORA_CI_COMMS_API:api},stdio:'pipe'});
 let log='';process.stdout.on('data',chunk=>{log+=String(chunk);});
 process.stderr.on('data',chunk=>{log+=String(chunk);});
 return {process,getLog:()=>log};
}
function draft({title='Menú especial del día',startDate=null,image=null}={}){
 return {title,body:'Platos especiales publicados por el restaurante. 🥘',
  emoji:'🥘',image,imageLicense:image?'Foto de ensayo con licencia del restaurante':null,
  priority:'ALTA',schedule:{mode:'daily',startDate:startDate??new Date(Date.now()-86_400_000)
   .toISOString().slice(0,10),endDate:null,weekdays:[],startTime:'00:00',
   endTime:'23:59',timeZone:'UTC'}};
}
async function cleanupSql({logins,actorId,keyId}){
 await admin.query('DELETE FROM sabora.comms_audit_m5 WHERE actor_id=$1',[actorId]).catch(()=>{});
 await admin.query('DELETE FROM sabora.comms_receipts_m5 WHERE actor_id=$1',[actorId]).catch(()=>{});
 await admin.query('DELETE FROM sabora.comms_announcements_m5 WHERE actor_id=$1',[actorId]).catch(()=>{});
 await admin.query('DELETE FROM sabora.staff_members WHERE user_id=$1',[actorId]).catch(()=>{});
 await admin.query('DELETE FROM sabora.order_operation_signing_keys WHERE key_id=$1',[keyId]).catch(()=>{});
 for(const login of logins){await admin.query('DROP OWNED BY '+login).catch(()=>{});
  await admin.query('DROP ROLE IF EXISTS '+login).catch(()=>{});}
}
test('CV-014: actual PostgreSQL17 → signed Fastify → two Chromium PWAs → published notices, scheduling, roles, events and audit', 
 {timeout:180_000},async()=>{
 const actorId=randomUUID(),runSuffix=process.pid.toString(36);
 const adminLogin='sabora_cv014_admin_'+runSuffix,publicLogin='sabora_cv014_public_'+runSuffix;
 const password='sabora_ci_comms_'+randomBytes(16).toString('hex');
 const keyId='comms_ci_'+runSuffix+'_key';
 const secret=Buffer.alloc(32,11);
 const logged=[adminLogin,publicLogin];
 let adminPool,publicPool,app,stream,browser;
 const processes=[];
 try{
  for(const [login,role] of [[adminLogin,M5_COMMS_ADMIN_ROLE],[publicLogin,M5_COMMS_PUBLIC_ROLE]]){
   await admin.query('CREATE ROLE '+login+" LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
   await admin.query('GRANT '+role+' TO '+login+' WITH SET TRUE, INHERIT FALSE');
  }
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys
   (key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',
   clock_timestamp()+interval '1 hour')`,[keyId,secret]);
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active')",[actorId]);
  const direct=await admin.query(`SELECT
   has_table_privilege($1,'sabora.comms_announcements_m5','SELECT') AS admin_table,
   has_table_privilege($2,'sabora.comms_announcements_m5','SELECT') AS public_table,
   has_function_privilege($1,'sabora.read_public_communications_m5()','EXECUTE') AS admin_public_rpc,
   has_function_privilege($2,'sabora.manage_communications_m5(jsonb,text,text)','EXECUTE') AS public_write_rpc`,
   [adminLogin,publicLogin]);
  assert.deepEqual(direct.rows[0],{admin_table:false,public_table:false,
   admin_public_rpc:false,public_write_rpc:false});
  const loginUrl=new URL(url);loginUrl.username=adminLogin;loginUrl.password=password;
  adminPool=new Pool({connectionString:loginUrl.toString(),max:4,connectionTimeoutMillis:3000,
   options:'-c statement_timeout=10000'});
  loginUrl.username=publicLogin;
  publicPool=new Pool({connectionString:loginUrl.toString(),max:5,connectionTimeoutMillis:3000,
   options:'-c statement_timeout=10000'});
  assert(await assertM5CommunicationsCapability({pool:adminPool,expectedLogin:adminLogin,kind:'admin'}));
  assert(await assertM5CommunicationsCapability({pool:publicPool,expectedLogin:publicLogin,kind:'public'}));
  const issuer=createM3ManagementCapabilityIssuer({keyId,secret,databaseRole:adminLogin});
  const repositories=createM5CommunicationsRepositories({
   adminTx:createRoleScopedPostgresTransaction({pool:adminPool,role:M5_COMMS_ADMIN_ROLE,
    allowedSql:new Set([READ_M5_COMMS_ADMIN_SQL,MANAGE_M5_COMMS_SQL])}),
   publicTx:createRoleScopedPostgresTransaction({pool:publicPool,role:M5_COMMS_PUBLIC_ROLE,
    allowedSql:new Set([READ_M5_COMMS_PUBLIC_SQL])}),
   issueCapability:issuer});
  stream=await createM5CommunicationsStream({pool:publicPool,readPublic:repositories.readPublic});
  const forRoles=roles=>async(request,reply)=>{
   const value=request.headers.authorization;
   const role=value==='Bearer '+APP_ADMIN_TOKEN?'admin':
    value==='Bearer '+APP_WAITER_TOKEN?'waiter':null;
   if(!role||!roles.includes(role)){reply.code(403).send({error:'forbidden'});return;}
   request.verifiedIdentity={userId:actorId};request.verifiedStaff={userId:actorId,role};
  };
  app=Fastify({logger:false,trustProxy:false});
  registerM5CommunicationsHttp(app,{forRoles,repositories,stream});
  const serverUrl=await app.listen({host:'127.0.0.1',port:0});
  const verified={verifiedIdentity:{userId:actorId},verifiedStaff:{userId:actorId,role:'admin'}};
  const post=async(operation,payload,requestId=randomUUID(),token=APP_ADMIN_TOKEN)=>
   fetch(serverUrl+'/api/v1/admin/communications/actions',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({requestId,operation,payload})});
  const getPublic=async()=>fetch(serverUrl+'/api/v1/public/communications').then(r=>r.json());
  assert.deepEqual((await getPublic()).items,[]);
  const blocked=await post('save',{id:null,revision:null,draft:draft()},randomUUID(),APP_WAITER_TOKEN);
  assert.equal(blocked.status,403,'waiter must never publish communications');

  const saveRequestId=randomUUID();
  const created=await (await post('save',{id:null,revision:null,draft:draft()},saveRequestId)).json();
  assert.equal(created.state,'draft');
  assert.equal((await getPublic()).items.length,0,'private draft cannot leak into customer');
  assert.equal((await(await post('save',{id:null,revision:null,draft:draft()},saveRequestId)).json()).replayed,true);
  const tampered=await post('save',{id:null,revision:null,draft:draft({title:'Manipulado'})},saveRequestId);
  assert.equal(tampered.status,409);
  const published=(await(await post('publish',{id:created.id,revision:created.revision,draft:null})).json());
  assert.equal(published.state,'published');
  const initialPublic=await getPublic();
  assert.equal(initialPublic.items.length,1);
  assert.equal(initialPublic.items[0].title,'Menú especial del día');
  const future=new Date(Date.now()+2*86_400_000).toISOString().slice(0,10);
  const scheduled=(await(await post('save',{id:null,revision:null,draft:draft({
   title:'Anuncio programado',startDate:future})})).json());
  await post('publish',{id:scheduled.id,revision:scheduled.revision,draft:null});
  assert.equal((await getPublic()).items.length,1,'scheduled future news not visible early');
  assert.equal(typeof (await getPublic()).nextTransitionAt,'string','one-shot next time available');

  // Two actual React PWAs: Chromium reaches Fastify which uses sealed PostgreSQL
  // RPC and LISTEN/NOTIFY; neither screenshot nor UI test is a fictional static mock.
  const clientVite=runVite('client',4178,serverUrl),managementVite=runVite('management',4179,serverUrl);
  processes.push(clientVite,managementVite);
  await Promise.all([waitHttp('http://127.0.0.1:4178/'),waitHttp('http://127.0.0.1:4179/')]);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  const customer=await context.newPage();
  await customer.setViewportSize({width:390,height:844});
  await customer.goto('http://127.0.0.1:4178/');
  await customer.getByRole('button',{name:/Abrir anuncio: Menú especial del día/}).waitFor({timeout:20_000});
  await customer.getByRole('button',{name:/Abrir anuncio: Menú especial del día/}).click();
  await customer.getByRole('dialog',{name:'Menú especial del día'}).waitFor();
  assert.equal(await customer.locator('.announcement-details img').count(),0,
   'optional image has no blank placeholder');
  await customer.getByRole('button',{name:'Cerrar'}).click();

  const manager=await context.newPage();
  await manager.setViewportSize({width:1440,height:1000});
  await manager.goto('http://127.0.0.1:4179/');
  await manager.evaluate(async(token)=>{
   const {mountAuthenticatedManagementApp}=await import('/src/main.tsx');
   const element=document.getElementById('root');
   window.__cv014Dispose=mountAuthenticatedManagementApp({
    element,getAccessToken:async()=>token,enableM3Management:true
   });
  },APP_ADMIN_TOKEN);
  await manager.getByRole('link',{name:/Configuración/}).waitFor({timeout:20_000});
  await manager.getByRole('link',{name:/Configuración/}).click();
  await manager.getByRole('heading',{name:'Comunicaciones'}).waitFor();
  await manager.getByLabel('Título (máx. 120)').fill('Oferta de la tarde');
  await manager.getByLabel('Mensaje (admite saltos de línea y emojis)').fill('Prueba integral de anuncio con fotografía');
  await manager.getByLabel('Emoji para la banda').fill('🌿');
  await manager.getByLabel('Fotografía opcional (propia o con licencia; máximo 128 KiB)')
   .setInputFiles({name:'anuncio.png',mimeType:'image/png',buffer:DEFAULT_PNG});
  await manager.getByLabel('Procedencia y licencia de la imagen')
   .fill('Imagen de ensayo propia, autorizada para estas pruebas');
  await manager.getByRole('button',{name:'Guardar borrador'}).click();
  await manager.getByText('Borrador guardado.',{exact:false}).waitFor();
  assert.equal((await getPublic()).items.length,1,'save cannot silently publish');
  const itemsAfterSave=(await repositories.readAdmin(verified)).items;
  const photo=itemsAfterSave.find(a=>a.draft.title==='Oferta de la tarde');
  assert(photo,'management must create a real durable row');
  await manager.getByRole('button',{name:'Publicar borrador'}).last().click();
  await manager.getByText('Anuncio publicado.',{exact:false}).waitFor();
  assert.equal((await getPublic()).items.length,2);
  await customer.getByRole('button',{name:/Abrir anuncio: Oferta de la tarde/})
   .waitFor({timeout:18_000});
  await customer.getByRole('button',{name:/Abrir anuncio: Oferta de la tarde/}).click();
  await customer.locator('.announcement-details img').waitFor();
  assert.equal((await customer.locator('.announcement-details img').getAttribute('src')||'').startsWith('data:image/png;base64,'),true);
  await customer.getByRole('button',{name:'Cerrar'}).click();

  // Staff pause and withdraw must remove public projection without client polling.
  const live=(await repositories.readAdmin(verified)).items.find(a=>a.id===photo.id);
  assert(live);
  const paused=await post('pause',{id:live.id,revision:live.revision,draft:null});
  assert.equal(paused.status,200);
  assert.equal((await getPublic()).items.length,1);
  const pausedVersion=(await repositories.readAdmin(verified)).items.find(a=>a.id===photo.id);
  await post('resume',{id:photo.id,revision:pausedVersion.revision,draft:null});
  assert.equal((await getPublic()).items.length,2);
  const resumedVersion=(await repositories.readAdmin(verified)).items.find(a=>a.id===photo.id);
  await post('withdraw',{id:photo.id,revision:resumedVersion.revision,draft:null});
  assert.equal((await getPublic()).items.length,1);
  const record=(await admin.query('SELECT count(*)::integer AS n FROM sabora.comms_audit_m5 WHERE announcement_id=$1',
   [photo.id])).rows[0];
  assert.equal(record.n,5,'save/publish/pause/resume/withdraw must write five durable audit entries');
  const screenshots=join(process.env.RUNNER_TEMP||'/tmp','sabora-cv014-browser');
  mkdirSync(screenshots,{recursive:true});
  await customer.screenshot({path:join(screenshots,'cliente-anuncios-390.png'),fullPage:true});
  await manager.screenshot({path:join(screenshots,'gestion-comunicaciones-1440.png'),fullPage:true});
  await context.close();
 }finally{
  for(const v of processes){v.process.kill('SIGTERM');}
  if(browser)await browser.close().catch(()=>{});
  if(app)await app.close().catch(()=>{});
  if(stream)await stream.close().catch(()=>{});
  if(adminPool)await adminPool.end().catch(()=>{});
  if(publicPool)await publicPool.end().catch(()=>{});
  await cleanupSql({logins:logged,actorId,keyId});
 }
});
test.after(async()=>{await admin.end();});
