import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {AdminCatalogGateway} from './catalog-read-model';
import type {OrderOperationsGateway} from './order-operations-gateway.js';
import {Icon, type IconName} from './components/Icon';
import {parseManagementArea, toManagementHash, type ManagementArea} from './navigation-model';
import type {AdminTablesGateway} from './tables-read-model';
import {CatalogView} from './views/CatalogView';
import {OrdersView} from './views/OrdersView';
import {SummaryView} from './views/SummaryView';
import {TablesView} from './views/TablesView';
import {TeamView} from './views/TeamView';
import './style.css';

const sections: ReadonlyArray<{id: ManagementArea; label: string; detail: string; icon: IconName}> = [
  {id:'resumen', label: 'Resumen', detail: 'Estado general', icon: 'overview'},
  {id:'catalogo', label: 'Catálogo', detail: 'Carta e imágenes', icon: 'catalog'},
  {id:'mesas', label: 'Mesas y QR', detail: 'Accesos de mesa', icon: 'tables'},
  {id:'comandas', label: 'Comandas', detail: 'Cocina y sala', icon: 'orders'},
  {id:'equipo', label: 'Equipo', detail: 'Roles y titularidad', icon: 'team'},
];

export function ManagementApp({
  tablesGateway,
  catalogGateway,
  operationsGateway,
}: {
  tablesGateway?: AdminTablesGateway;
  catalogGateway?: AdminCatalogGateway;
  operationsGateway?: OrderOperationsGateway;
}) {
  const [area, setArea] = useState<ManagementArea>(() => parseManagementArea(window.location.hash));
  const contentRef = useRef<HTMLElement>(null);
  const focusAfterNavigation = useRef(false);
  const activeSection = sections.find((section) => section.id === area) ?? sections[0];

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

  const activeView = area === 'resumen' ? <SummaryView/>
    : area === 'catalogo' ? <CatalogView gateway={catalogGateway}/>
    : area === 'mesas' ? <TablesView gateway={tablesGateway}/>
    : area === 'comandas' ? <OrdersView gateway={operationsGateway}/>
    : <TeamView/>;

  return (
    <div className="management-shell">
      <header className="management-header">
        <button className="brand-lockup brand-lockup--button" type="button" aria-label="Ir al resumen" onClick={() => selectArea('resumen')}>
          <img src="/sabora-logo.svg" alt="Sabora by Allaiso"/>
          <span className="brand-lockup__copy"><span>Gestión</span><small>Un restaurante · Una instalación</small></span>
        </button>
        <div className="header-status">
          <span className="status-dot" aria-hidden="true"/>
          <span>{tablesGateway || catalogGateway ? 'Proyecciones en solo lectura' : 'Sin acceso a datos'}</span>
          <strong>{tablesGateway || catalogGateway ? 'LECTURA PARCIAL' : 'NO OPERATIVA'}</strong>
        </div>
      </header>

      <div className="management-layout">
        <aside className="management-sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">Espacio de trabajo</span>
            <strong>Administración</strong>
          </div>
          <nav className="management-nav" aria-label="Áreas de gestión">
            {sections.map((section) => (
              <a
                key={section.id}
                className={area === section.id ? 'management-tab management-tab--active' : 'management-tab'}
                aria-current={area === section.id ? 'page' : undefined}
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
            <p><strong>Acceso administrativo no habilitado.</strong><span>Las acciones requieren sesión, permisos y contratos backend.</span></p>
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
        <span>Modo de diseño seguro · Sin operaciones conectadas</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ManagementApp/></React.StrictMode>,
);
