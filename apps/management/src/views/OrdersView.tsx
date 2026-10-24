import {useCallback, useEffect, useMemo, useState} from 'react';
import {Icon} from '../components/Icon';
import {ConnectionNotice, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';
import type {OrderOperationsGateway} from '../order-operations-gateway.js';
import {
  groupOrderBoard,
  nextOrderLineAction,
  ORDER_STATUS_LABELS,
  type OrderBoard,
  type OrderHistory,
  type OrderLineItem,
} from '../order-operations-model.js';

type OrderWorkspace = 'kitchen' | 'floor' | 'reservations';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const workspaces: ReadonlyArray<{id: OrderWorkspace; label: string; description: string}> = [
  {id: 'kitchen', label: 'Cocina', description: 'Comandas por mesa y detalle contextual'},
  {id: 'floor', label: 'Sala', description: 'Avisos durables de platos listos y recogidas'},
  {id: 'reservations', label: 'Reservas', description: 'Solicitudes separadas de pedidos presenciales'},
];

function tone(status: OrderLineItem['status']) {
  if (status === 'ready') return 'brand' as const;
  if (status === 'preparing') return 'warning' as const;
  return 'neutral' as const;
}

function visibleInWorkspace(line: OrderLineItem, workspace: OrderWorkspace) {
  if (workspace === 'floor') return line.status === 'ready' || line.status === 'picked_up';
  if (workspace === 'kitchen') return line.status !== 'picked_up';
  return false;
}

export function OrdersView({gateway = null}: {gateway?: OrderOperationsGateway | null}) {
  const [workspace, setWorkspace] = useState<OrderWorkspace>('kitchen');
  const [phase, setPhase] = useState<LoadState>(gateway ? 'loading' : 'idle');
  const [board, setBoard] = useState<OrderBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLines, setPendingLines] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<OrderHistory | null>(null);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const active = workspaces.find((item) => item.id === workspace) ?? workspaces[0];

  const load = useCallback(async () => {
    if (!gateway) return;
    setPhase('loading');
    setError(null);
    try {
      const result = await gateway.listBoard({limit: 100});
      setBoard(result);
      setPhase('ready');
      if (result.role === 'waiter') setWorkspace('floor');
    } catch {
      setBoard(null);
      setError('No se pudo recuperar el estado confirmado. Reintenta cuando la conexión esté disponible.');
      setPhase('error');
    }
  }, [gateway]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => board?.items.filter((line) => visibleInWorkspace(line, workspace)) ?? [],
    [board, workspace]);
  const orders = useMemo(() => groupOrderBoard(items), [items]);
  const counts = useMemo(() => ({
    pending: board?.items.filter((line) => line.status === 'confirmed').length ?? 0,
    preparing: board?.items.filter((line) => line.status === 'preparing').length ?? 0,
    ready: board?.items.filter((line) => line.status === 'ready').length ?? 0,
  }), [board]);

  const transition = async (line: OrderLineItem) => {
    if (!gateway || !board || pendingLines.has(line.lineId)) return;
    const action = nextOrderLineAction(board.role, line.status);
    if (!action) return;
    setPendingLines((current) => new Set(current).add(line.lineId));
    setError(null);
    try {
      await gateway.transitionLine({
        lineId: line.lineId,
        targetStatus: action.targetStatus,
        correlationId: `ui_${crypto.randomUUID().replaceAll('-', '_')}`,
      });
      await load();
    } catch {
      setError('La operación no se confirmó. El estado se recargará antes de permitir otro intento.');
      await load();
    } finally {
      setPendingLines((current) => {
        const next = new Set(current);
        next.delete(line.lineId);
        return next;
      });
    }
  };

  const showHistory = async (orderId: string) => {
    if (!gateway) return;
    setHistoryOrderId(orderId);
    setHistory(null);
    try { setHistory(await gateway.listHistory({orderId, limit: 100})); }
    catch { setError('No se pudo recuperar el historial de esta comanda.'); }
  };

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Comandas"
        title="Cocina y sala"
        description="Preparación y recogida por línea, con estado persistente e historial confirmado."
        actions={<StatusBadge tone={gateway ? 'brand' : 'warning'}>
          {gateway ? 'Canal operativo conectado' : 'Canal operativo sin conectar'}
        </StatusBadge>}
      />
      {!gateway ? (
        <ConnectionNotice>
          No se cargarán comandas ni se ejecutarán transiciones hasta disponer de sesión por rol, identidad SQL separada y montaje autorizado.
        </ConnectionNotice>
      ) : null}
      {error ? <div className="field-error field-error--box" role="alert"><Icon name="alert" size={18}/>{error}</div> : null}

      <div className="module-tabs" role="group" aria-label="Espacios de comandas">
        {workspaces.map((item) => (
          <button aria-pressed={workspace === item.id} key={item.id} type="button" onClick={() => setWorkspace(item.id)}>
            <Icon name={item.id === 'kitchen' ? 'orders' : item.id === 'floor' ? 'tables' : 'clock'} size={18}/>
            {item.label}
          </button>
        ))}
      </div>

      <section className="orders-workspace panel" aria-labelledby="orders-workspace-title" aria-busy={phase === 'loading'}>
        <div className="panel-heading">
          <div><span className="eyebrow">{active.label}</span><h2 id="orders-workspace-title">{active.description}</h2></div>
          <div className="button-row">
            <button className="filter-button" type="button" onClick={() => void load()} disabled={!gateway || phase === 'loading'}>
              {phase === 'loading' ? 'Actualizando…' : 'Actualizar estado'}
            </button>
          </div>
        </div>

        <div className="order-summary-strip" aria-label="Resumen de comandas">
          <div><span>Pendientes</span><strong>{gateway && phase !== 'loading' ? counts.pending : '—'}</strong></div>
          <div><span>En preparación</span><strong>{gateway && phase !== 'loading' ? counts.preparing : '—'}</strong></div>
          <div><span>Listas</span><strong>{gateway && phase !== 'loading' ? counts.ready : '—'}</strong></div>
        </div>

        {workspace === 'reservations' ? (
          <EmptyState icon="clock" title="Reservas fuera de este circuito" description="Las reservas no comparten estados ni operaciones con las comandas presenciales."/>
        ) : phase === 'loading' ? (
          <div className="orders-loading" role="status"><span aria-hidden="true"/><p>Recuperando el estado confirmado…</p></div>
        ) : phase === 'error' ? (
          <EmptyState icon="alert" title="Estado no disponible" description="No se muestran datos antiguos ni se habilitan acciones mientras la recuperación falla."/>
        ) : orders.length === 0 ? (
          <EmptyState icon="orders" title={`Sin datos de ${active.label.toLowerCase()}`}
            description={gateway ? 'No hay líneas autorizadas en este estado.' : 'La vista permanecerá vacía hasta recibir una proyección autorizada; no se simulan comandas ni tiempos.'}/>
        ) : (
          <div className="order-board" aria-live="polite">
            {orders.map((order) => (
              <article className="order-card" key={order.orderId}>
                <header className="order-card__header">
                  <div><span>Mesa {order.tableNumber}</span><strong>{order.customerLabel}</strong></div>
                  <button className="filter-button" type="button" onClick={() => void showHistory(order.orderId)}>Ver historial</button>
                </header>
                <ul className="order-line-list">
                  {order.lines.map((line) => {
                    const action = board ? nextOrderLineAction(board.role, line.status) : null;
                    const pending = pendingLines.has(line.lineId);
                    return (
                      <li key={line.lineId}>
                        <div className="order-line__identity"><span>{line.quantity}×</span><div><strong>{line.name}</strong><small>Línea {line.lineNumber} · {line.category}</small></div></div>
                        <StatusBadge tone={tone(line.status)}>{ORDER_STATUS_LABELS[line.status]}</StatusBadge>
                        {action ? (
                          <button className="button button--primary order-line__action" type="button" disabled={pending} onClick={() => void transition(line)}>
                            {pending ? 'Confirmando…' : action.label}
                          </button>
                        ) : <span className="order-line__complete">Sin acciones pendientes</span>}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        )}

        {historyOrderId ? (
          <section className="order-history" aria-label="Historial de comanda">
            <div className="panel-heading"><div><span className="eyebrow">Historial</span><h3>Transiciones confirmadas</h3></div>
              <button className="filter-button" type="button" onClick={() => { setHistory(null); setHistoryOrderId(null); }}>Cerrar</button></div>
            {!history ? <p role="status">Recuperando historial…</p> : history.events.length === 0 ? <p>Esta comanda aún no tiene transiciones operativas.</p> :
              <ol>{history.events.map((event) => <li key={event.eventId}><span>{new Date(event.occurredAt).toLocaleString('es-ES')}</span><strong>{event.name}</strong><span>{ORDER_STATUS_LABELS[event.fromStatus]} → {ORDER_STATUS_LABELS[event.toStatus]} · {event.actorRole}</span></li>)}</ol>}
          </section>
        ) : null}

        {!gateway ? (
          <div className="button-row button-row--end"><LockedButton icon="check">Cambiar estado</LockedButton><LockedButton>Registrar incidencia</LockedButton></div>
        ) : (
          <div className="order-contract-warning"><Icon name="lock" size={18}/><p><strong>Entrega y cancelación siguen bloqueadas.</strong> La recogida no acredita entrega al comensal; las incidencias requieren el contrato de arbitraje y ajuste económico.</p></div>
        )}
      </section>
    </div>
  );
}
