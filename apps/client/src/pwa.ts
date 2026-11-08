export function registerClientServiceWorker(){
 if(!('serviceWorker' in navigator)||import.meta.env.DEV)return;
 const register=()=>{
  void navigator.serviceWorker.register(new URL('sw.js',new URL(import.meta.env.BASE_URL,window.location.origin)),{scope:import.meta.env.BASE_URL}).catch(()=>{
   // Installation support is progressive; failure must not break the menu.
  });
 };
 // A deferred module may execute after window.load; do not silently skip
 // registration if the document has already completed loading.
 if(document.readyState==='complete')register();
 else window.addEventListener('load',register,{once:true});
}
