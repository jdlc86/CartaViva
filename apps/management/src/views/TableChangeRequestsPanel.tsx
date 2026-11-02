import {useEffect,useRef,useState} from 'react';
import {ConnectionNotice,EmptyState,ErrorState,LoadingState,StatusBadge} from '../components/Primitives';

export type PendingTableChange = Readonly<{
 requestId:string;sourceTableNumber:number;expiresAt:string;
}>;
export type TableChangeQueueGateway = Readonly<{
 listPendingTableChanges():Promise<readonly PendingTableChange[]>;
 decideTableChange(input:{requestId:string;decision:'approved'|'rejected'}):
  Promise<Readonly<{requestId:string;status:'approved'|'rejected'}>>;
}>;
type Phase='loading'|'ready'|'error';
const formatExpiry=(date:string)=>new Intl.DateTimeFormat('es-ES',{
 hour:'2-digit',minute:'2-digit',second:'2-digit'
}).format(new Date(date));

/** Candidate only: never shown without an explicitly supplied verified gateway. */
export function TableChangeRequestsPanel({gateway}:{
 gateway?:TableChangeQueueGateway
}){
 const [phase,setPhase]=useState<Phase>('loading');
 const [items,setItems]=useState<readonly PendingTableChange[]>([]);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [version,setVersion]=useState(0);
 const [now,setNow]=useState(()=>Date.now());
 // One-shot deadline timer: no polling, and no stale active decisions after expiry.
 useEffect(()=>{
  if(phase!=='ready'||items.length===0)return;
  const current=Date.now();
  const deadlines=items.map(item=>Date.parse(item.expiresAt))
   .filter(deadline=>Number.isFinite(deadline)&&deadline>current);
  if(deadlines.length===0)return;
  const next=Math.min(...deadlines);
  const timer=window.setTimeout(()=>setNow(Date.now()),
   Math.min(Math.max(1,next-current),2147483647));
  return ()=>window.clearTimeout(timer);
 },[phase,items,now]);
 const generation=useRef(0);
 useEffect(()=>{
  const current=++generation.current;
  if(!gateway){setItems([]);return;}
  setPhase('loading');setError(null);setItems([]);
  void gateway.listPendingTableChanges().then(rows=>{
   if(generation.current!==current)return;
   setItems(rows);setPhase('ready');
  }).catch(()=>{
   if(generation.current!==current)return;
   setPhase('error');setItems([]);
  });
  return ()=>{generation.current++;};
 },[gateway,version]);
 if(!gateway)return <section aria-label="Solicitudes de cambio de mesa">
  <ConnectionNotice title="Solicitudes de cambio de mesa no conectadas.">
   La autorización del personal y la lectura restringida de PostgreSQL deben validarse antes de habilitar decisiones.
  </ConnectionNotice>
 </section>;
 const decide=async(item:PendingTableChange,decision:'approved'|'rejected')=>{
  if(busy||Date.parse(item.expiresAt)<=Date.now())return;
  const current=generation.current;
  setBusy(item.requestId);setError(null);
  try{
   const response=await gateway.decideTableChange({requestId:item.requestId,decision});
   if(generation.current!==current)return;
   if(response.requestId!==item.requestId||response.status!==decision)
    throw Error('invalid_decision_response');
   setItems(rows=>rows.filter(row=>row.requestId!==item.requestId));
  }catch{
   if(generation.current===current)setError('No se pudo decidir la solicitud. Actualiza la lectura antes de reintentar.');
  }finally{
   if(generation.current===current)setBusy(null);
  }
 };
 return <section className="panel" aria-label="Solicitudes de cambio de mesa">
  <div className="panel__header">
   <div><span className="eyebrow">Atención en sala</span>
    <h2>Solicitudes de cambio de mesa</h2>
    <p>La aprobación permite escanear otra mesa; el consumo solo se traslada al confirmar un nuevo pedido.</p>
   </div>
   <button type="button" className="button" disabled={busy!==null}
    onClick={()=>setVersion(value=>value+1)}>Actualizar solicitudes</button>
  </div>
  {error?<p role="alert">{error}</p>:null}
  {phase==='loading'?<LoadingState title="Consultando solicitudes"
   description="Lectura autenticada sin actualización automática."/>:null}
  {phase==='error'?<ErrorState title="No se pudieron consultar las solicitudes"
   description="No se mostrará información anterior ni se permitirán decisiones."
   onRetry={()=>setVersion(value=>value+1)}/>:null}
  {phase==='ready'&&items.length===0?<EmptyState icon="tables"
   title="Sin solicitudes pendientes"
   description="Las nuevas solicitudes aparecerán cuando actualices la lectura." compact/>:null}
  {phase==='ready'&&items.length>0?<div className="table-grid">
   {items.map(item=>{
    const expired=Date.parse(item.expiresAt)<=now;
    return <article key={item.requestId} className="table-card">
     <div className="table-card__heading">
      <h3>Mesa {item.sourceTableNumber}</h3>
      <StatusBadge tone={expired?'neutral':'warning'}>{expired?'CADUCADA':'PENDIENTE'}</StatusBadge>
     </div>
     <p>Respuesta hasta las {formatExpiry(item.expiresAt)}.</p>
     <div className="page-actions">
      <button type="button" className="button" disabled={expired||busy!==null}
       onClick={()=>void decide(item,'approved')}>Aprobar cambio</button>
      <button type="button" className="button" disabled={expired||busy!==null}
       onClick={()=>void decide(item,'rejected')}>Rechazar</button>
     </div>
    </article>;
   })}
  </div>:null}
 </section>;
}
