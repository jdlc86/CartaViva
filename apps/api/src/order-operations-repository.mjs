const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const STATUSES = new Set(['confirmed', 'preparing', 'ready', 'picked_up']);
const TARGETS = new Set(['preparing', 'ready', 'picked_up']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
}

function assertResult(result) {
  if (!result || !Array.isArray(result.rows)) throw Error('invalid_order_operations_sql_result');
  return result.rows;
}

function asDate(value) {
  if (!(value instanceof Date) || Object.getPrototypeOf(value) !== Date.prototype ||
      !Number.isFinite(Date.prototype.getTime.call(value))) {
    throw Error('invalid_order_operations_sql_result');
  }
  return value.toISOString();
}

function assertRoleStatus(role, status) {
  if (!ROLES.has(role) || (status !== null && !STATUSES.has(status))) {
    throw Error('invalid_order_operations_scope');
  }
  if (role === 'kitchen' && status === 'picked_up') throw Error('order_operations_forbidden');
  if (role === 'waiter' && (status === 'confirmed' || status === 'preparing')) {
    throw Error('order_operations_forbidden');
  }
}

export function createOrderOperationsRepository() {
  return Object.freeze({
    async verifyMembership(query, {actorId, role}) {
      if (typeof query !== 'function' || !UUID.test(actorId) || !ROLES.has(role)) {
        throw Error('invalid_order_operations_scope');
      }
      const rows = assertResult(await query(
        `SELECT user_id, role, state
           FROM sabora.staff_members
          WHERE user_id = $1::uuid
            AND state = 'active'
          FOR SHARE`,
        [actorId]
      ));
      if (rows.length !== 1 || rows[0]?.user_id?.toLowerCase() !== actorId.toLowerCase() ||
          rows[0]?.role !== role || rows[0]?.state !== 'active') {
        throw Error('order_operations_forbidden');
      }
      return Object.freeze({actorId: rows[0].user_id, role: rows[0].role});
    },

    async listBoard(query, {actorId, role, status = null, limit = 50, cursor = null}) {
      if (typeof query !== 'function' || !UUID.test(actorId) ||
          !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
          (cursor !== null && (!isPlainObject(cursor) || !UUID.test(cursor.orderId) ||
            !Number.isSafeInteger(cursor.lineNumber) || cursor.lineNumber < 1 ||
            typeof cursor.confirmedAt !== 'string' ||
            !Number.isFinite(Date.parse(cursor.confirmedAt)) ||
            new Date(cursor.confirmedAt).toISOString() !== cursor.confirmedAt))) {
        throw Error('invalid_order_operations_page');
      }
      assertRoleStatus(role, status);
      const rows = assertResult(await query(
        `SELECT
           orders.id AS order_id,
           lines.id AS line_id,
           tables.number AS table_number,
           COALESCE(orders.customer_alias, orders.company) AS customer_label,
           orders.confirmed_at,
           orders.grouping,
           lines.line_number,
           lines.category,
           lines.name,
           lines.quantity,
           lines.status,
           notifications.id AS notification_id,
           notifications.created_at AS notification_created_at,
           notifications.acknowledged_at AS notification_acknowledged_at
         FROM sabora.order_lines lines
         JOIN sabora.orders orders ON orders.id = lines.order_id
         JOIN sabora.dining_tables tables ON tables.id = lines.table_id
         LEFT JOIN sabora.pickup_notifications notifications
           ON notifications.order_line_id = lines.id
         WHERE (
           $1::text = 'admin'
           OR ($1::text = 'kitchen' AND lines.status IN ('confirmed','preparing','ready'))
           OR ($1::text = 'waiter' AND lines.status IN ('ready','picked_up'))
         )
           AND ($2::text IS NULL OR lines.status = $2::text)
           AND (
             $3::timestamptz IS NULL
             OR (orders.confirmed_at, orders.id, lines.line_number) >
                ($3::timestamptz, $4::uuid, $5::integer)
           )
         ORDER BY orders.confirmed_at, orders.id, lines.line_number
         LIMIT $6::integer`,
        [role, status, cursor?.confirmedAt ?? null, cursor?.orderId ?? null,
          cursor?.lineNumber ?? null, limit + 1]
      ));
      if (rows.length > limit + 1 || rows.some(row =>
        (role === 'kitchen' && row?.status === 'picked_up') ||
        (role === 'waiter' && (row?.status === 'confirmed' || row?.status === 'preparing')) ||
        (status !== null && row?.status !== status))) {
        throw Error('invalid_order_operations_sql_result');
      }
      const page = rows.slice(0, limit).map((row) => {
        if (!UUID.test(row?.order_id) || !UUID.test(row?.line_id) ||
            !Number.isSafeInteger(row?.table_number) || row.table_number < 1 ||
            typeof row?.customer_label !== 'string' || row.customer_label.trim().length === 0 ||
            row.customer_label.length > 160 || !['first', 'grouped', 'late'].includes(row?.grouping) ||
            !Number.isSafeInteger(row?.line_number) || row.line_number < 1 ||
            !['drink', 'starter', 'main', 'dessert'].includes(row?.category) ||
            typeof row?.name !== 'string' || row.name.trim().length === 0 || row.name.length > 160 ||
            !Number.isSafeInteger(row?.quantity) || row.quantity < 1 || row.quantity > 20 ||
            !STATUSES.has(row?.status) ||
            (row.notification_id !== null && !UUID.test(row.notification_id)) ||
            (row.status === 'ready' && (!UUID.test(row.notification_id) ||
              row.notification_acknowledged_at !== null)) ||
            (row.status === 'picked_up' && (!UUID.test(row.notification_id) ||
              row.notification_acknowledged_at === null))) {
          throw Error('invalid_order_operations_sql_result');
        }
        const confirmedAt = asDate(row.confirmed_at);
        const notification = row.notification_id === null ? null : Object.freeze({
          id: row.notification_id,
          createdAt: asDate(row.notification_created_at),
          acknowledgedAt: row.notification_acknowledged_at === null
            ? null : asDate(row.notification_acknowledged_at),
        });
        return Object.freeze({
          orderId: row.order_id,
          lineId: row.line_id,
          tableNumber: row.table_number,
          customerLabel: row.customer_label.trim(),
          confirmedAt,
          grouping: row.grouping,
          lineNumber: row.line_number,
          category: row.category,
          name: row.name.trim(),
          quantity: row.quantity,
          status: row.status,
          notification,
        });
      });
      const last = page.at(-1);
      return Object.freeze({
        version: 1,
        role,
        items: Object.freeze(page),
        nextCursor: rows.length > limit && last ? Object.freeze({
          confirmedAt: last.confirmedAt,
          orderId: last.orderId,
          lineNumber: last.lineNumber,
        }) : null,
      });
    },

    async transitionLine(query, {actorId, role, lineId, targetStatus, correlationId}) {
      if (typeof query !== 'function' || !UUID.test(actorId) || !ROLES.has(role) ||
          !UUID.test(lineId) || !TARGETS.has(targetStatus) || !CORRELATION.test(correlationId)) {
        throw Error('invalid_order_line_transition');
      }
      if ((role === 'kitchen' && targetStatus === 'picked_up') ||
          (role === 'waiter' && targetStatus !== 'picked_up')) {
        throw Error('order_operations_forbidden');
      }
      const rows = assertResult(await query(
        `SELECT updated_order_id, updated_line_id, previous_status,
                current_status, repeated, event_id, notification_id
           FROM sabora.transition_order_line_idempotent_candidate(
             $1::uuid, $2::uuid, $3::text, $4::text
           )`,
        [actorId, lineId, targetStatus, correlationId]
      ));
      if (rows.length !== 1) throw Error('invalid_order_operations_sql_result');
      const row = rows[0];
      if (!UUID.test(row?.updated_order_id) || !UUID.test(row?.updated_line_id) ||
          row.updated_line_id.toLowerCase() !== lineId.toLowerCase() ||
          !UUID.test(row?.event_id) || !['confirmed', 'preparing', 'ready'].includes(row?.previous_status) ||
          row?.current_status !== targetStatus || typeof row?.repeated !== 'boolean' ||
          !((row.previous_status === 'confirmed' && targetStatus === 'preparing') ||
            (row.previous_status === 'preparing' && targetStatus === 'ready') ||
            (row.previous_status === 'ready' && targetStatus === 'picked_up')) ||
          ((targetStatus === 'ready' || targetStatus === 'picked_up') && !UUID.test(row.notification_id)) ||
          (targetStatus === 'preparing' && row.notification_id !== null)) {
        throw Error('invalid_order_operations_sql_result');
      }
      return Object.freeze({
        version: 1,
        orderId: row.updated_order_id,
        lineId: row.updated_line_id,
        previousStatus: row.previous_status,
        currentStatus: row.current_status,
        repeated: row.repeated,
        eventId: row.event_id,
        notificationId: row.notification_id,
      });
    },

    async listHistory(query, {actorId, role, orderId, limit = 100}) {
      if (typeof query !== 'function' || !UUID.test(actorId) || !ROLES.has(role) ||
          !UUID.test(orderId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw Error('invalid_order_history_request');
      }
      const rows = assertResult(await query(
        `SELECT events.id AS event_id,
                events.order_line_id AS line_id,
                lines.line_number,
                lines.name,
                events.from_status,
                events.to_status,
                events.occurred_at,
                members.role AS actor_role
           FROM sabora.order_line_events events
           JOIN sabora.order_lines lines ON lines.id = events.order_line_id
           JOIN sabora.staff_members members ON members.user_id = events.actor_user_id
          WHERE events.order_id = $1::uuid
          ORDER BY events.occurred_at, events.id
          LIMIT $2::integer`,
        [orderId, limit]
      ));
      if (rows.length > limit) throw Error('invalid_order_operations_sql_result');
      const events = rows.map((row) => {
        if (!UUID.test(row?.event_id) || !UUID.test(row?.line_id) ||
            !Number.isSafeInteger(row?.line_number) || row.line_number < 1 ||
            typeof row?.name !== 'string' || row.name.trim().length === 0 ||
            !STATUSES.has(row?.from_status) || !STATUSES.has(row?.to_status) ||
            !ROLES.has(row?.actor_role)) throw Error('invalid_order_operations_sql_result');
        return Object.freeze({
          eventId: row.event_id,
          lineId: row.line_id,
          lineNumber: row.line_number,
          name: row.name.trim(),
          fromStatus: row.from_status,
          toStatus: row.to_status,
          occurredAt: asDate(row.occurred_at),
          actorRole: row.actor_role,
        });
      });
      return Object.freeze({version: 1, orderId, events: Object.freeze(events)});
    },
  });
}

export const ORDER_OPERATION_STATUSES = Object.freeze([...STATUSES]);
export const ORDER_OPERATION_TARGETS = Object.freeze([...TARGETS]);
