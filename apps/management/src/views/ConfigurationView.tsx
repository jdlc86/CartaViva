import {useState} from 'react';
import {FinanceDashboardView} from './FinanceDashboardView';
import {CommunicationsView} from './CommunicationsView';
import {RootSecurityPanel} from './RootSecurityPanel';
import type {RootSecurityGateway} from '../staff-root-security-gateway';
import type {M3AuthenticatedManagementGateway} from '../m3-authenticated-management-gateway';

export function ConfigurationView({gateway,financeAllowed,commsAllowed,canWriteAdmin=false,rootSecurityGateway}:{
 gateway:M3AuthenticatedManagementGateway|null;financeAllowed:boolean;commsAllowed:boolean;canWriteAdmin?:boolean;rootSecurityGateway?:RootSecurityGateway;
}){
 const [tab,setTab]=useState<'comms'|'finance'|'security'>(rootSecurityGateway?'security':'comms');
 return <div className="configuration-view">
  <h1>Configuración</h1>
  <nav className="configuration-tabs" aria-label="Opciones de configuración">
   {rootSecurityGateway?<button type="button" aria-pressed={tab==='security'} onClick={()=>setTab('security')}>Seguridad</button>:null}
   {commsAllowed?<button type="button" aria-pressed={tab==='comms'}
    onClick={()=>setTab('comms')}>Comunicaciones</button>:null}
   {financeAllowed?<button type="button" aria-pressed={tab==='finance'}
    onClick={()=>setTab('finance')}>Indicadores financieros</button>:null}
  </nav>
  {rootSecurityGateway&&tab==='security'?<RootSecurityPanel gateway={rootSecurityGateway}/>:
   commsAllowed&&tab==='comms'?<CommunicationsView gateway={gateway} canWriteAdmin={canWriteAdmin}/>:
   financeAllowed&&gateway?<FinanceDashboardView gateway={gateway}/>:
   commsAllowed?<CommunicationsView gateway={gateway} canWriteAdmin={canWriteAdmin}/>:
   <p role="status">No hay áreas de configuración autorizadas.</p>}
 </div>;
}
