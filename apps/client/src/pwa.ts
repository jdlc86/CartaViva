export function registerClientServiceWorker(){
 if(!('serviceWorker' in navigator)||import.meta.env.DEV)return;
 window.addEventListener('load',()=>{
  void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{
   // Installation support is progressive; failure must not break the menu.
  });
 },{once:true});
}
