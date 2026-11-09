// CV-012 integrated browser gate. Real production bundles are served over
// loopback HTTP; Chromium installs BOTH SW registrations, exercises routing,
// cache isolation, offline recovery and a network-only private API sentinel.
// This tests SW behavior, not authenticated production API/PG17.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,sep,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=resolve(here,'../..');
const clientDist=resolve(root,'apps/client/dist');
const managementDist=resolve(root,'apps/management/dist');
const requireClient=createRequire(new URL('../../apps/client/package.json',import.meta.url));
const {chromium}=requireClient('@playwright/test');
const mime={
 '.html':'text/html; charset=utf-8',
 '.js':'application/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8',
 '.svg':'image/svg+xml',
 '.webmanifest':'application/manifest+json',
 '.png':'image/png'
};
const serve=(mode,shouldDrop=()=>false)=>createServer(async(req,res)=>{
 if(shouldDrop()){
  // A real loss of the loopback origin, not a fulfilled mock document.
  req.socket.destroy();
  return;
 }
 const url=new URL(req.url??'/','http://127.0.0.1');
 if(url.pathname==='/api/v1/private'){
  res.writeHead(200,{'content-type':'application/json','cache-control':'private, no-store'});
  res.end(JSON.stringify({secret:'network-only-sentinel'}));
  return;
 }
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const management=mode==='management'||url.pathname==='/gestion/'||
  url.pathname.startsWith('/gestion/');
 const directory=management?managementDist:clientDist;
 const prefix=management?'/gestion/':'/';
 if(!url.pathname.startsWith(prefix)){
  res.writeHead(404);res.end();return;
 }
 let relative=url.pathname.slice(prefix.length);
 if(relative===''||(!relative.includes('.')&&url.pathname.includes('/qr/v1/')))
  relative='index.html';
 if(relative.includes('..')||relative.includes('\\')||relative.includes('%')){
  res.writeHead(400);res.end();return;
 }
 const filepath=resolve(directory,relative);
 if(!filepath.startsWith(directory+sep)){res.writeHead(403);res.end();return;}
 try{
  const fileStat=await stat(filepath);
  if(!fileStat.isFile())throw Error('not_file');
  const body=await readFile(filepath);
  res.writeHead(200,{
   'content-type':mime[extname(filepath)]??'application/octet-stream',
   'cache-control':relative==='index.html'?'no-store':'public, max-age=60',
   'x-content-type-options':'nosniff'
  });
  res.end(body);
 }catch{res.writeHead(404);res.end();}
});
const listen=async(server)=>{
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 return 'http://127.0.0.1:'+server.address().port;
};
const waitForScope=async(page,path)=>{
 const expectedScript=path==='/'?'/sw.js':'/gestion/sw.js';
 // A registration may already expose reg.active while its state is still
 // 'activating'. Reloading at that point races activate/clients.claim(), so
 // Chromium can load a document that is never controlled by that worker.
 // Require the *correct* script and completed activation before navigation.
 await page.waitForFunction(async({scope,script})=>{
  const registrations=await navigator.serviceWorker.getRegistrations();
  return registrations.some(reg=>new URL(reg.scope).pathname===scope&&
   reg.active?.state==='activated'&&
   new URL(reg.active.scriptURL).pathname===script);
 },{scope:path,script:expectedScript},{timeout:35000});
 // Keep the original strong assertion: a service-worker registration alone
 // does not prove that the actual page navigation is controlled.
 await page.reload({waitUntil:'load'});
 try{
  await page.waitForFunction(expected=>
   navigator.serviceWorker.controller&&
   new URL(navigator.serviceWorker.controller.scriptURL).pathname===expected,
   expectedScript,{timeout:35000});
 }catch(error){
  // Safe diagnostics: only public worker paths/states, never cookies or URLs
  // with QR fragments. This is not a fallback that turns failures into PASS.
  const diagnostic=await page.evaluate(async()=>{
   const registrations=await navigator.serviceWorker.getRegistrations();
   return {documentPath:location.pathname,
    controllerPath:navigator.serviceWorker.controller?
     new URL(navigator.serviceWorker.controller.scriptURL).pathname:null,
    registrations:registrations.map(reg=>({
     scope:new URL(reg.scope).pathname,
     active:reg.active?{
      path:new URL(reg.active.scriptURL).pathname,state:reg.active.state}:null
    }))};
  }).catch(()=>({inspection:'unavailable'}));
  throw new Error('cv012_service_worker_control_missing: '+
   JSON.stringify({path,expectedScript,diagnostic}),{cause:error});
 }
};
const inventory=page=>page.evaluate(async()=>{
 const names=await caches.keys();
 const entries=[];
 for(const name of names){
  const cache=await caches.open(name);
  for(const request of await cache.keys())entries.push({cache:name,url:request.url});
 }
 const registrations=(await navigator.serviceWorker.getRegistrations())
  .map(reg=>new URL(reg.scope).pathname).sort();
 return {names,entries,registrations,controlled:navigator.serviceWorker.controller?.scriptURL};
});
const assertNoPrivateCaches=state=>{
 assert.equal(state.entries.some(v=>/\/api\/|\/qr\/|private|order|account/i.test(new URL(v.url).pathname)),false,
  'service workers must not cache API, table QR or financial/customer records');
 assert.equal(state.entries.some(v=>new URL(v.url).pathname.endsWith('/index.html')),false,
  'personalized HTML navigation must not be persisted');
};
const main=async()=>{
 let originOutage=false;
 const sameOrigin=serve('combined',()=>originOutage);
 const isolatedStaff=serve('management');
 let browser;
 const artifacts=join(process.env.RUNNER_TEMP??'/tmp','sabora-cv012-browser');
 await mkdir(artifacts,{recursive:true});
 try{
  const origin=await listen(sameOrigin);
  const staffOrigin=await listen(isolatedStaff);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
  const page=await context.newPage();
  await page.goto(origin+'/',{waitUntil:'load'});
  await waitForScope(page,'/');
  const customerManifest=await page.evaluate(async()=>
   (await fetch('/manifest.webmanifest')).json());
  assert.equal(customerManifest.id,'/sabora-client-app');
  assert.equal(customerManifest.scope,'/');
  assert.equal(customerManifest.start_url,'/');
  assert.equal(customerManifest.display,'standalone');
  assert.ok(customerManifest.icons.some(icon=>icon.sizes==='192x192'&&icon.type==='image/png'));
  assert.ok(customerManifest.icons.some(icon=>icon.sizes==='512x512'&&icon.type==='image/png'));
  await page.goto(origin+'/gestion/#mesas',{waitUntil:'load'});
  await waitForScope(page,'/gestion/');
  const staffManifest=await page.evaluate(async()=>
   (await fetch('/gestion/manifest.webmanifest')).json());
  assert.equal(staffManifest.id,'/gestion/sabora-management-app');
  assert.equal(staffManifest.scope,'/gestion/');
  assert.equal(staffManifest.start_url,'/gestion/');
  assert.equal(staffManifest.display,'standalone');
  assert.ok(staffManifest.icons.some(icon=>icon.sizes==='192x192'&&icon.type==='image/png'));
  assert.ok(staffManifest.icons.some(icon=>icon.sizes==='512x512'&&icon.type==='image/png'));
  for(const icon of staffManifest.icons.filter(icon=>icon.type==='image/png')){
   const picture=await page.evaluate(async src=>{
    const img=new Image();img.src=src;await img.decode();
    return {width:img.naturalWidth,height:img.naturalHeight};
   },icon.src);
   assert.equal(picture.width,Number.parseInt(icon.sizes,10));
   assert.equal(picture.height,picture.width);
  }
  let state=await inventory(page);
  assert.deepEqual(state.registrations,['/','/gestion/']);
  assert.ok(state.names.some(n=>n.startsWith('sabora-client-shell-')));
  assert.ok(state.names.some(n=>n.startsWith('sabora-management-shell-')));
  assertNoPrivateCaches(state);
  await page.evaluate(()=>fetch('/api/v1/private').then(r=>r.json()));
  state=await inventory(page);
  assertNoPrivateCaches(state);
  await page.screenshot({path:join(artifacts,'management-installed.png'),fullPage:true});

  // Drop the origin's actual HTTP connection. Browser offlining alone may
  // not trigger identical service-worker network paths across CI versions.
  originOutage=true;
  // A hash-only navigation does not make a network request and therefore
  // cannot exercise the offline service-worker navigation fallback.
  await page.goto(origin+'/gestion/?cv012-offline=1#comandas',{waitUntil:'domcontentloaded'});
  const staffFallback=await page.evaluate(async()=>({
   title:document.title,heading:document.querySelector('h1')?.textContent,
   controlled:navigator.serviceWorker.controller?.scriptURL,
   offlineCached:Boolean(await caches.match('/gestion/offline.html'))
  }));
  assert.equal(staffFallback.heading,'Gestión sin conexión',JSON.stringify(staffFallback));
  await page.screenshot({path:join(artifacts,'management-offline.png'),fullPage:true});
  await page.goto(origin+'/qr/v1/SABORA_CI/00000000-0000-4000-8000-000000000001#test-secret',
   {waitUntil:'domcontentloaded'});
  const customerFallback=await page.evaluate(()=>({
   title:document.title,heading:document.querySelector('h1')?.textContent,
   controlled:navigator.serviceWorker.controller?.scriptURL
  }));
  assert.equal(customerFallback.heading,'Carta sin conexión',JSON.stringify(customerFallback));
  assert.equal((await page.locator('body').innerText()).includes('test-secret'),false);
  await page.screenshot({path:join(artifacts,'client-offline.png'),fullPage:true});
  const secretAccessible=await page.evaluate(async()=>{
   try{await fetch('/api/v1/private');return true;}catch{return false;}
  });
  assert.equal(secretAccessible,false,'private API must not serve from a service-worker cache');
  originOutage=false;
  await page.goto(origin+'/',{waitUntil:'load'});
  assert.match(await page.title(),/Sabora/);
  state=await inventory(page);
  assertNoPrivateCaches(state);
  await context.close();

  // A distinct staff origin must not share CacheStorage or registrations
  // with the client origin. This remains the required deployment isolation.
  const separate=await browser.newContext({serviceWorkers:'allow'});
  const staffPage=await separate.newPage();
  await staffPage.goto(staffOrigin+'/gestion/',{waitUntil:'load'});
  await waitForScope(staffPage,'/gestion/');
  const separateState=await inventory(staffPage);
  assert.deepEqual(separateState.registrations,['/gestion/']);
  assert.equal(separateState.names.some(n=>n.startsWith('sabora-client-shell-')),false);
  assertNoPrivateCaches(separateState);
  await separate.close();
  console.log('CV-012 PASS: 2 installed scopes, bounded public caches, offline/online, same-origin SW routing and distinct-origin storage');
 }finally{
  if(browser)await browser.close();
  await Promise.all([new Promise(ok=>sameOrigin.close(()=>ok())),new Promise(ok=>isolatedStaff.close(()=>ok()))]);
 }
};
await main();
