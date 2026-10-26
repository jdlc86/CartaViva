const CACHE='sabora-client-shell-v1';
const STATIC_SHELL=['/manifest.webmanifest','/brand/sabora-logo-outline-v3.svg','/icons/sabora-mark.svg'];
async function cacheBuiltShell(){
 const cache=await caches.open(CACHE);
 const documentResponse=await fetch('/',{cache:'no-store'});
 if(!documentResponse.ok)throw Error('shell_unavailable');
 const html=await documentResponse.clone().text();
 const builtAssets=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match=>match[1]);
 await cache.put('/',documentResponse);
 await cache.addAll([...STATIC_SHELL,...new Set(builtAssets)]);
 await self.skipWaiting();
}
self.addEventListener('install',event=>{event.waitUntil(cacheBuiltShell());});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put('/',response.clone()));return response;}).catch(()=>caches.match('/')));
  return;
 }
 if(['script','style','image','font','manifest'].includes(request.destination)){
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response;})));
 }
});
