import React from 'react';
import {createRoot} from 'react-dom/client';
import {SaboraClientApp} from './App';
import {registerClientServiceWorker} from './pwa';
import {consumeInitialTableQr} from './table-qr';
import './style.css';

const root=document.getElementById('root');
if(!root)throw Error('missing_client_root');
const initialTableQr=consumeInitialTableQr();
const app=createRoot(root);
type Features={tableChange:boolean;waiterCalls:boolean};
const operational=import.meta.env.VITE_SABORA_OPERATIONAL_PWA==='1';
const fallback:Features={tableChange:operational,waiterCalls:false};

async function readFeatures():Promise<Features|null>{
 try{
  const response=await fetch('/api/v1/customer/features',{
   cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(4000)
  });
  if(!response.ok)return null;
  const value=await response.json();
  return typeof value?.tableChange==='boolean'&&typeof value.waiterCalls==='boolean'&&
   Object.keys(value).length===2?{tableChange:value.tableChange,waiterCalls:value.waiterCalls}:null;
 }catch{return null;}
}

function render(features:Features){
 // A missing or mismatched API must not select the old direct QR flow for
 // a distributed H6 PWA. It can recover when the right API is reachable.
 app.render(<React.StrictMode><SaboraClientApp initialTableQr={initialTableQr}
  enableTableChangeFlow={features.tableChange}
  enableWaiterCalls={features.waiterCalls}/></React.StrictMode>);
}
void readFeatures().then(features=>render(features??fallback));
window.addEventListener('online',()=>{void readFeatures().then(features=>{if(features)render(features);});});
registerClientServiceWorker();
