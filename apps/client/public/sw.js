// Customer PWA: offline shell only. Never persist API responses, QR tokens,
// staff/customer identities, mutable catalog, orders, account balances or SSE.
const APP='client';
const CACHE='sabora-client-shell-v2';
const SCOPE=new URL(self.registration.scope);
const ROOT=SCOPE.pathname;
const OFFLINE=new URL('offline.html',SCOPE).href;
const STATIC=["icons/sabora-mark.svg","manifest.webmanifest","brand/sabora-logo-outline-v3.svg","offline.html"];
const OWN_CACHE=name=>name.startsWith('sabora-'+APP+'-shell-');
const inScope=url=>url.origin===SCOPE.origin&&url.pathname.startsWith(ROOT);
const isBundledAsset=url=>inScope(url)&&url.search===''&&
 /^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname.slice(ROOT.length-1));
const staticPath=url=>inScope(url)&&url.search===''&&
 STATIC.some(name=>url.pathname===ROOT+name);
const publicAsset=(request,url)=>
 request.method==='GET'&&url.search===''&&
 !request.headers.has('authorization')&&
 (isBundledAsset(url)||staticPath(url));

self.addEventListener('install',event=>event.waitUntil((async()=>{
 const response=await fetch(ROOT,{cache:'no-store',credentials:'omit'});
 if(!response.ok||!(response.headers.get('content-type')||'').includes('text/html'))
  throw Error('pwa_shell_unavailable');
 // The bundle is public, but HTML/navigation is deliberately NOT cached:
 // a personalized bootstrap must never be replayed to another user.
 const html=await response.text();
 const referenced=[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(match=>new URL(match[1],SCOPE))
  .filter(url=>isBundledAsset(url)).map(url=>url.href);
 const cache=await caches.open(CACHE);
 const immutable=[...new Set([...STATIC.map(name=>new URL(name,SCOPE).href),...referenced])];
 await cache.addAll(immutable.map(url=>new Request(url,{credentials:'omit',cache:'reload'})));
 await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(name=>OWN_CACHE(name)&&name!==CACHE)
  .map(name=>caches.delete(name)));
 await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(!inScope(url)||url.pathname.startsWith(ROOT+'api/')||
    url.pathname.startsWith('/api/')||
    url.pathname==='/gestion'||url.pathname.startsWith('/gestion/')||
    request.headers.has('authorization'))return;
 if(request.mode==='navigate'){
  // No HTML cache, even for root, QR links or the employee workspace.
  event.respondWith(fetch(request).catch(async()=>
   (await caches.open(CACHE)).match(OFFLINE)||Response.error()));
  return;
 }
 if(publicAsset(request,url)&&['script','style','image','font','manifest'].includes(request.destination)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const stored=await cache.match(request);
   if(stored)return stored;
   const response=await fetch(request);
   if(response.ok&&response.type==='basic'&&
      !(response.headers.get('cache-control')||'').match(/private|no-store/i))
    await cache.put(request,response.clone());
   return response;
  })());
 }
});
