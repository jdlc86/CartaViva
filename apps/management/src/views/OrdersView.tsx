import {useState} from 'react';
import {Icon} from '../components/Icon';
import {ConnectionNotice, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';

type OrderWorkspace = 'kitchen' | 'floor' | 'reservations';

const workspaces: ReadonlyArray<{id: OrderWorkspace; label: string; description: string}> = [
  {id: 'kitchen', label: 'Cocina', description: 'Comandas por mesa y detalle contextual'},
  {id: 'floor', label: 'Sala', description: 'Avisos compartidos e historial común'},
  {id: 'reservations', label: 'Reservas', description: 'Solicitudes separadas de pedidos presenciales'},
];

export function OrdersView() {
  const [workspace, setWorkspace] = useState<OrderWorkspace>('kitchen');
  const active = workspaces.find((item) => item.id === workspace) ?? workspaces[0];

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Comandas"
        title="Cocina y sala"
        description="Seguimiento operativo sin confundir pedido lógico, revisión y comanda despachada."
        actions={<StatusBadge tone="warning">Canal de eventos sin conectar</StatusBadge>}
      />
      <ConnectionNotice>
        No se cargarán comandas ni se ejecutarán transiciones hasta disponer de sesión por rol, estados persistidos y eventos autorizados.
      </ConnectionNotice>

      <div className="module-tabs" role="group" aria-label="Espacios de comandas">
        {workspaces.map((item) => (
          <button
            aria-pressed={workspace === item.id}
            key={item.id}
            type="button"
            onClick={() => setWorkspace(item.id)}
          >
            <Icon name={item.id === 'kitchen' ? 'orders' : item.id === 'floor' ? 'tables' : 'clock'} size={18}/>
            {item.label}
          </button>
        ))}
      </div>

      <section className="orders-workspace panel" aria-labelledby="orders-workspace-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{active.label}</span>
            <h2 id="orders-workspace-title">{active.description}</h2>
          </div>
          <div className="button-row">
            <button className="filter-button" type="button" disabled>Filtrar</button>
            <button className="filter-button" type="button" disabled>Ordenar</button>
          </div>
        </div>

        <div className="order-summary-strip" aria-label="Resumen de comandas sin datos">
          <div><span>Pendientes</span><strong>—</strong></div>
          <div><span>En curso</span><strong>—</strong></div>
          <div><span>Incidencias</span><strong>—</strong></div>
        </div>

        <EmptyState
          icon="orders"
          title={`Sin datos de ${active.label.toLowerCase()}`}
          description="La vista permanecerá vacía hasta recibir una proyección autorizada; no se simulan comandas ni tiempos."
        />

        <div className="button-row button-row--end">
          <LockedButton icon="check">Cambiar estado</LockedButton>
          <LockedButton>Registrar incidencia</LockedButton>
        </div>
      </section>
    </div>
  );
}
