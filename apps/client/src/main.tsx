import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

type Screen = 'welcome' | 'identity' | 'menu';
type Customer = {alias:string; company:string};
const storageKey='sabora.customer.display-preferences.v1';
// This is a local-only UI prototype. No customer credentials, IDs or
// authentication state are stored in browser storage.
function App(){
 const [screen,setScreen]=useState<Screen>('welcome');
 const [customer,setCustomer]=useState<Customer>(()=>{
  try {
   const raw=localStorage.getItem(storageKey);
   if(!raw || raw.length>1024)return {alias:'',company:''};
   const value:unknown=JSON.parse(raw);
   if(!value || typeof value!=='object')return {alias:'',company:''};
   const candidate=value as Record<string,unknown>;
   if(typeof candidate.alias!=='string' || typeof candidate.company!=='string')return {alias:'',company:''};
   const alias=candidate.alias.trim(),company=candidate.company.trim();
   if(!alias || [...alias].length>80 || [...company].length>160 ||
      /[\\u0000-\\u001f\\u007f]/u.test(alias+company))return {alias:'',company:''};
   return {alias,company};
  }catch{return {alias:'',company:''};}
 });
 const [message,setMessage]=useState('');
 function savePreferences(event:React.FormEvent){
  event.preventDefault();
  const alias=customer.alias.trim();
  const company=customer.company.trim();
  if(!alias || [...alias].length>80 || [...company].length>160 || /[\\u0000-\\u001f\\u007f]/u.test(alias+company)){
   setMessage('Introduce un alias válido de hasta 80 caracteres.');
   return;
  }
  // Display preference only: backend registration and HttpOnly session cookie
  // are not wired yet. Do not present this as authenticated registration.
  try{localStorage.setItem(storageKey,JSON.stringify({alias,company}));}catch{}
  setCustomer({alias,company});setMessage('Preferencias guardadas en este dispositivo. El registro seguro estará disponible próximamente.');
  setScreen('menu');
 }
 return <div className="client-shell">
  <header className="topbar"><span className="wordmark">SABORA<span className="wordmark-dot">.</span></span><span className="topbar-label">Carta digital</span></header>
  <main className="client-content">
   {screen==='welcome'&&<section className="welcome">
    <span className="eyebrow">BIENVENIDO A SABORA</span>
    <h1>Una buena comida empieza aquí.</h1>
    <p>Descubre la experiencia de tu restaurante desde el móvil.</p>
    <div className="welcome-actions"><button className="primary-button" onClick={()=>{setMessage('');setScreen(customer.alias?'menu':'identity');}}>{customer.alias?'Continuar como '+customer.alias:'Empezar'} <span aria-hidden="true">→</span></button></div>
    <div className="feature-note"><span aria-hidden="true">✦</span><div><strong>Tu mesa, tu experiencia</strong><p>Próximamente podrás consultar los platos y seguir tu pedido sin esperas.</p></div></div>
   </section>}
   {screen==='identity'&&<section className="identity-panel">
    <button className="text-button" onClick={()=>setScreen('welcome')}>← Volver</button>
    <span className="eyebrow">TU IDENTIDAD EN SABORA</span>
    <h1>¿Cómo quieres que te llamemos?</h1>
    <p>Usa un alias. No necesitamos tu número de empleado ni datos corporativos.</p>
    <form onSubmit={savePreferences}>
     <label htmlFor="alias">Alias o apodo <span aria-hidden="true">*</span></label>
     <input id="alias" required maxLength={80} autoComplete="nickname" value={customer.alias} onChange={e=>setCustomer({...customer,alias:e.target.value})} placeholder="Por ejemplo, Ana" />
     <label htmlFor="company">Empresa <small>(opcional)</small></label>
     <input id="company" maxLength={160} value={customer.company} onChange={e=>setCustomer({...customer,company:e.target.value})} placeholder="Puedes dejarlo en blanco"/>
     {message&&<p role="alert" className="form-message">{message}</p>}
     <button className="primary-button" type="submit">Continuar <span aria-hidden="true">→</span></button>
    </form>
    <p className="privacy-note">Por ahora guardaremos solo estas preferencias en este dispositivo. La identidad recuperable con passkey y las sesiones seguras aún están en desarrollo.</p>
   </section>}
   {screen==='menu'&&<section className="menu-panel">
    <span className="eyebrow">EXPERIENCIA SABORA</span>
    <h1>Hola, {customer.alias}.</h1>
    <p>Tu alias está listo en este dispositivo. Aún no has creado una cuenta ni iniciado sesión.</p>
    <div className="placeholder-card"><span className="placeholder-icon" aria-hidden="true">◈</span><h2>La carta estará disponible pronto</h2><p>Estamos preparando el catálogo, el acceso mediante QR y los pedidos por mesa.</p><span className="status-tag">Vista de preparación · sin pedidos reales</span></div>
    <button className="text-button" onClick={()=>{setMessage('');setScreen('identity');}}>Editar mis preferencias</button>
   </section>}
  </main>
  <footer className="client-footer">SABORA · Una experiencia CartaViva</footer>
 </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
