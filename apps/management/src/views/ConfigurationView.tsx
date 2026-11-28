import {useEffect, useRef, useState, type FormEvent} from 'react';
import {FinanceDashboardView} from './FinanceDashboardView';
import {CommunicationsView} from './CommunicationsView';
import {RootSecurityPanel} from './RootSecurityPanel';
import type {RootSecurityGateway} from '../staff-root-security-gateway';
import type {M3AuthenticatedManagementGateway} from '../m3-authenticated-management-gateway';

function TableChangeWindowPanel({gateway}:{gateway:M3AuthenticatedManagementGateway}){
 const read=gateway.readTableChangeWindow,save=gateway.saveTableChangeWindow;
 const [current,setCurrent]=useState<{seconds:number;canWrite:boolean}|null>(null);
 const [value,setValue]=useState('');
 const [busy,setBusy]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const attempt=useRef<string|null>(null);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  const active=new AbortController();
  controller.current=active;
  setCurrent(null);setError('');
  void read?.({signal:active.signal}).then(result=>{
   if(!active.signal.aborted){setCurrent(result);setValue(String(result.seconds));}
  }).catch(()=>{
   if(!active.signal.aborted)setError('No se pudo consultar el plazo vigente.');
  });
  return()=>active.abort();
 },[read,refresh]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const seconds=Number(value);
  const signal=controller.current?.signal;
  if(!signal||!read||!save||!current?.canWrite||busy||
   !Number.isInteger(seconds)||seconds<1||seconds>600||seconds===current.seconds)return;
  const requestId=attempt.current??crypto.randomUUID();
  attempt.current=requestId;
  setBusy(true);setNotice('');setError('');
  try{
   await save({requestId,expectedSeconds:current.seconds,seconds,signal});
   const latest=await read({signal});
   if(signal.aborted)return;
   attempt.current=null;
   setCurrent(latest);setValue(String(latest.seconds));
   setNotice(latest.seconds===seconds?'Plazo guardado para nuevas solicitudes.':'Se ha consultado el plazo vigente.');
  }catch(failure){
   if(signal.aborted)return;
   if(failure instanceof Error&&['m3_management_conflict','m3_management_forbidden'].includes(failure.message)){
    attempt.current=null;
    setCurrent(null);
    setError('El plazo o tu permiso cambió. Consulta el estado antes de volver a guardar.');
   }else setError('No se pudo confirmar el cambio. Puedes reintentar la misma operación.');
  }finally{
   if(!signal.aborted)setBusy(false);
  }
 }
 return <section aria-label="Plazo de cambio de mesa">
  <h2>Plazo de cambio de mesa</h2>
  <p>El plazo se aplica a las nuevas solicitudes. Las solicitudes abiertas conservan su vencimiento.</p>
  {error?<p role="alert" className="field-error">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  {current?.canWrite&&save?<form onSubmit={submit}>
   <label htmlFor="table-change-window-seconds">Plazo de respuesta en segundos</label>
   <input id="table-change-window-seconds" type="number" min="1" max="600" step="1" required
    value={value} disabled={busy} onChange={event=>{
     attempt.current=null;setValue(event.target.value);setNotice('');
    }}/>
   <button type="submit" disabled={busy||Number(value)===current.seconds}>{busy?'Guardando…':'Guardar plazo'}</button>
  </form>:current?<p>Plazo vigente: {current.seconds} segundos.</p>:
   error?<button type="button" onClick={()=>setRefresh(value=>value+1)}>Consultar plazo</button>:
   <p role="status">Consultando el plazo vigente…</p>}
 </section>;
}

export function ConfigurationView({gateway,financeAllowed,commsAllowed,canWriteAdmin=false,rootSecurityGateway}:{
 gateway:M3AuthenticatedManagementGateway|null;financeAllowed:boolean;commsAllowed:boolean;canWriteAdmin?:boolean;rootSecurityGateway?:RootSecurityGateway;
}){
 const [tab,setTab]=useState<'comms'|'finance'|'security'|'tableChange'>(rootSecurityGateway?'security':'comms');
 return <div className="configuration-view">
  <h1>Configuración</h1>
  <nav className="configuration-tabs" aria-label="Opciones de configuración">
   {rootSecurityGateway?<button type="button" aria-pressed={tab==='security'} onClick={()=>setTab('security')}>Seguridad</button>:null}
   {commsAllowed?<button type="button" aria-pressed={tab==='comms'}
    onClick={()=>setTab('comms')}>Comunicaciones</button>:null}
   {financeAllowed?<button type="button" aria-pressed={tab==='finance'}
    onClick={()=>setTab('finance')}>Indicadores financieros</button>:null}
   {gateway?.readTableChangeWindow?<button type="button" aria-pressed={tab==='tableChange'}
    onClick={()=>setTab('tableChange')}>Cambio de mesa</button>:null}
  </nav>
  {gateway?.readTableChangeWindow&&tab==='tableChange'?<TableChangeWindowPanel gateway={gateway}/>:
   rootSecurityGateway&&tab==='security'?<RootSecurityPanel gateway={rootSecurityGateway}/>:
   commsAllowed&&tab==='comms'?<CommunicationsView gateway={gateway} canWriteAdmin={canWriteAdmin}/>:
   financeAllowed&&gateway?<FinanceDashboardView gateway={gateway}/>:
   commsAllowed?<CommunicationsView gateway={gateway} canWriteAdmin={canWriteAdmin}/>:
   gateway?.readTableChangeWindow?<TableChangeWindowPanel gateway={gateway}/>:
   <p role="status">No hay áreas de configuración autorizadas.</p>}
 </div>;
}
