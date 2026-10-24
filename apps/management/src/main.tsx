import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Icon, type IconName} from './components/Icon';
import {CatalogView} from './views/CatalogView';
import {OrdersView} from './views/OrdersView';
import {SummaryView} from './views/SummaryView';
import {TablesView} from './views/TablesView';
import {TeamView} from './views/TeamView';
import './style.css';

type Area = 'resumen' | 'catalogo' | 'mesas' | 'comandas' | 'equipo';

const sections: ReadonlyArray<{id: Area; label: string; detail: string; icon: IconName}> = [
  {id:'resumen', label: 'Resumen', detail: 'Estado general', icon: 'overview'},
  {id:'catalogo', label: 'Catálogo', detail: 'Carta e imágenes', icon: 'catalog'},
  {id:'mesas', label: 'Mesas y QR', detail: 'Accesos de mesa', icon: 'tables'},
  {id:'comandas', label: 'Comandas', detail: 'Cocina y sala', icon: 'orders'},
  {id:'equipo', label: 'Equipo', detail: 'Roles y titularidad', icon: 'team'},
];

const views: Record<Area, React.ReactNode> = {
  resumen: <SummaryView/>,
  catalogo: <CatalogView/>,
  mesas: <TablesView/>,
  comandas: <OrdersView/>,
  equipo: <TeamView/>,
};

function App() {
  const [area, setArea] = useState<Area>('resumen');
  const activeSection = sections.find((section) => section.id === area) ?? sections[0];
  const selectArea = (nextArea: Area) => {
    setArea(nextArea);
    window.scrollTo({top: 0, behavior: 'auto'});
  };

  return (
    <div className="management-shell">
      <header className="management-header">
        <div className="brand-lockup">
          <img src="/sabora-logo.svg" alt="Sabora by Allaiso"/>
          <div><span>Gestión</span><small>Un restaurante · Una instalación</small></div>
        </div>
        <div className="header-status">
          <span className="status-dot" aria-hidden="true"/>
          <span>Sin acceso a datos</span>
          <strong>NO OPERATIVA</strong>
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
              <button
                type="button"
                key={section.id}
                className={area === section.id ? 'management-tab management-tab--active' : 'management-tab'}
                aria-current={area === section.id ? 'page' : undefined}
                onClick={() => selectArea(section.id)}
              >
                <span className="management-tab__icon"><Icon name={section.icon} size={20}/></span>
                <span><strong>{section.label}</strong><small>{section.detail}</small></span>
                <Icon name="chevron" size={17}/>
              </button>
            ))}
          </nav>
          <div className="sidebar-security">
            <Icon name="lock" size={19}/>
            <p><strong>Acceso administrativo no habilitado.</strong><span>Las acciones requieren sesión, permisos y contratos backend.</span></p>
          </div>
        </aside>

        <main className="management-main">
          <span className="visually-hidden" aria-live="polite">Área activa: {activeSection.label}</span>
          <section className="management-detail">
            {views[area]}
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
  <React.StrictMode><App/></React.StrictMode>,
);
