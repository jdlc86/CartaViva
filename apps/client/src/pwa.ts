export function registerClientServiceWorker(){
 if(!('serviceWorker' in navigator)||import.meta.env.DEV)return;
 window.addEventListener('load',()=>{
  void navigator.serviceWorker.register(new URL('sw.js',new URL(import.meta.env.BASE_URL,window.location.origin)),{scope:import.meta.env.BASE_URL}).catch(()=>{
   // Installation support is progressive; failure must not break the menu.
  });
 },{once:true});
}
