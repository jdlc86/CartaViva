import {useCallback,useEffect,useRef,useState} from 'react';
import type {RootSecurityGateway,RootSecuritySnapshot} from '../staff-root-security-gateway';

export function RootSecurityPanel({gateway}:{gateway:RootSecurityGateway}){
 const [state,setState]=useState<RootSecuritySnapshot|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [code,setCode]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
 const [confirm,setConfirm]=useState(false);
 const epoch=useRef(0),inFlight=useRef(false);
 const refresh=useCallback(async()=>{
  const current=++epoch.current;
  setState(null);setError(null);
  try{const result=await gateway.read();if(epoch.current===current)setState(result);}
  catch{if(epoch.current===current)setError('No se pudo consultar la seguridad de ROOT. No se habilitan acciones.');}
 },[gateway]);
 useEffect(()=>{void refresh();return()=>{epoch.current++;};},[refresh]);
 async function mutate(action:'reset'|'replace_code'){
  if(inFlight.current||!state?.configured||code||(action==='replace_code'&&!confirm))return;
  const current=++epoch.current;inFlight.current=true;setBusy(true);setError(null);setNotice(null);
  try{
   const result=await gateway.mutate(action);
   if(epoch.current!==current)return;
   setState({configured:result.configured,failures:result.failures,blockedUntil:result.blockedUntil});
   setCode(result.code??null);setConfirm(false);
   setNotice(action==='reset'?'Contador restablecido.':'Código sustituido. El anterior ya no es válido.');
  }catch{if(epoch.current===current){setState(null);setError('La acción no quedó confirmada. Actualiza el estado antes de repetirla.');}}
  finally{inFlight.current=false;if(epoch.current===current)setBusy(false);}
 }
 return <section className="panel staff-enrollment" aria-labelledby="root-security-title">
  <div className="panel-heading"><div><span className="eyebrow">Seguridad de ROOT</span><h2 id="root-security-title">Recuperación de ROOT</h2></div></div>
  <p>El correo de seguridad y el código independiente son necesarios para recuperar el acceso cuando pierdas todas las passkeys.</p>
  {error?<p role="alert" className="field-error">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  {!state&&!error?<p role="status">Comprobando estado de recuperación…</p>:null}
  {state&&!state.configured?<p role="status">Recuperación aún no configurada.</p>:null}
  {state?.configured?<dl><div><dt>Fallos acumulados</dt><dd>{state.failures}</dd></div>
   <div><dt>Último plazo de bloqueo</dt><dd>{state.blockedUntil?new Date(state.blockedUntil).toLocaleString('es-ES'):'Sin bloqueo registrado'}</dd></div></dl>:null}
  {code?<div className="staff-directory-detail" aria-label="Nuevo código de recuperación">
   <h3>Guarda este código fuera del correo</h3><p>Se muestra una sola vez. No se puede consultar de nuevo.</p>
   <code style={{overflowWrap:'anywhere',userSelect:'all'}}>{code}</code><button type="button" className="button button--primary" onClick={()=>setCode(null)}>He guardado el código</button>
  </div>:null}
  {!code&&state?.configured?<div className="view-stack">
   <button className="button button--secondary" type="button" disabled={busy} onClick={()=>void mutate('reset')}>Restablecer contador con passkey</button>
   <label className="confirmation-check"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/><span>Confirmo que guardaré el nuevo código y que el anterior dejará de funcionar.</span></label>
   <button className="button button--primary" type="button" disabled={busy||!confirm} onClick={()=>void mutate('replace_code')}>Sustituir código con passkey</button>
  </div>:null}
  {!code?<button className="filter-button" type="button" disabled={busy} onClick={()=>void refresh()}>Actualizar estado de seguridad</button>:null}
 </section>;
}
