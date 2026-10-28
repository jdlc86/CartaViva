import {
  orderOperationBoardScope,
  orderOperationHistoryScope,
} from './order-operation-read-capability.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const CAPABILITY_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
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

function validCapability(capability, {actorId, lineId, targetStatus, correlationId}) {
  const keys = [
    'keyId', 'databaseRole', 'actorId', 'lineId', 'targetStatus',
    'correlationId', 'issuedAtMs', 'expiresAtMs', 'signatureHex',
  ];
  if (!isPlainObject(capability) || Reflect.ownKeys(capability).length !== keys.length ||
      !keys.every((key) => Object.hasOwn(capability, key)) ||
      !CAPABILITY_KEY.test(capability.keyId) || !ROLE_NAME.test(capability.databaseRole) ||
      !UUID.test(capability.actorId) || !UUID.test(capability.lineId) ||
      capability.actorId.toLowerCase() !== actorId.toLowerCase() ||
      capability.lineId.toLowerCase() !== lineId.toLowerCase() ||
      capability.targetStatus !== targetStatus || capability.correlationId !== correlationId ||
      !Number.isSafeInteger(capability.issuedAtMs) || capability.issuedAtMs < 0 ||
      !Number.isSafeInteger(capability.expiresAtMs) ||
      capability.expiresAtMs <= capability.issuedAtMs ||
      capability.expiresAtMs - capability.issuedAtMs > 30_000 ||
      !SHA256_HEX.test(capability.signatureHex)) {
    return false;
  }
  return true;
}

function validReadCapability(capability, {actorId, role, operation, scope}) {
  const keys = [
    'keyId', 'databaseRole', 'actorId', 'staffRole', 'operation', 'scope',
    'issuedAtMs', 'expiresAtMs', 'signatureHex',
  ];
  return isPlainObject(capability) && Reflect.ownKeys(capability).length === keys.length &&
    keys.every((key) => Object.hasOwn(capability, key)) &&
    CAPABILITY_KEY.test(capability.keyId) && ROLE_NAME.test(capability.databaseRole) &&
    UUID.test(capability.actorId) &&
    capability.actorId.toLowerCase() === actorId.toLowerCase() &&
    capability.staffRole === role && capability.operation === operation &&
    capability.scope === scope &&
    Number.isSafeInteger(capability.issuedAtMs) && capability.issuedAtMs >= 0 &&
    Number.isSafeInteger(capability.expiresAtMs) &&
    capability.expiresAtMs > capability.issuedAtMs &&
    capability.expiresAtMs - capability.issuedAtMs <= 30_000 &&
    SHA256_HEX.test(capability.signatureHex);
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

    async listBoard(query, {
      actorId, role, status = null, limit = 50, cursor = null, capability = null,
    }) {
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
      let result;
      if (capability === null) {
        result = await query(
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
           notifications.acknowledged_at AS notification_acknowledged_at,
           NULL::uuid AS pickup_task_id,
           NULL::text AS pickup_state,
           NULL::bigint AS pickup_version,
           NULL::uuid AS pickup_claimed_by,
           NULL::text AS pickup_claimed_display_id,
           NULL::timestamptz AS pickup_claimed_at,
           NULL::timestamptz AS pickup_updated_at
         FROM sabora.order_lines lines
         JOIN sabora.orders orders ON orders.id = lines.order_id
         JOIN sabora.dining_tables tables ON tables.id = lines.table_id
         LEFT JOIN LATERAL (
           SELECT notification.id,notification.created_at,notification.acknowledged_at
             FROM sabora.pickup_notifications notification
            WHERE notification.order_line_id = lines.id
            ORDER BY notification.created_at DESC,notification.id DESC LIMIT 1
         ) notifications ON true
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
        );
      } else {
        const scope = orderOperationBoardScope({role, status, limit, cursor});
        if (!validReadCapability(capability, {
          actorId, role, operation: 'board', scope,
        })) {
          throw Error('invalid_order_operation_read_capability');
        }
        result = await query(
          `SELECT *
             FROM sabora.read_order_operations_board_authorized_candidate(
               $1::text, $2::text, $3::uuid, $4::text, $5::text,
               $6::bigint, $7::uuid, $8::integer, $9::integer,
               $10::bigint, $11::bigint, $12::text
             )`,
          [
            capability.keyId,
            capability.databaseRole,
            actorId,
            role,
            status,
            cursor === null ? null : Date.parse(cursor.confirmedAt),
            cursor?.orderId ?? null,
            cursor?.lineNumber ?? null,
            limit,
            capability.issuedAtMs,
            capability.expiresAtMs,
            capability.signatureHex,
          ]
        );
      }
      const rows = assertResult(result);
      if (rows.length > limit + 1 || rows.some(row =>
        (role === 'kitchen' && row?.status === 'picked_up') ||
        (role === 'waiter' && (row?.status === 'confirmed' || row?.status === 'preparing')) ||
        (status !== null && row?.status !== status))) {
        throw Error('invalid_order_operations_sql_result');
      }
      // Validate the entire SQL page, including the overflow row used only to
      // compute nextCursor. Reject malformed ordering and cursor regressions.
      let previousKey = cursor === null ? null : [
        cursor.confirmedAt, cursor.orderId.toLowerCase(), cursor.lineNumber,
      ];
      const seenLines = new Set();
      for (const row of rows) {
        const confirmedAt = asDate(row?.confirmed_at);
        if (!UUID.test(row?.order_id) || !UUID.test(row?.line_id) ||
            !Number.isSafeInteger(row?.line_number) || row.line_number < 1) {
          throw Error('invalid_order_operations_sql_result');
        }
        const key = [confirmedAt, row.order_id.toLowerCase(), row.line_number];
        if (previousKey && (key[0] < previousKey[0] ||
            (key[0] === previousKey[0] && key[1] < previousKey[1]) ||
            (key[0] === previousKey[0] && key[1] === previousKey[1] &&
              key[2] <= previousKey[2]))) {
          throw Error('invalid_order_operations_sql_result');
        }
        const lineKey = row.line_id.toLowerCase();
        if (seenLines.has(lineKey)) throw Error('invalid_order_operations_sql_result');
        seenLines.add(lineKey);
        previousKey = key;
      }
      // Validate the overflow row too: it determines whether pagination continues
      // and must not bypass the same SQL-result contract as visible rows.
      const validatedRows = rows.map((row) => {
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
              row.notification_acknowledged_at === null)) ||
            (row.pickup_task_id !== null && (!UUID.test(row.pickup_task_id) ||
              !['ready','claimed','corrected'].includes(row.pickup_state) ||
              !Number.isSafeInteger(Number(row.pickup_version)) || Number(row.pickup_version)<1 ||
              !(row.pickup_updated_at instanceof Date) ||
              (row.pickup_state==='claimed' && (!UUID.test(row.pickup_claimed_by) ||
                typeof row.pickup_claimed_display_id!=='string' ||
                !/^.{2,4}-[0-9A-Z]{3}$/u.test(row.pickup_claimed_display_id) ||
                !(row.pickup_claimed_at instanceof Date))) ||
              (row.pickup_state!=='claimed' && (row.pickup_claimed_by!==null ||
                row.pickup_claimed_display_id!==null ||
                row.pickup_claimed_at!==null)) ||
              (row.pickup_state==='corrected' && row.status!=='preparing') ||
              (row.pickup_state!=='corrected' && row.status!=='ready')))) {
          throw Error('invalid_order_operations_sql_result');
        }
        const confirmedAt = asDate(row.confirmed_at);
        const notification = row.notification_id === null ? null : Object.freeze({
          id: row.notification_id,
          createdAt: asDate(row.notification_created_at),
          acknowledgedAt: row.notification_acknowledged_at === null
            ? null : asDate(row.notification_acknowledged_at),
        });
        const pickup = row.pickup_task_id === null ? null : Object.freeze({
          taskId: row.pickup_task_id,
          state: row.pickup_state,
          version: Number(row.pickup_version),
          claimedBy: row.pickup_claimed_by,
          claimedDisplayId: row.pickup_claimed_display_id,
          claimedAt: row.pickup_claimed_at === null ? null : asDate(row.pickup_claimed_at),
          updatedAt: asDate(row.pickup_updated_at),
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
          pickup,
        });
      });
      const page = validatedRows.slice(0, limit);
      const last = page.at(-1);
      return Object.freeze({
        version: 2,
        role,
        items: Object.freeze(page),
        nextCursor: rows.length > limit && last ? Object.freeze({
          confirmedAt: last.confirmedAt,
          orderId: last.orderId,
          lineNumber: last.lineNumber,
        }) : null,
      });
    },

    async transitionLine(query, {
      actorId, role, lineId, targetStatus, correlationId, capability,
    }) {
      if (typeof query !== 'function' || !UUID.test(actorId) || !ROLES.has(role) ||
          !UUID.test(lineId) || !TARGETS.has(targetStatus) || !CORRELATION.test(correlationId)) {
        throw Error('invalid_order_line_transition');
      }
      if ((role === 'kitchen' && targetStatus === 'picked_up') ||
          (role === 'waiter' && targetStatus !== 'picked_up')) {
        throw Error('order_operations_forbidden');
      }
      if (!validCapability(capability, {actorId, lineId, targetStatus, correlationId})) {
        throw Error('invalid_order_operation_capability');
      }
      const rows = assertResult(await query(
        `SELECT updated_order_id, updated_line_id, previous_status,
                current_status, repeated, event_id, notification_id
           FROM sabora.transition_order_line_authorized_candidate(
             $1::text, $2::text, $3::uuid, $4::uuid, $5::text,
             $6::text, $7::bigint, $8::bigint, $9::text
           )`,
        [
          capability.keyId,
          capability.databaseRole,
          actorId,
          lineId,
          targetStatus,
          correlationId,
          capability.issuedAtMs,
          capability.expiresAtMs,
          capability.signatureHex,
        ]
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

    async listHistory(query, {actorId, role, orderId, limit = 100, capability = null}) {
      if (typeof query !== 'function' || !UUID.test(actorId) || !ROLES.has(role) ||
          !UUID.test(orderId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw Error('invalid_order_history_request');
      }
      let result;
      if (capability === null) {
        result = await query(
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
        );
      } else {
        const scope = orderOperationHistoryScope({role, orderId, limit});
        if (!validReadCapability(capability, {
          actorId, role, operation: 'history', scope,
        })) {
          throw Error('invalid_order_operation_read_capability');
        }
        result = await query(
          `SELECT *
             FROM sabora.read_order_operations_history_authorized_candidate(
               $1::text, $2::text, $3::uuid, $4::text, $5::uuid,
               $6::integer, $7::bigint, $8::bigint, $9::text
             )`,
          [
            capability.keyId,
            capability.databaseRole,
            actorId,
            role,
            orderId,
            limit,
            capability.issuedAtMs,
            capability.expiresAtMs,
            capability.signatureHex,
          ]
        );
      }
      const rows = assertResult(result);
      if (rows.length > limit) throw Error('invalid_order_operations_sql_result');
      if (rows.some(row =>
        (row?.from_status !== 'confirmed' || row?.to_status !== 'preparing') &&
        (row?.from_status !== 'preparing' || row?.to_status !== 'ready') &&
        (row?.from_status !== 'ready' || row?.to_status !== 'picked_up') &&
        (row?.from_status !== 'ready' || row?.to_status !== 'preparing'))) {
        throw Error('invalid_order_operations_sql_result');
      }
      const events = rows.map((row) => {
        if (!UUID.test(row?.event_id) || !UUID.test(row?.line_id) ||
            !Number.isSafeInteger(row?.line_number) || row.line_number < 1 ||
            typeof row?.name !== 'string' || row.name.trim().length === 0 ||
            !STATUSES.has(row?.from_status) || !STATUSES.has(row?.to_status) ||
            !ROLES.has(row?.actor_role) ||
            (row.actor_role === 'waiter' && row.to_status !== 'picked_up') ||
            (row.actor_role === 'kitchen' && row.to_status === 'picked_up') ||
            (row.from_status === 'ready' && row.to_status === 'preparing' &&
              !['kitchen','admin'].includes(row.actor_role))) {
          throw Error('invalid_order_operations_sql_result');
        }
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
      const eventIds = new Set();
      const lastByLine = new Map();
      let lastEvent = null;
      for (const event of events) {
        if (eventIds.has(event.eventId) ||
            (lastEvent && (lastEvent.occurredAt > event.occurredAt ||
              (lastEvent.occurredAt === event.occurredAt && lastEvent.eventId >= event.eventId)))) {
          throw Error('invalid_order_operations_sql_result');
        }
        eventIds.add(event.eventId);
        lastEvent = event;
        const previous = lastByLine.get(event.lineId);
        if (previous && (previous.toStatus !== event.fromStatus ||
            previous.occurredAt > event.occurredAt)) {
          throw Error('invalid_order_operations_sql_result');
        }
        lastByLine.set(event.lineId, event);
      }
      return Object.freeze({version: 1, orderId, events: Object.freeze(events)});
    },
  });
}

export const ORDER_OPERATION_STATUSES = Object.freeze([...STATUSES]);
export const ORDER_OPERATION_TARGETS = Object.freeze([...TARGETS]);
