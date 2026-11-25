import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import type {AdminCatalogGateway} from './catalog-read-model';
import type {OrderOperationsGateway} from './order-operations-gateway.js';
import {createAuthenticatedOrderOperationsGateway} from './order-operations-authenticated-gateway.js';
import {createManagementSessionFence} from './management-session-fence.js';
import {createAuthenticatedOwnershipGovernanceGateway,type OwnershipGovernanceGateway} from './ownership-governance-gateway.js';
import {createStaffManagementGateway,type StaffManagementGateway,
  type StaffRevocationGateway} from './staff-management-gateway.js';
import {createStaffDirectoryGateway,type StaffDirectoryGateway} from './staff-directory-gateway.js';
import {Icon, type IconName} from './components/Icon';
import {parseManagementArea, toManagementHash, type ManagementArea} from './navigation-model';
import type {AdminTablesGateway} from './tables-read-model';
import type {M3CatalogGateway} from './m3-catalog-management-model.js';
import {createM3AuthenticatedManagementGateway,type M3AuthenticatedManagementGateway} from './m3-authenticated-management-gateway.js';
import {CatalogView} from './views/CatalogView';
import {OrdersView} from './views/OrdersView';
import {CashView} from './views/CashView';
import {SummaryView} from './views/SummaryView';
import {FinanceDashboardView} from './views/FinanceDashboardView';
import {ConfigurationView} from './views/ConfigurationView';
import {TablesView} from './views/TablesView';
import type {TableChangeQueueGateway} from './views/TableChangeRequestsPanel';
import {TeamView} from './views/TeamView';
import {registerManagementServiceWorker} from './pwa';
import type {StaffGatewayAuth} from './staff-gateway-auth.js';
import {createStaffSessionFetch,endStaffSession,readStaffSession,signInWithStaffPasskey,
  StaffAuthenticationError,supportsStaffPasskey,type StaffSession} from './staff-passkey';
import './style.css';

const sections: ReadonlyArray<{id: ManagementArea; label: string; detail: string; icon: IconName}> = [
  {id:'resumen', label: 'Resumen', detail: 'Estado general', icon: 'overview'},
  {id:'catalogo', label: 'Catálogo', detail: 'Carta e imágenes', icon: 'catalog'},
  {id:'mesas', label: 'Mesas y QR', detail: 'Accesos de mesa', icon: 'tables'},
  {id:'comandas', label: 'Comandas', detail: 'Cocina y sala', icon: 'orders'},
  {id:'caja', label: 'Consumo', detail: 'Liquidación operativa', icon: 'tables'},
  {id:'configuracion', label:'Configuración',detail:'Comunicaciones y finanzas',icon:'overview'},
  {id:'equipo', label: 'Equipo', detail: 'Roles y titularidad', icon: 'team'},
];
const areasByRole: Record<StaffSession['role'], readonly ManagementArea[]> = {
  root: ['resumen','catalogo','mesas','configuracion','equipo'],
  admin: ['resumen','catalogo','mesas','comandas','caja','configuracion','equipo'],
  waiter: ['resumen','mesas','comandas','caja','equipo'],
  kitchen: ['resumen','comandas','equipo'],
};

export function ManagementApp({
  tablesGateway,
  tableChangeGateway,
  catalogGateway,
  catalogManagementGateway,
  operationsGateway,
  staffGateway,
  staffDirectoryGateway,
  staffRevocationGateway,
  financeGateway,
  ownershipGateway,
  staffRole,
  onSignOut,
}: {
  tablesGateway?: AdminTablesGateway;
  tableChangeGateway?: TableChangeQueueGateway;
  catalogGateway?: AdminCatalogGateway;
  catalogManagementGateway?:M3CatalogGateway;
  operationsGateway?: OrderOperationsGateway;
  staffGateway?: StaffManagementGateway;
  staffDirectoryGateway?: StaffDirectoryGateway;
  staffRevocationGateway?: StaffRevocationGateway;
  financeGateway?: M3AuthenticatedManagementGateway;
  ownershipGateway?: OwnershipGovernanceGateway;
  staffRole?: StaffSession['role'];
  onSignOut?: () => void;
}) {
  const [area, setArea] = useState<ManagementArea>(() => parseManagementArea(window.location.hash));
  const [financeAllowed,setFinanceAllowed]=useState(false);
  const [commsAllowed,setCommsAllowed]=useState(false);
  const [canWriteAdmin,setCanWriteAdmin]=useState(false);
  const [canRevokeStaff,setCanRevokeStaff]=useState(false);
  const [ownershipRevision,setOwnershipRevision]=useState(0);
  // Effective permissions come from a signed PG17 read, never the JWT role.
  // Refresh on navigation, foreground and explicit governance decisions.
  useEffect(()=>{
   let active=true,revision=0;
   const refresh=()=>{
    const current=++revision;
    setCanWriteAdmin(false);
    setCanRevokeStaff(false);
    if(area==='equipo'&&staffRevocationGateway&&ownershipGateway){
     void ownershipGateway.read().then(page=>{
      if(active&&current===revision)setCanRevokeStaff(page.role==='admin'&&page.isOwner===true);
     }).catch(()=>{if(active&&current===revision)setCanRevokeStaff(false);});
     return;
    }
    if(area==='configuracion'&&financeGateway){
     // M5 can be installed separately from M3; its own signed SQL read
     // returns the effective ADMIN writer without relying on table RPCs.
     void financeGateway.readCommunications()
      .then(page=>{if(active&&current===revision)
       setCanWriteAdmin(page.permissions?.manage===true);})
      .catch(()=>{if(active&&current===revision)setCanWriteAdmin(false);});
     return;
    }
    // Catalog's own signed SQL read carries its independent manage flag.
    // It does not require the optional M3 tables composition.
   };
   refresh();
   const visible=()=>{if(document.visibilityState==='visible')refresh();};
   window.addEventListener('focus',refresh);
   document.addEventListener('visibilitychange',visible);
   return()=>{active=false;revision++;window.removeEventListener('focus',refresh);
    document.removeEventListener('visibilitychange',visible);};
  },[financeGateway,area,ownershipRevision,ownershipGateway,staffRevocationGateway]);
  useEffect(()=>{
   let active=true;
   setFinanceAllowed(false);
   if(financeGateway)void financeGateway.readFinancialDashboard({period:'today'})
     .then(()=>{if(active)setFinanceAllowed(true);})
     .catch(()=>{if(active)setFinanceAllowed(false);});
   return()=>{active=false;};
  },[financeGateway]);
  useEffect(()=>{
   let active=true;setCommsAllowed(false);
   if(financeGateway)void financeGateway.readCommunications()
     .then(()=>{if(active)setCommsAllowed(true);})
     .catch(()=>{if(active)setCommsAllowed(false);});
   return()=>{active=false;};
  },[financeGateway]);
  const contentRef = useRef<HTMLElement>(null);
  const focusAfterNavigation = useRef(false);
  const hasReadProjection = Boolean(tablesGateway || catalogGateway || catalogManagementGateway || staffDirectoryGateway);
  const hasOperationalChannel = Boolean(operationsGateway);
  const visibleSections = sections.filter(({id}) => {
    if (staffRole && !areasByRole[staffRole].includes(id)) return false;
    if (id === 'configuracion') return financeAllowed || commsAllowed;
    if (!staffRole) return true;
    if (id === 'catalogo') return Boolean(catalogManagementGateway);
    if (id === 'mesas') return Boolean(tablesGateway || tableChangeGateway);
    if (id === 'equipo') return Boolean(ownershipGateway || staffGateway || staffDirectoryGateway);
    return true;
  });
  const activeSection = (staffRole ? visibleSections : sections).find((section) => section.id === area) ?? sections[0];
  const activeArea = activeSection.id;

  useEffect(() => {
    const syncFromLocation = () => {
      focusAfterNavigation.current = true;
      setArea(parseManagementArea(window.location.hash));
      window.scrollTo({top: 0, behavior: 'auto'});
    };
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, []);

  useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    const frame = window.requestAnimationFrame(() => contentRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [area]);

  const selectArea = (nextArea: ManagementArea) => {
    const nextHash = toManagementHash(nextArea);
    if (window.location.hash !== nextHash) window.history.pushState(null, '', nextHash);
    focusAfterNavigation.current = true;
    setArea(nextArea);
    window.scrollTo({top: 0, behavior: 'auto'});
  };

  const activeView = activeArea === 'resumen' ? <SummaryView/>
    : activeArea === 'catalogo' ? <CatalogView gateway={catalogGateway} managementGateway={catalogManagementGateway} operationsGateway={operationsGateway}/>
    : activeArea === 'mesas' ? <TablesView gateway={tablesGateway} tableChangeGateway={tableChangeGateway}/>
    : activeArea === 'comandas' ? <OrdersView gateway={operationsGateway}/>
    : activeArea === 'caja' ? <CashView gateway={operationsGateway}/>
    : activeArea === 'configuracion' ? <ConfigurationView gateway={financeGateway??null}
        financeAllowed={financeAllowed} commsAllowed={commsAllowed} canWriteAdmin={canWriteAdmin}/>
    : <TeamView gateway={staffGateway} directoryGateway={staffDirectoryGateway}
        ownershipGateway={ownershipGateway} staffRole={staffRole}
        revocationGateway={canRevokeStaff ? staffRevocationGateway : undefined}
        onOwnershipChanged={()=>setOwnershipRevision(v=>v+1)}/>;

  return (
    <div className="management-shell">
      <header className="management-header">
        <button className="brand-lockup brand-lockup--button" type="button" aria-label="Ir al resumen" onClick={() => selectArea('resumen')}>
          <img src={`${import.meta.env.BASE_URL}sabora-logo.svg`} alt="Sabora by Allaiso"/>
          <span className="brand-lockup__copy"><span>Gestión</span><small>Un restaurante · Una instalación</small></span>
        </button>
        <div className="header-status">
          <span className="status-dot" aria-hidden="true"/>
          <span>{hasOperationalChannel ? 'Canal de cocina y sala conectado'
            : hasReadProjection ? 'Proyecciones en solo lectura' : 'Sin acceso a datos'}</span>
          <strong>{hasOperationalChannel ? 'OPERACIÓN RESTRINGIDA'
            : hasReadProjection ? 'LECTURA PARCIAL' : 'NO OPERATIVA'}</strong>
        </div>
        {onSignOut && <button type="button" className="button" onClick={onSignOut}>Cerrar sesión</button>}
      </header>

      <div className="management-layout">
        <aside className="management-sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">Espacio de trabajo</span>
            <strong>Administración</strong>
          </div>
          <nav className="management-nav" aria-label="Áreas de gestión">
            {visibleSections.map((section) => (
              <a
                key={section.id}
                className={activeArea === section.id ? 'management-tab management-tab--active' : 'management-tab'}
                aria-current={activeArea === section.id ? 'page' : undefined}
                href={toManagementHash(section.id)}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  selectArea(section.id);
                }}
              >
                <span className="management-tab__icon"><Icon name={section.icon} size={20}/></span>
                <span><strong>{section.label}</strong><small>{section.detail}</small></span>
                <Icon name="chevron" size={17}/>
              </a>
            ))}
          </nav>
          <div className="sidebar-security">
            <Icon name="lock" size={19}/>
            <p><strong>{hasOperationalChannel ? 'Canal operativo limitado por rol.' : 'Acceso administrativo no habilitado.'}</strong>
              <span>{hasOperationalChannel
                ? 'Solo preparación, aviso de recogida e historial autorizados.'
                : 'Las acciones requieren sesión, permisos y contratos backend.'}</span></p>
          </div>
        </aside>

        <main className="management-main">
          <span className="visually-hidden" aria-live="polite">Área activa: {activeSection.label}</span>
          <section
            aria-label={`Área ${activeSection.label}`}
            className="management-detail"
            ref={contentRef}
            tabIndex={-1}
          >
            {activeView}
          </section>
        </main>
      </div>

      <footer className="management-footer">
        <span>SABORA · Una experiencia CartaViva</span>
        <span>{hasOperationalChannel
          ? 'Canal restringido · Entrega y cancelación bloqueadas'
          : 'Modo de diseño seguro · Sin operaciones conectadas'}</span>
      </footer>
    </div>
  );
}

// An authenticated host must explicitly mount this application after verifying
// staff identity. The default preview never reads browser credentials.
let managementRoot: ReturnType<typeof createRoot> | null = null;
let managementElement: HTMLElement | null = null;
const managementSessionFence = createManagementSessionFence();
const distributedManagement = import.meta.env.VITE_SABORA_OPERATIONAL_PWA === '1';
let managementRenderGeneration = 0;
let staffLogin = {
  message: 'Comprobando la sesión de personal.',
  action: undefined as (() => void) | undefined,
  label: 'Entrar con passkey',
};

function renderManagement(
  element: HTMLElement,
  gateway?: OrderOperationsGateway,
  tableChangeGateway?: TableChangeQueueGateway,
  managementGateway?:M3AuthenticatedManagementGateway,
  ownershipGateway?:OwnershipGovernanceGateway,
  onSignOut?:()=>void,
  staffRole?:StaffSession['role'],
  staffDirectoryGateway?:StaffDirectoryGateway,
  staffRevocationGateway?:StaffRevocationGateway,
) {
  if (managementRoot && managementElement !== element) {
    throw Error('management_root_already_mounted');
  }
  if (!managementRoot) {
    managementRoot = createRoot(element);
    managementElement = element;
  }
  // Force a new component tree on every identity transition: no previous
  // employee's board, history, incident draft or SSE state may survive.
  const key = ++managementRenderGeneration;
  if (distributedManagement && !gateway) {
    flushSync(() => managementRoot!.render(
      <main className="management-shell">
        <section className="management-detail" aria-labelledby="management-session-required">
          <h1 id="management-session-required">Acceso a Sabora Gestión</h1>
          <p role="status">{staffLogin.message}</p>
          <button type="button" className="button button--primary" disabled={!staffLogin.action}
            onClick={staffLogin.action}>{staffLogin.label}</button>
        </section>
      </main>,
    ));
    return;
  }
  flushSync(() => managementRoot!.render(
    <React.StrictMode><ManagementApp key={key} operationsGateway={gateway}
      tableChangeGateway={tableChangeGateway} tablesGateway={managementGateway}
      catalogManagementGateway={managementGateway} financeGateway={managementGateway}
      ownershipGateway={ownershipGateway} staffRole={staffRole} onSignOut={onSignOut}
      staffDirectoryGateway={staffDirectoryGateway} staffRevocationGateway={staffRevocationGateway}/></React.StrictMode>,
  ));
}

export function mountAuthenticatedManagementApp({
  element,
  getAccessToken,
  cookieSession,
  fetchImpl,
  reconnectDelayMs,
  enableTableChangeQueue = false,
  enableM3Management = false,
  enableWaiterCalls = false,
  enableOwnershipGovernance = false,
  enableStaffDirectory = false,
  enableStaffRevocation = false,
  onSignOut,
  staffRole,
}: StaffGatewayAuth & {
  element: HTMLElement;
  fetchImpl?: typeof fetch;
  reconnectDelayMs?: number;
  onSignOut?: () => void;
  staffRole?: StaffSession['role'];
  /** Opt-in only after the server's six isolated SQL logins pass preflight. */
  enableTableChangeQueue?: boolean;
  /** Opt-in only after both M3 SQL capability preflights succeed. */
  enableM3Management?:boolean;
  /** Opt-in only after isolated ownership runtime/SQL preflight succeeds. */
  enableOwnershipGovernance?:boolean;
  enableStaffDirectory?:boolean;
  enableStaffRevocation?:boolean;
  /** Only after waiter-call SQL identity preflight succeeds. */
  enableWaiterCalls?:boolean;
}) {
  if (!(element instanceof HTMLElement)) {
    throw Error('invalid_management_bootstrap');
  }
  const auth = cookieSession ? {cookieSession} : {getAccessToken};
  const operationsGateway = createAuthenticatedOrderOperationsGateway({
    ...auth, fetchImpl, reconnectDelayMs, enableWaiterCalls,
  });
  const m3Gateway=enableM3Management?createM3AuthenticatedManagementGateway({...auth,fetchImpl}):undefined;
  const ownershipGateway=enableOwnershipGovernance?createAuthenticatedOwnershipGovernanceGateway({...auth,fetchImpl}):undefined;
  const directoryRequests=new AbortController();
  const sendStaff: typeof fetch | undefined=cookieSession&&fetchImpl
    ? async (path,options)=>{
      directoryRequests.signal.throwIfAborted();
      const response=await fetchImpl(path,{...options,signal:directoryRequests.signal});
      directoryRequests.signal.throwIfAborted();
      return response;
    }
    : undefined;
  const staffDirectoryGateway=enableStaffDirectory&&sendStaff
    ? createStaffDirectoryGateway({send:sendStaff}) : undefined;
  const staffRevocationGateway=enableStaffRevocation&&sendStaff
    ? createStaffManagementGateway({send:sendStaff}) : undefined;
  if (managementRoot && managementElement !== element) {
    operationsGateway.revoke();
    m3Gateway?.revoke();
    ownershipGateway?.revoke();
    directoryRequests.abort();
    throw Error('management_root_already_mounted');
  }
  // All capability gateways belong to one verified employee session.
  // Replacement revokes each of them, even when the old disposer is late.
  const sessionChannel={revoke(){
    operationsGateway.revoke();
    m3Gateway?.revoke();
    ownershipGateway?.revoke();
    directoryRequests.abort();
  }};
  const disposeSession = managementSessionFence.replace(sessionChannel);
  // The default preview and authenticated operation mount keep the queue
  // disconnected; a verified B3 host must explicitly enable its gateway.
  const queueGateway: TableChangeQueueGateway | undefined = enableTableChangeQueue
    ? {listPendingTableChanges: operationsGateway.listPendingTableChanges,
       decideTableChange: operationsGateway.decideTableChange}
    : undefined;
  renderManagement(element, operationsGateway, queueGateway,m3Gateway,ownershipGateway,onSignOut,staffRole,
    staffDirectoryGateway,staffRevocationGateway);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const current = managementSessionFence.isCurrent(sessionChannel);
    disposeSession();
    if (current && managementElement === element) renderManagement(element);
  };
}

function startStaffLogin(element: HTMLElement) {
  let dispose: (() => void) | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let check: (() => void) | undefined;
  const screen = (message: string, action?: () => void, label = 'Entrar con passkey') => {
    staffLogin = {message, action, label};
    renderManagement(element);
  };
  const offerPasskey = (message = 'Usa la passkey de tu cuenta de personal.') => {
    if (!supportsStaffPasskey()) {
      screen('Abre Sabora Gestión en un navegador compatible con passkeys.');
      return;
    }
    screen(message, () => {
      screen('Completa la verificación en tu dispositivo.');
      void signInWithStaffPasskey().then(connect).catch(error => {
        const denied = error instanceof StaffAuthenticationError && [401, 403].includes(error.status);
        offerPasskey(denied ? 'Esta passkey no tiene acceso activo a Sabora Gestión.'
          : error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'La verificación se canceló o no se encontró la passkey.'
            : 'No se pudo verificar la passkey. Inténtalo de nuevo.');
      });
    });
  };
  const disconnect = () => {
    clearTimeout(expiry);
    if (check) window.removeEventListener('focus', check);
    check = undefined;
    dispose?.();
    dispose = undefined;
  };
  const connect = (session: StaffSession) => {
    const expire = () => {
      if (dispose !== current) return;
      disconnect();
      offerPasskey('Tu sesión ha terminado. Vuelve a entrar con tu passkey.');
    };
    const signOut = () => {
      disconnect();
      screen('Cerrando la sesión.');
      void endStaffSession(session).then(() => offerPasskey('Sesión cerrada.')).catch(error => {
        if (error instanceof StaffAuthenticationError && error.status === 409) {
          offerPasskey('La sesión cambió en otra pestaña.');
          return;
        }
        screen('No se pudo confirmar el cierre de sesión.', signOut, 'Reintentar cierre de sesión');
      });
    };
    const current = mountAuthenticatedManagementApp({element, cookieSession: true,
      staffRole: session.role, fetchImpl: createStaffSessionFetch(session, expire), onSignOut: signOut,
      enableTableChangeQueue: session.features.tableChange && ['admin', 'waiter'].includes(session.role),
      enableWaiterCalls: session.features.waiterCalls && session.role === 'waiter',
      enableM3Management: session.features.management && session.role !== 'kitchen',
      enableOwnershipGovernance: session.features.ownership && ['root', 'admin'].includes(session.role),
      enableStaffDirectory: session.features.staffDirectory === true && session.role !== 'root',
      enableStaffRevocation: session.features.staffRevocation === true && session.role === 'admin'
    });
    dispose = current;
    expiry = setTimeout(expire, session.expiresAt * 1000 - Date.now());
    check = () => {
      void readStaffSession().then(active => {
        if (active.sessionId !== session.sessionId || active.role !== session.role) expire();
      }).catch(expire);
    };
    window.addEventListener('focus', check);
  };
  const restore = () => {
    screen('Comprobando la sesión de personal.');
    void readStaffSession().then(connect).catch(error => {
      if (error instanceof StaffAuthenticationError && [401, 403].includes(error.status)) {
        offerPasskey();
        return;
      }
      screen('El acceso de personal no está disponible en este momento.', restore, 'Volver a comprobar');
    });
  };
  restore();
}

if (typeof document !== 'undefined') {
  const element = document.getElementById('root');
  if (element && distributedManagement) startStaffLogin(element);
  else if (element) renderManagement(element);
}
registerManagementServiceWorker();
