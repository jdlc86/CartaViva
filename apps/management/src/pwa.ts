// A verified employee session is never stored by the service worker.
export function registerManagementServiceWorker(){
 if(!('serviceWorker' in navigator)||import.meta.env.DEV)return;
 const root=new URL(import.meta.env.BASE_URL,window.location.origin);
 window.addEventListener('load',()=>{
  void navigator.serviceWorker.register(new URL('sw.js',root),{scope:root.pathname})
   .catch(()=>{ /* PWA installation failure must not disrupt live management. */ });
 },{once:true});
}
