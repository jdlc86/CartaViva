import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Icon} from '../components/Icon';
import {ConnectionNotice, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';
import type {H6OperationEvent, OrderOperationsGateway} from '../order-operations-gateway.js';
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
  const readEpoch = useRef(0);
  const historyEpoch = useRef(0);
  const transitionAttempts = useRef(new Map<string, {targetStatus: string; correlationId: string}>());
  const [workspace, setWorkspace] = useState<OrderWorkspace>('kitchen');
  const [phase, setPhase] = useState<LoadState>(gateway ? 'loading' : 'idle');
  const [board, setBoard] = useState<OrderBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLines, setPendingLines] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<OrderHistory | null>(null);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [eventState, setEventState] = useState<'disconnected'|'connecting'|'connected'|'unavailable'>(gateway?'connecting':'disconnected');
  const [operationEvents, setOperationEvents] = useState<ReadonlyArray<H6OperationEvent>>([]);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [incidentOrderId, setIncidentOrderId] = useState<string | null>(null);
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentAmount, setIncidentAmount] = useState('0');
  const [incidentOrigin, setIncidentOrigin] = useState<'waiter_customer'|'waiter_restaurant'>('waiter_customer');
  const [resolutionReason, setResolutionReason] = useState('Resolución revisada y confirmada por administración');
  const active = workspaces.find((item) => item.id === workspace) ?? workspaces[0];

  const load = useCallback(async () => {
    const epoch = ++readEpoch.current;
    if (!gateway) { setBoard(null); setPhase('idle'); return; }
    setPhase('loading');
    setError(null);
    try {
      const result = await gateway.listBoard({limit: 100});
      if (epoch !== readEpoch.current) return;
      setBoard(result);
      setPhase('ready');
      if (result.role === 'waiter') setWorkspace('floor');
    } catch {
      if (epoch !== readEpoch.current) return;
      setBoard(null);
      setError('No se pudo recuperar el estado confirmado. Reintenta cuando la conexión esté disponible.');
      setPhase('error');
    }
  }, [gateway]);

  useEffect(() => {
    void load();
    return () => { readEpoch.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!gateway) { setEventState('disconnected'); return; }
    setEventState('connecting');
    return gateway.subscribeEvents({
      onEvent: (event) => {
        setEventState('connected');
        setOperationEvents((current) => [...current.filter((item) => item.id !== event.id), event].slice(-200));
        void load();
      },
      onResync: () => { setOperationEvents([]); void load(); },
      onUnavailable: () => setEventState('unavailable'),
    });
  }, [gateway, load]);

  const items = useMemo(() => board?.items.filter((line) => visibleInWorkspace(line, workspace)) ?? [],
    [board, workspace]);
  const orders = useMemo(() => groupOrderBoard(items), [items]);
  const counts = useMemo(() => ({
    pending: board?.items.filter((line) => line.status === 'confirmed').length ?? 0,
    preparing: board?.items.filter((line) => line.status === 'preparing').length ?? 0,
    ready: board?.items.filter((line) => line.status === 'ready').length ?? 0,
  }), [board]);
  const h6ByOrder = useMemo(() => {
    const result = new Map<string, {roundId?: string; dispatchId?: string}>();
    for (const event of operationEvents) {
      const orderId=typeof event.payload.orderId==='string'?event.payload.orderId:null;
      if (!orderId) continue;
      const value=result.get(orderId)??{};
      if (typeof event.payload.roundId==='string') value.roundId=event.payload.roundId;
      if (typeof event.payload.dispatchId==='string') value.dispatchId=event.payload.dispatchId;
      result.set(orderId,value);
    }
    return result;
  }, [operationEvents]);
  const pendingArbitrations = useMemo(() => operationEvents.filter((event) =>
    event.type==='sabora.incident.awaiting_admin'&&typeof event.payload.incidentId==='string'), [operationEvents]);
  const pendingCashRefunds = useMemo(() => operationEvents.filter((event) =>
    event.type==='sabora.incident.cash_refund_due'&&typeof event.payload.incidentId==='string'&&
    Number.isSafeInteger(event.payload.amountCents)), [operationEvents]);

  const transition = async (line: OrderLineItem) => {
    if (!gateway || !board || pendingLines.has(line.lineId)) return;
    const action = nextOrderLineAction(board.role, line.status);
    if (!action) return;
    setPendingLines((current) => new Set(current).add(line.lineId));
    setError(null);
    const previousAttempt = transitionAttempts.current.get(line.lineId);
    const correlationId = previousAttempt?.targetStatus === action.targetStatus
      ? previousAttempt.correlationId
      : `ui_${crypto.randomUUID().replaceAll('-', '_')}`;
    transitionAttempts.current.set(line.lineId, {targetStatus: action.targetStatus, correlationId});
    try {
      await gateway.transitionLine({
        lineId: line.lineId,
        targetStatus: action.targetStatus,
        correlationId,
      });
      transitionAttempts.current.delete(line.lineId);
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
    const epoch = ++historyEpoch.current;
    if (!gateway) return;
    setHistoryOrderId(orderId);
    setHistory(null);
    try {
      const result = await gateway.listHistory({orderId, limit: 100});
      if (epoch === historyEpoch.current) setHistory(result);
    } catch {
      if (epoch === historyEpoch.current) setError('No se pudo recuperar el historial de esta comanda.');
    }
  };

  const acknowledgeDispatch = async (dispatchId: string) => {
    if (!gateway || pendingOperation) return;
    setPendingOperation(dispatchId);setError(null);
    try { await gateway.acknowledgeDispatch({dispatchId,correlationId:`ui_ack_${crypto.randomUUID().replaceAll('-','_')}`}); await load(); }
    catch { setError('No se pudo confirmar la recepción en cocina. El despacho sigue bloqueado hasta recuperar estado.'); await load(); }
    finally { setPendingOperation(null); }
  };

  const reportIncident = async (orderId: string) => {
    if (!gateway || !board || pendingOperation) return;
    const roundId=h6ByOrder.get(orderId)?.roundId,affectedCents=Number(incidentAmount);
    if (!roundId || !incidentReason.trim() || !Number.isSafeInteger(affectedCents) || affectedCents<0) {
      setError('La incidencia necesita motivo, importe válido y contexto durable de la ronda.');return;
    }
    setPendingOperation(orderId);setError(null);
    const origin=board.role==='kitchen'?'kitchen':incidentOrigin;
    try {
      await gateway.reportIncident({roundId,lineId:null,origin,reason:incidentReason,
        affectedCents,correlationId:`ui_incident_${crypto.randomUUID().replaceAll('-','_')}`});
      setIncidentOrderId(null);setIncidentReason('');setIncidentAmount('0');await load();
    } catch { setError('La incidencia no quedó confirmada. No se ha inferido ningún ajuste económico.');await load(); }
    finally { setPendingOperation(null); }
  };

  const resolveIncident = async (incidentId: string,resolution: 'approve'|'reject') => {
    if (!gateway || pendingOperation || !resolutionReason.trim()) return;
    setPendingOperation(incidentId);setError(null);
    try { await gateway.resolveIncident({incidentId,resolution,reason:resolutionReason,
      correlationId:`ui_resolution_${crypto.randomUUID().replaceAll('-','_')}`});await load(); }
    catch { setError('La resolución no quedó confirmada; la incidencia conserva su estado anterior.');await load(); }
    finally { setPendingOperation(null); }
  };

  const refundCash = async (incidentId: string) => {
    if (!gateway || pendingOperation) return;
    setPendingOperation(incidentId);setError(null);
    try {
      await gateway.refundCash({incidentId,correlationId:`ui_cash_refund_${crypto.randomUUID().replaceAll('-','_')}`});
      setOperationEvents(current=>current.filter(event=>event.payload.incidentId!==incidentId));await load();
    } catch { setError('La devolución presencial no quedó registrada. No se muestra como completada.');await load(); }
    finally { setPendingOperation(null); }
  };

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Comandas"
        title="Cocina y sala"
        description="Preparación y recogida por línea, con estado persistente e historial confirmado."
        actions={<StatusBadge tone={eventState==='connected' ? 'brand' : 'warning'}>
          {eventState==='connected'?'Eventos durables conectados':eventState==='unavailable'?'Reconectando eventos':gateway?'Conectando eventos':'Canal operativo sin conectar'}
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
                  <div className="button-row">
                    {h6ByOrder.get(order.orderId)?.dispatchId&&order.lines.some(line=>line.status==='confirmed')?
                      <button className="button button--primary" type="button" disabled={Boolean(pendingOperation)}
                        onClick={()=>void acknowledgeDispatch(h6ByOrder.get(order.orderId)!.dispatchId!)}>Confirmar recepción</button>:null}
                    <button className="filter-button" type="button" onClick={() => void showHistory(order.orderId)}>Ver historial</button>
                  </div>
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
                {h6ByOrder.get(order.orderId)?.roundId ? <div className="incident-controls">
                  {incidentOrderId===order.orderId?<>
                    {board?.role!=='kitchen'?<label>Origen<select value={incidentOrigin} onChange={event=>setIncidentOrigin(event.target.value as typeof incidentOrigin)}><option value="waiter_customer">Solicitud del cliente</option><option value="waiter_restaurant">Causa del restaurante</option></select></label>:<span className="honest-operational-note">Incidencia de cocina: arbitraje administrativo obligatorio.</span>}
                    <label>Motivo<textarea maxLength={500} value={incidentReason} onChange={event=>setIncidentReason(event.target.value)}/></label>
                    <label>Importe afectado (céntimos)<input inputMode="numeric" value={incidentAmount} onChange={event=>setIncidentAmount(event.target.value)}/></label>
                    <div className="button-row"><button className="button button--primary" type="button" disabled={Boolean(pendingOperation)} onClick={()=>void reportIncident(order.orderId)}>Registrar incidencia</button><button type="button" onClick={()=>setIncidentOrderId(null)}>Cancelar</button></div>
                  </>:<button className="filter-button" type="button" onClick={()=>setIncidentOrderId(order.orderId)}>Registrar incidencia</button>}
                </div>:null}
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

        {board?.role==='admin'&&pendingArbitrations.length?<section className="incident-arbitration" aria-label="Arbitraje de incidencias"><div><span className="eyebrow">Administración</span><h3>Incidencias pendientes</h3></div><label>Motivo de resolución<input maxLength={500} value={resolutionReason} onChange={event=>setResolutionReason(event.target.value)}/></label><ul>{pendingArbitrations.map(event=><li key={event.id}><span>Incidencia {String(event.payload.incidentId).slice(0,8)}</span><div className="button-row"><button className="button button--primary" type="button" disabled={Boolean(pendingOperation)} onClick={()=>void resolveIncident(String(event.payload.incidentId),'approve')}>Aprobar ajuste</button>{event.payload.origin!=='kitchen'?<button type="button" disabled={Boolean(pendingOperation)} onClick={()=>void resolveIncident(String(event.payload.incidentId),'reject')}>Rechazar solicitud</button>:null}</div></li>)}</ul></section>:null}
        {pendingCashRefunds.length?<section className="incident-arbitration" aria-label="Devoluciones presenciales pendientes"><div><span className="eyebrow">Sala</span><h3>Devolución en efectivo pendiente</h3></div><ul>{pendingCashRefunds.map(event=><li key={event.id}><span>{Number(event.payload.amountCents)/100} € · incidencia {String(event.payload.incidentId).slice(0,8)}</span><button className="button button--primary" type="button" disabled={Boolean(pendingOperation)} onClick={()=>void refundCash(String(event.payload.incidentId))}>Registrar devolución entregada</button></li>)}</ul></section>:null}

        {!gateway ? (
          <div className="button-row button-row--end"><LockedButton icon="check">Cambiar estado</LockedButton><LockedButton>Registrar incidencia</LockedButton></div>
        ) : (
          <div className="order-contract-warning"><Icon name="lock" size={18}/><p><strong>La recogida no acredita entrega al comensal.</strong> Las incidencias H6 aplican arbitraje y efecto económico durable; la entrega final y los límites antifraude sin aprobación siguen aislados por falta de contrato normativo cerrado.</p></div>
        )}
      </section>
    </div>
  );
}
