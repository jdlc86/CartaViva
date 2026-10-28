export const ORDER_LINE_STATUSES = Object.freeze(['confirmed', 'preparing', 'ready', 'picked_up']);

export const ORDER_STATUS_LABELS = Object.freeze({
  confirmed: 'Pendiente',
  preparing: 'En preparación',
  ready: 'Lista para recoger',
  picked_up: 'Recogida histórica',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const STATUSES = new Set(ORDER_LINE_STATUSES);

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function iso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function normalizeNotification(value, status) {
  if (value === null) {
    if (status === 'ready' || status === 'picked_up') throw Error('invalid_order_board');
    return null;
  }
  if (!plain(value) || !UUID.test(value.id) || !iso(value.createdAt) ||
      (value.acknowledgedAt !== null && !iso(value.acknowledgedAt)) ||
      (status === 'ready' && value.acknowledgedAt !== null) ||
      (status === 'picked_up' && value.acknowledgedAt === null)) {
    throw Error('invalid_order_board');
  }
  return Object.freeze({
    id: value.id,
    createdAt: value.createdAt,
    acknowledgedAt: value.acknowledgedAt,
  });
}

function normalizePickup(value, status) {
  if (value === null) return null;
  const keys=['taskId','state','version','claimedDisplayId','claimedAt','updatedAt'];
  if (!plain(value) || Reflect.ownKeys(value).length!==keys.length ||
      !keys.every(key=>Object.hasOwn(value,key)) || !UUID.test(value.taskId) ||
      !['ready', 'claimed', 'corrected'].includes(value.state) ||
      !Number.isSafeInteger(value.version) || value.version < 1 || !iso(value.updatedAt) ||
      (value.state === 'claimed' && (typeof value.claimedDisplayId !== 'string' ||
        !/^.{2,4}-[0-9A-Z]{3}$/u.test(value.claimedDisplayId) || !iso(value.claimedAt))) ||
      (value.state !== 'claimed' && (value.claimedDisplayId !== null || value.claimedAt !== null)) ||
      (value.state === 'corrected' && status !== 'preparing') ||
      (value.state !== 'corrected' && status !== 'ready')) throw Error('invalid_order_board');
  return Object.freeze({taskId:value.taskId,state:value.state,version:value.version,
    claimedDisplayId:value.claimedDisplayId,claimedAt:value.claimedAt,updatedAt:value.updatedAt});
}

export function normalizeOrderBoard(value) {
  if (!plain(value) || ![1, 2].includes(value.version) || !ROLES.has(value.role) || !Array.isArray(value.items) ||
      value.items.length > 100 || (value.nextCursor !== null && !plain(value.nextCursor))) {
    throw Error('invalid_order_board');
  }
  const seen = new Set();
  const items = value.items.map((item) => {
    if (!plain(item) || !UUID.test(item.orderId) || !UUID.test(item.lineId) || seen.has(item.lineId) ||
        !Number.isSafeInteger(item.tableNumber) || item.tableNumber < 1 ||
        typeof item.customerLabel !== 'string' || item.customerLabel.trim().length === 0 ||
        item.customerLabel.length > 160 || !iso(item.confirmedAt) ||
        !['first', 'grouped', 'late'].includes(item.grouping) ||
        !Number.isSafeInteger(item.lineNumber) || item.lineNumber < 1 ||
        !['drink', 'starter', 'main', 'dessert'].includes(item.category) ||
        typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 160 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 ||
        !STATUSES.has(item.status)) throw Error('invalid_order_board');
    seen.add(item.lineId);
    return Object.freeze({
      orderId: item.orderId,
      lineId: item.lineId,
      tableNumber: item.tableNumber,
      customerLabel: item.customerLabel.trim(),
      confirmedAt: item.confirmedAt,
      grouping: item.grouping,
      lineNumber: item.lineNumber,
      category: item.category,
      name: item.name.trim(),
      quantity: item.quantity,
      status: item.status,
      notification: normalizeNotification(item.notification, item.status),
      pickup: value.version === 2 ? normalizePickup(item.pickup, item.status) : null,
    });
  });
  let nextCursor = null;
  if (value.nextCursor !== null) {
    if (!iso(value.nextCursor.confirmedAt) || !UUID.test(value.nextCursor.orderId) ||
        !Number.isSafeInteger(value.nextCursor.lineNumber) || value.nextCursor.lineNumber < 1) {
      throw Error('invalid_order_board');
    }
    nextCursor = Object.freeze({...value.nextCursor});
  }
  return Object.freeze({version: value.version, role: value.role, items: Object.freeze(items), nextCursor});
}

export function normalizeOrderTransition(value) {
  if (!plain(value) || value.version !== 1 || !UUID.test(value.orderId) ||
      !UUID.test(value.lineId) || !UUID.test(value.eventId) ||
      !STATUSES.has(value.previousStatus) || !STATUSES.has(value.currentStatus) ||
      typeof value.repeated !== 'boolean' ||
      (value.notificationId !== null && !UUID.test(value.notificationId))) {
    throw Error('invalid_order_transition');
  }
  return Object.freeze({...value});
}

export function normalizeOrderHistory(value) {
  if (!plain(value) || value.version !== 1 || !UUID.test(value.orderId) ||
      !Array.isArray(value.events) || value.events.length > 200) throw Error('invalid_order_history');
  const events = value.events.map((event) => {
    if (!plain(event) || !UUID.test(event.eventId) || !UUID.test(event.lineId) ||
        !Number.isSafeInteger(event.lineNumber) || event.lineNumber < 1 ||
        typeof event.name !== 'string' || event.name.trim().length === 0 ||
        !STATUSES.has(event.fromStatus) || !STATUSES.has(event.toStatus) ||
        !iso(event.occurredAt) || !ROLES.has(event.actorRole)) throw Error('invalid_order_history');
    return Object.freeze({...event, name: event.name.trim()});
  });
  return Object.freeze({version: 1, orderId: value.orderId, events: Object.freeze(events)});
}

export function nextOrderLineAction(role, status) {
  if (!ROLES.has(role) || !STATUSES.has(status)) return null;
  if ((role === 'kitchen' || role === 'admin') && status === 'confirmed') {
    return Object.freeze({targetStatus: 'preparing', label: 'Iniciar preparación'});
  }
  if ((role === 'kitchen' || role === 'admin') && status === 'preparing') {
    return Object.freeze({targetStatus: 'ready', label: 'Marcar lista'});
  }
  return null;
}

export function pickupTaskActions(role, status, pickup) {
  if (!ROLES.has(role) || !STATUSES.has(status) || pickup === null || !plain(pickup)) return Object.freeze([]);
  const actions = [];
  if (status === 'ready' && pickup.state === 'ready') {
    if (role === 'waiter' || role === 'admin') actions.push(Object.freeze({action: 'claim', label: 'Voy a recoger'}));
    if (role === 'kitchen' || role === 'admin') actions.push(Object.freeze({action: 'correct', label: 'Corregir: Preparando'}));
  } else if (status === 'ready' && pickup.state === 'claimed' && (role === 'waiter' || role === 'admin')) {
    actions.push(Object.freeze({action: 'cancel', label: 'Cancelo'}));
  }
  return Object.freeze(actions);
}

export function groupOrderBoard(items) {
  if (!Array.isArray(items)) throw Error('invalid_order_board');
  const grouped = new Map();
  for (const item of items) {
    const order = grouped.get(item.orderId) ?? {
      orderId: item.orderId,
      tableNumber: item.tableNumber,
      customerLabel: item.customerLabel,
      confirmedAt: item.confirmedAt,
      grouping: item.grouping,
      lines: [],
    };
    if (order.tableNumber !== item.tableNumber || order.customerLabel !== item.customerLabel ||
        order.confirmedAt !== item.confirmedAt || order.grouping !== item.grouping) {
      throw Error('invalid_order_board');
    }
    order.lines.push(item);
    grouped.set(item.orderId, order);
  }
  return Object.freeze([...grouped.values()].map((order) => Object.freeze({
    ...order,
    lines: Object.freeze(order.lines),
  })));
}
