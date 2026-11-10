import {useState} from 'react';
import {FinanceDashboardView} from './FinanceDashboardView';
import {CommunicationsView} from './CommunicationsView';
import type {M3AuthenticatedManagementGateway} from '../m3-authenticated-management-gateway';

export function ConfigurationView({gateway,financeAllowed,commsAllowed,canWriteAdmin=false}:{
 gateway:M3AuthenticatedManagementGateway|null;financeAllowed:boolean;commsAllowed:boolean;canWriteAdmin?:boolean;
}){
 const [tab,setTab]=useState<'comms'|'finance'>('comms');
 return <div className="configuration-view">
  <h1>Configuración</h1>
  <nav className="configuration-tabs" aria-label="Opciones de configuración">
   {commsAllowed?<button type="button" aria-pressed={tab==='comms'}
    onClick={()=>setTab('comms')}>Comunicaciones</button>:null}
   {financeAllowed?<button type="button" aria-pressed={tab==='finance'}
    onClick={()=>setTab('finance')}>Indicadores financieros</button>:null}
  </nav>
  {commsAllowed&&tab==='comms'?<CommunicationsView gateway={gateway} canWriteAdmin={canWriteAdmin}/>:
   financeAllowed&&gateway?<FinanceDashboardView gateway={gateway}/>:
   commsAllowed?<CommunicationsView gateway={gateway} canWriteAdmin={canWriteAdmin}/>:
   <p role="status">No hay áreas de configuración autorizadas.</p>}
 </div>;
}
