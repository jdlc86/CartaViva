import {useEffect,useState} from 'react';
import {manageFloorPush,readFloorPushKey,supportsFloorPush} from '../floor-push';

export function FloorPushSettings({send,onChange}:{send:typeof fetch;onChange:(enabled:boolean)=>void}){
 const [setup,setSetup]=useState<{manager:PushManager;key:Uint8Array<ArrayBuffer>}|null>(null);
 const [subscription,setSubscription]=useState<PushSubscription|null>(null);
 const [enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const supported=supportsFloorPush();
 useEffect(()=>{
  if(!supported)return;
  let active=true;
  const timeout=window.setTimeout(()=>{if(active)setMessage('Los avisos de dispositivo no están disponibles.');},6000);
  void Promise.all([navigator.serviceWorker.ready,readFloorPushKey(send)])
   .then(async ([registration,key])=>{
    if(!active)return;
    const current=await registration.pushManager.getSubscription();
    const assigned=current?await manageFloorPush(send,'status',current):false;
    if(!active)return;
    clearTimeout(timeout);
    setSetup({manager:registration.pushManager,key});setSubscription(current);
    setEnabled(assigned);onChange(assigned);setMessage('');
   }).catch(()=>{if(active){clearTimeout(timeout);setMessage('No se pudieron consultar los avisos de dispositivo.');}});
  return()=>{active=false;clearTimeout(timeout);};
 },[send,onChange,supported]);

 async function toggle(){
  if(!setup)return;
  setBusy(true);setMessage('');
  try{
   if(enabled&&subscription){
    await manageFloorPush(send,'disable',subscription);
    await subscription.unsubscribe();setSubscription(null);setEnabled(false);onChange(false);
    setMessage('Avisos desactivados en este dispositivo.');
    return;
   }
   const current=subscription??await setup.manager.subscribe({userVisibleOnly:true,applicationServerKey:setup.key});
   setSubscription(current);
   await manageFloorPush(send,'enable',current);setEnabled(true);onChange(true);
   setMessage('Avisos activos en este dispositivo.');
  }catch{
   setMessage(Notification.permission==='denied'?'Los permisos del navegador bloquean los avisos.':
    'No se pudo actualizar el dispositivo.');
  }finally{setBusy(false);}
 }

 if(!supported)return <p role="status" className="connection-notice">Este navegador no ofrece avisos de dispositivo.</p>;
 return <aside className="connection-notice" aria-label="Avisos de dispositivo">
  <button type="button" className="filter-button" disabled={!setup||busy} onClick={()=>void toggle()}>
   {enabled?'Desactivar avisos en este dispositivo':'Activar avisos en este dispositivo'}
  </button>
  {message&&<p role="status">{message}</p>}
 </aside>;
}
