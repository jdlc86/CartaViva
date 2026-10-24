import {useEffect, useMemo, useRef, useState} from 'react';
import {Icon} from '../components/Icon';
import {
  ConnectionNotice,
  DefinitionRow,
  EmptyState,
  ErrorState,
  LoadingState,
  LockedButton,
  PageHeader,
  SnapshotToolbar,
  StatusBadge,
} from '../components/Primitives';
import {createLatestReadTaskController, type LatestReadTaskController} from '../latest-read-task';
import {
  loadAdminTablesPage,
  mergeAdminTables,
  TABLE_PAGE_SIZE,
  type AdminTable,
  type AdminTablesGateway,
  type TableOrderingState,
} from '../tables-read-model';

type ReadPhase = 'disconnected' | 'loading' | 'ready' | 'error';
type BadgeTone = 'neutral' | 'brand' | 'warning' | 'danger';

const tableStates: ReadonlyArray<{
  id: TableOrderingState;
  label: string;
  tone: BadgeTone;
  description: string;
}> = [
  {id: 'open', label: 'ABIERTA', tone: 'brand', description: 'Admite nuevas autorizaciones y pedidos si el resto del contexto es válido.'},
  {id: 'paused', label: 'PAUSADA', tone: 'warning', description: 'Bloquea temporalmente nuevos pedidos sin cerrar la ocupación.'},
  {id: 'closed', label: 'CERRADA', tone: 'neutral', description: 'No admite nuevas autorizaciones ni pedidos.'},
];

function stateMeta(state: TableOrderingState) {
  return tableStates.find((item) => item.id === state) ?? tableStates[2];
}

export function TablesView({gateway}: {gateway?: AdminTablesGateway}) {
  const [phase, setPhase] = useState<ReadPhase>(gateway ? 'loading' : 'disconnected');
  const [tables, setTables] = useState<readonly AdminTable[]>([]);
  const [nextAfterNumber, setNextAfterNumber] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const readControllerRef = useRef<LatestReadTaskController | null>(null);
  if (readControllerRef.current === null) readControllerRef.current = createLatestReadTaskController();
  const readController = readControllerRef.current;

  useEffect(() => {
    const task = readController.start();
    setLoadingMore(false);
    setRefreshing(false);
    setRefreshError(false);

    if (!gateway) {
      setPhase('disconnected');
      setTables([]);
      setNextAfterNumber(null);
      setSelectedId(null);
      setFilter('');
      setPaginationError(false);
      task.finish();
      return () => readController.cancel();
    }

    setPhase('loading');
    setTables([]);
    setNextAfterNumber(null);
    setSelectedId(null);
    setPaginationError(false);

    void loadAdminTablesPage(gateway, {afterNumber: 0, limit: TABLE_PAGE_SIZE, signal: task.signal})
      .then((page) => {
        if (!task.isCurrent()) return;
        setTables(page.items);
        setNextAfterNumber(page.nextAfterNumber);
        setSelectedId(page.items[0]?.id ?? null);
        setPhase('ready');
      })
      .catch(() => {
        if (!task.isCurrent()) return;
        setPhase('error');
      })
      .finally(() => {
        task.finish();
      });

    return () => readController.cancel();
  }, [gateway, readController, reloadVersion]);

  const selectedTable = tables.find((table) => table.id === selectedId) ?? null;
  const visibleTables = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('es');
    if (!query) return tables;
    return tables.filter((table) => {
      const state = stateMeta(table.orderingState).label.toLocaleLowerCase('es');
      return String(table.number).includes(query) ||
        (table.description?.toLocaleLowerCase('es').includes(query) ?? false) || state.includes(query);
    });
  }, [filter, tables]);

  const loadMore = async () => {
    if (!gateway || nextAfterNumber === null || loadingMore || refreshing) return;
    const task = readController.start();
    setLoadingMore(true);
    setPaginationError(false);
    try {
      const page = await loadAdminTablesPage(gateway, {
        afterNumber: nextAfterNumber,
        limit: TABLE_PAGE_SIZE,
        signal: task.signal,
      });
      if (!task.isCurrent()) return;
      setTables((current) => mergeAdminTables(current, page.items));
      setNextAfterNumber(page.nextAfterNumber);
    } catch {
      if (task.isCurrent()) setPaginationError(true);
    } finally {
      const isCurrent = task.isCurrent();
      task.finish();
      if (isCurrent) setLoadingMore(false);
    }
  };

  const refreshTables = async () => {
    if (!gateway || phase !== 'ready' || refreshing) return;
    const task = readController.start();
    setLoadingMore(false);
    setPaginationError(false);
    setRefreshing(true);
    setRefreshError(false);

    try {
      const page = await loadAdminTablesPage(gateway, {
        afterNumber: 0,
        limit: TABLE_PAGE_SIZE,
        signal: task.signal,
      });
      if (!task.isCurrent()) return;
      setTables(page.items);
      setNextAfterNumber(page.nextAfterNumber);
      setSelectedId((current) => page.items.some((table) => table.id === current) ? current : page.items[0]?.id ?? null);
    } catch {
      if (task.isCurrent()) setRefreshError(true);
    } finally {
      const isCurrent = task.isCurrent();
      task.finish();
      if (isCurrent) setRefreshing(false);
    }
  };

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Mesas y QR"
        title="Control de mesas"
        description="Consulta el inventario autorizado y su estado operativo. La gestión de estados y credenciales sigue separada y bloqueada."
        actions={<LockedButton icon="plus">Crear mesa</LockedButton>}
      />

      {gateway ? (
        <ConnectionNotice title="Proyección de mesas en modo consulta." tone="brand">
          La carga ocurre al abrir esta vista o al solicitarla de nuevo; no existe sondeo automático ni acceso a secretos QR.
        </ConnectionNotice>
      ) : (
        <ConnectionNotice>
          No se cargarán mesas ni se emitirán credenciales hasta disponer de identidad verificada y composición backend autorizada.
        </ConnectionNotice>
      )}

      {phase === 'ready' ? (
        <SnapshotToolbar
          subject="mesas"
          refreshing={refreshing}
          refreshFailed={refreshError}
          onRefresh={() => void refreshTables()}
        />
      ) : null}

      <div className="workbench">
        <section className="workbench__master panel" aria-labelledby="table-list-title" aria-busy={phase === 'loading' || refreshing}>
          <div className="panel-heading panel-heading--stacked">
            <div className="table-list-heading">
              <div>
                <span className="eyebrow">Inventario</span>
                <h2 id="table-list-title">Mesas</h2>
              </div>
              {phase === 'ready' ? <StatusBadge>{tables.length} cargadas</StatusBadge> : null}
            </div>
            <label className={phase === 'ready' && tables.length > 0 ? 'search-field' : 'search-field search-field--disabled'}>
              <Icon name="search" size={18}/>
              <span className="visually-hidden">Filtrar mesas cargadas</span>
              <input
                disabled={phase !== 'ready' || tables.length === 0}
                type="search"
                value={filter}
                placeholder="Número, ubicación o estado"
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
          </div>

          <div className="state-legend" aria-label="Estados operativos de mesa">
            {tableStates.map((state) => <StatusBadge key={state.id} tone={state.tone}>{state.label}</StatusBadge>)}
          </div>

          {phase === 'disconnected' ? (
            <EmptyState
              icon="tables"
              title="Sin mesas conectadas"
              description="La aplicación no incluye un transporte ni una sesión administrativa por defecto."
            />
          ) : null}

          {phase === 'loading' ? (
            <LoadingState title="Cargando mesas" description="Solicitando únicamente la proyección administrativa autorizada."/>
          ) : null}

          {phase === 'error' ? (
            <ErrorState
              title="No se pudieron cargar las mesas"
              description="La lectura falló o devolvió un contrato no válido. No se conserva una respuesta parcial."
              onRetry={() => setReloadVersion((value) => value + 1)}
            />
          ) : null}

          {phase === 'ready' && tables.length === 0 ? (
            <EmptyState
              icon="tables"
              title="No hay mesas disponibles"
              description="La proyección autorizada respondió correctamente y no contiene registros."
            />
          ) : null}

          {phase === 'ready' && tables.length > 0 && visibleTables.length === 0 ? (
            <EmptyState
              compact
              icon="search"
              title="Sin coincidencias"
              description="Prueba con otro número, ubicación o estado entre las mesas ya cargadas."
            />
          ) : null}

          {phase === 'ready' && visibleTables.length > 0 ? (
            <ul className="table-list" aria-label="Mesas cargadas">
              {visibleTables.map((table) => {
                const meta = stateMeta(table.orderingState);
                return (
                  <li key={table.id}>
                    <button
                      className={selectedId === table.id ? 'table-list-item table-list-item--active' : 'table-list-item'}
                      type="button"
                      aria-pressed={selectedId === table.id}
                      onClick={() => setSelectedId(table.id)}
                    >
                      <span className="table-list-item__number">{table.number}</span>
                      <span className="table-list-item__copy">
                        <strong>Mesa {table.number}</strong>
                        <small>{table.description || `${table.capacity} plazas · Sin descripción`}</small>
                      </span>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {phase === 'ready' && nextAfterNumber !== null ? (
            <div className="table-pagination">
              {paginationError ? <p role="alert">No se pudo cargar la página siguiente. Las mesas visibles se conservan.</p> : null}
              <button className="button" type="button" disabled={loadingMore || refreshing} onClick={() => void loadMore()}>
                {loadingMore ? 'Cargando…' : paginationError ? 'Reintentar más mesas' : 'Cargar más mesas'}
              </button>
            </div>
          ) : null}
        </section>

        <section className="workbench__detail panel" aria-labelledby="table-detail-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Ficha de mesa</span>
              <h2 id="table-detail-title">{selectedTable ? `Mesa ${selectedTable.number}` : 'Selecciona una mesa'}</h2>
            </div>
            {selectedTable ? (
              <StatusBadge tone={stateMeta(selectedTable.orderingState).tone}>{stateMeta(selectedTable.orderingState).label}</StatusBadge>
            ) : <StatusBadge>Sin selección</StatusBadge>}
          </div>

          <dl className="definition-grid">
            <DefinitionRow label="Número" value={selectedTable?.number}/>
            <DefinitionRow label="Capacidad" value={selectedTable ? `${selectedTable.capacity} plazas` : undefined}/>
            <DefinitionRow label="Descripción" value={selectedTable?.description || undefined}/>
            <DefinitionRow label="Estado operativo" value={selectedTable ? stateMeta(selectedTable.orderingState).label : 'Sin datos'}/>
          </dl>

          <div className="detail-block">
            <div className="detail-block__heading">
              <div>
                <h3>Estado operativo</h3>
                <p>{selectedTable ? stateMeta(selectedTable.orderingState).description : 'Selecciona una mesa para consultar el estado persistido.'} Los cambios requieren un contrato de escritura independiente.</p>
              </div>
            </div>
            <div className="state-control" aria-label="Cambiar estado de la mesa">
              {tableStates.map((state) => (
                <button
                  className={selectedTable?.orderingState === state.id ? 'state-control__current' : undefined}
                  type="button"
                  disabled
                  key={state.id}
                >
                  {state.label}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-block qr-block">
            <div className="detail-block__heading">
              <div>
                <h3>Acceso QR</h3>
                <p>El QR identifica la mesa, no a una persona ni su presencia física.</p>
              </div>
              <StatusBadge tone="warning">No incluido</StatusBadge>
            </div>
            <div className="qr-layout">
              <div className="qr-placeholder" aria-label="La proyección no incluye ningún código QR">
                <Icon name="lock" size={28}/>
                <span>Dato protegido</span>
              </div>
              <div className="qr-copy">
                <strong>La lectura no expone secretos QR</strong>
                <p>La emisión, rotación, revocación e impresión necesitan contratos de escritura y entrega segura que todavía no están habilitados.</p>
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
              <p>Esta política no forma parte de la proyección de mesas v1 y no se infiere. Su edición permanece bloqueada.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
