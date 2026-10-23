import {Icon} from '../components/Icon';
import {ConnectionNotice, DefinitionRow, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';

const tableStates = ['EN_PREPARACION', 'LISTA', 'BLOQUEADA'] as const;

export function TablesView() {
  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Mesas y QR"
        title="Control de mesas"
        description="Ficha operativa, estado y ciclo de acceso QR en un espacio maestro-detalle."
        actions={<LockedButton icon="plus">Crear mesa</LockedButton>}
      />
      <ConnectionNotice>
        No se cargarán mesas ni se emitirán credenciales hasta disponer de identidad verificada y endpoints autorizados.
      </ConnectionNotice>

      <div className="workbench">
        <section className="workbench__master panel" aria-labelledby="table-list-title">
          <div className="panel-heading panel-heading--stacked">
            <div>
              <span className="eyebrow">Inventario</span>
              <h2 id="table-list-title">Mesas</h2>
            </div>
            <label className="search-field search-field--disabled">
              <Icon name="search" size={18}/>
              <span className="visually-hidden">Buscar mesa</span>
              <input type="search" placeholder="Buscar mesa" disabled/>
            </label>
          </div>
          <div className="state-legend" aria-label="Estados documentados de mesa">
            {tableStates.map((state) => <StatusBadge key={state}>{state}</StatusBadge>)}
          </div>
          <EmptyState
            icon="tables"
            title="Sin mesas conectadas"
            description="La lista se completará desde el registro autorizado del restaurante."
          />
        </section>

        <section className="workbench__detail panel" aria-labelledby="table-detail-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Ficha de mesa</span>
              <h2 id="table-detail-title">Selecciona una mesa</h2>
            </div>
            <StatusBadge>Sin selección</StatusBadge>
          </div>

          <dl className="definition-grid">
            <DefinitionRow label="Número"/>
            <DefinitionRow label="Capacidad"/>
            <DefinitionRow label="Descripción"/>
            <DefinitionRow label="Estado operativo" value="Sin datos"/>
          </dl>

          <div className="detail-block">
            <div className="detail-block__heading">
              <div>
                <h3>Estado operativo</h3>
                <p>Las mesas nuevas comienzan en EN_PREPARACION. Los cambios requieren confirmación del servidor.</p>
              </div>
            </div>
            <div className="state-control" aria-label="Cambiar estado de la mesa">
              {tableStates.map((state) => <button type="button" disabled key={state}>{state}</button>)}
            </div>
          </div>

          <div className="detail-block qr-block">
            <div className="detail-block__heading">
              <div>
                <h3>Acceso QR</h3>
                <p>El QR identifica la mesa, no a una persona ni su presencia física.</p>
              </div>
              <StatusBadge tone="warning">No emitido</StatusBadge>
            </div>
            <div className="qr-layout">
              <div className="qr-placeholder" aria-label="No hay ningún código QR operativo">
                <Icon name="lock" size={28}/>
                <span>Sin credencial</span>
              </div>
              <div className="qr-copy">
                <strong>No se muestra un QR de demostración</strong>
                <p>La emisión, rotación y revocación deberán producir una credencial real y auditable desde backend.</p>
              </div>
            </div>
            <div className="button-row">
              <LockedButton>Emitir QR</LockedButton>
              <LockedButton>Rotar QR</LockedButton>
              <LockedButton>Revocar QR</LockedButton>
              <LockedButton>Imprimir</LockedButton>
            </div>
          </div>

          <div className="policy-note">
            <Icon name="info" size={20}/>
            <div>
              <strong>Pago conforme se pide</strong>
              <p>La política se configura por mesa y no se activa por pertenecer a una zona. Su edición permanece bloqueada.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
