import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';

export const ORDER_CATEGORIES = Object.freeze(['drink', 'starter', 'main', 'dessert']);
export const DEFAULT_GROUPING_WINDOW_MS = 5 * 60 * 1000;

export function createRestaurantStore({ clock = () => Date.now(), groupingWindowMs = DEFAULT_GROUPING_WINDOW_MS } = {}) {
  if (!Number.isSafeInteger(groupingWindowMs) || groupingWindowMs <= 0) throw new Error('invalid_grouping_window');
  const tables = new Map();
  const orders = new Map();
  const idempotency = new Map();
  const memberships = new Map();
  const orderEvents = [];
  const now = () => clock();
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const safeEqual = (a, b) => {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
  };
  function createTable({ number, capacity, description = '' }) {
    if (!Number.isSafeInteger(number) || number <= 0 || [...tables.values()].some(t => t.number === number)) throw new Error('invalid_or_duplicate_table_number');
    if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new Error('invalid_capacity');
    if (typeof description !== 'string') throw new Error('invalid_description');
    const token = randomUUID() + randomUUID();
    const table = { id: randomUUID(), number, capacity, description, qrHash: hash(token), qrVersion: 1, firstConfirmedAt: null, sessionId: randomUUID(), participants: new Set() };
    tables.set(table.id, table);
    return { id: table.id, number, capacity, description, qrToken: token };
  }
  function rotateQr(tableId) {
    const table = tables.get(tableId);
    if (!table) throw new Error('table_not_found');
    const token = randomUUID() + randomUUID();
    table.qrHash = hash(token);
    table.qrVersion += 1;
    table.sessionId = randomUUID();
    table.firstConfirmedAt = null;
    table.participants.clear();
    return { tableId, qrToken: token, qrVersion: table.qrVersion };
  }
  function confirmOrder({ tableId, qrToken, company, employeeNumber, items, idempotencyKey }) {
    const table = tables.get(tableId);
    if (!table) throw new Error('table_not_found');
    if (typeof qrToken !== 'string' || !safeEqual(table.qrHash, hash(qrToken))) throw new Error('invalid_qr');
    if (typeof company !== 'string' || !company.trim() || typeof employeeNumber !== 'string' || !employeeNumber.trim()) throw new Error('invalid_customer');
    if (!Array.isArray(items) || items.length === 0 || items.length > 50 || items.some(i => !i || typeof i !== 'object' || Array.isArray(i) || !ORDER_CATEGORIES.includes(i.category) || typeof i.name !== 'string' || !i.name.trim() || i.name.length > 160 || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 20)) throw new Error('invalid_items');
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) throw new Error('invalid_idempotency_key');
    const normalizedCompany = company.trim();
    const normalizedEmployee = employeeNumber.trim();
    if (normalizedCompany.length > 160 || normalizedEmployee.length > 80) throw new Error('invalid_customer');
    const identity = `${normalizedCompany.length}:${normalizedCompany}${normalizedEmployee.length}:${normalizedEmployee}`;
    const key = JSON.stringify([table.sessionId, identity, idempotencyKey]);
    const payload = JSON.stringify({ tableId, identity, items });
    const prior = idempotency.get(key);
    if (prior) {
      if (prior.payload !== payload) throw new Error('idempotency_conflict');
      return { ...structuredClone(prior.result), repeated: true };
    }
    const timestamp = now();
    const first = table.firstConfirmedAt;
    const grouped = first !== null && timestamp < first + groupingWindowMs;
    if (first === null) table.firstConfirmedAt = timestamp;
    table.participants.add(identity);
    const order = { id: randomUUID(), tableId, sessionId: table.sessionId, company: company.trim(), employeeNumber: employeeNumber.trim(), items: structuredClone(items), confirmedAt: timestamp, grouping: first === null ? 'first' : grouped ? 'grouped' : 'late', status: 'confirmed' };
    orders.set(order.id, order);
    const result = { order, participantCount: table.participants.size, groupingDeadline: table.firstConfirmedAt + groupingWindowMs };
    idempotency.set(key, { payload, result: structuredClone(result) });
    return { ...structuredClone(result), repeated: false };
  }
  // Internal proof-of-concept only. Membership assignment must never be exposed
  // to a client; production authorization will bind identity to verified Auth.
  function assignMember({ userId, role }) {
    if (typeof userId !== 'string' || !userId.trim() || !['admin', 'waiter', 'kitchen'].includes(role)) throw new Error('invalid_member');
    memberships.set(userId, role);
  }
  function transitionOrder({ orderId, actorUserId, nextStatus, reason = null }) {
    const order = orders.get(orderId);
    if (!order) throw new Error('order_not_found');
    const role = memberships.get(actorUserId);
    if (!role) throw new Error('actor_not_authorized');
    if (typeof reason !== 'string' && reason !== null) throw new Error('invalid_reason');
    if (reason !== null && (!reason.trim() || reason.trim().length > 500)) throw new Error('invalid_reason');
    const transitions = { confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['delivered', 'cancelled'], delivered: [], cancelled: [] };
    if (!transitions[order.status].includes(nextStatus)) throw new Error('invalid_order_transition');
    if (!(role === 'admin' || (role === 'kitchen' && ['preparing', 'ready', 'cancelled'].includes(nextStatus)) || (role === 'waiter' && ['delivered', 'cancelled'].includes(nextStatus)))) throw new Error('role_not_allowed_for_transition');
    if (nextStatus === 'cancelled' && !reason?.trim()) throw new Error('cancellation_reason_required');
    const previousStatus = order.status;
    order.status = nextStatus;
    const event = { id: randomUUID(), orderId, sessionId: order.sessionId, tableId: order.tableId, actorUserId, previousStatus, currentStatus: nextStatus, reason: reason?.trim() || null, occurredAt: now() };
    orderEvents.push(event);
    return { order: structuredClone(order), event: structuredClone(event) };
  }
  function listOrderEvents(orderId) {
    return structuredClone(orderEvents.filter(event => event.orderId === orderId));
  }
  function getTable(tableId) {
    const table = tables.get(tableId);
    if (!table) throw new Error('table_not_found');
    return { id: table.id, number: table.number, capacity: table.capacity, description: table.description, qrVersion: table.qrVersion, participantCount: table.participants.size, groupingDeadline: table.firstConfirmedAt === null ? null : table.firstConfirmedAt + groupingWindowMs };
  }
  return { createTable, rotateQr, confirmOrder, assignMember, transitionOrder, listOrderEvents, getTable, listOrders: () => [...orders.values()].map(o => structuredClone(o)) };
}
