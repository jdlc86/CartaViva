import {useEffect, useState} from 'react';
import type {OrderOperationsGateway} from '../order-operations-gateway.js';
const FLOOR_ALERT_VIBRATION_MS=180;

export function FloorAlerts({gateway,onOpen}:{
 gateway:OrderOperationsGateway;onOpen:()=>void;
}){
 const [summary,setSummary]=useState<{calls:number;ready:number;moreReady:boolean}|null>(null);
 useEffect(()=>{
  let active=true,revision=0;
  let lastCalls:Set<string>|null=null,lastReady:Set<string>|null=null;
  const refresh=()=>{
   const request=++revision;
   void Promise.allSettled([
    gateway.listWaiterCalls?.()??Promise.resolve([]),
    gateway.listBoard({status:'ready',limit:100})
   ]).then(([calls,board])=>{
    if(!active||request!==revision)return;
    const projected=board.status==='fulfilled'&&board.value.role==='waiter'?board.value:null;
    const nextCalls=calls.status==='fulfilled'?calls.value.map(call=>call.id):null;
    const nextReady=projected?.items.flatMap(line=>line.pickup?.state==='ready'
      ? [line.pickup.taskId+':'+line.pickup.version] : [])??null;
    const newCall=nextCalls?.some(id=>lastCalls!==null&&!lastCalls.has(id));
    const newReady=nextReady?.some(id=>lastReady!==null&&!lastReady.has(id));
    if(nextCalls)lastCalls=new Set(nextCalls);
    if(nextReady)lastReady=new Set(nextReady);
    setSummary({calls:nextCalls?.length??0,ready:nextReady?.length??0,moreReady:Boolean(projected?.nextCursor)});
    if((newCall||newReady)&&typeof navigator.vibrate==='function'){
     try{navigator.vibrate(FLOOR_ALERT_VIBRATION_MS);}catch{/* The browser may suppress haptics. */}
    }
   });
  };
  const offline=()=>{revision++;setSummary(null);};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  const unsubscribe=gateway.subscribeEvents({
   onEvent:event=>{
    if(event.type.startsWith('sabora.waiter_call.')||event.type.startsWith('sabora.pickup.'))refresh();
   },
   onResync:refresh,onReconnected:refresh,
   onUnavailable:reason=>{
    if(reason==='access-revoked'){lastCalls=null;lastReady=null;}
    if(reason==='access-revoked'||!navigator.onLine)offline();
   }
  });
  refresh();
  window.addEventListener('online',refresh);
  window.addEventListener('offline',offline);
  document.addEventListener('visibilitychange',visible);
  return()=>{
   active=false;unsubscribe();
   window.removeEventListener('online',refresh);
   window.removeEventListener('offline',offline);
   document.removeEventListener('visibilitychange',visible);
  };
 },[gateway]);
 if(!summary||(summary.calls===0&&summary.ready===0&&!summary.moreReady))return null;
 return <aside className="connection-notice" aria-label="Avisos de sala">
  <p role="status">
   {summary.calls>0?`Llamadas pendientes de atender: ${summary.calls}. `:''}
   {summary.ready>0?`Platos listos para recoger: ${summary.ready}${summary.moreReady?'+':''}.`:''}
   {summary.ready===0&&summary.moreReady?'Hay más comandas para consultar en sala.':''}
  </p>
  <button type="button" className="filter-button" onClick={onOpen}>Ir a comandas</button>
 </aside>;
}
