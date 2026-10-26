import {ORDER_OPERATION_STATUSES, ORDER_OPERATION_TARGETS} from './order-operations-repository.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const STATUS_SET = new Set(ORDER_OPERATION_STATUSES);
const TARGET_SET = new Set(ORDER_OPERATION_TARGETS);

function headers(reply) {
  reply.header('Cache-Control', 'no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
}

function exactPlainObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  const fastifyQueryPrototype = prototype !== null && prototype !== Object.prototype &&
    Object.getPrototypeOf(prototype) === null && Reflect.ownKeys(prototype).length === 0;
  if (prototype !== Object.prototype && prototype !== null && !fastifyQueryPrototype) return false;
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string' || !allowed.has(key) ||
        !Object.prototype.propertyIsEnumerable.call(value, key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
}

// Match only known domain error codes. Substring matching would allow a
// database/driver message containing "forbidden" to masquerade as a 403.
const FORBIDDEN_ERRORS = new Set([
  'order_operations_forbidden', 'actor_not_authorized',
  'role_not_allowed_for_line_transition',
]);
const NOT_FOUND_ERRORS = new Set(['line_not_found', 'order_not_found']);
const CONFLICT_ERRORS = new Set([
  'invalid_line_transition', 'line_transition_idempotency_conflict',
]);
const INPUT_ERRORS = new Set([
  'invalid_order_operations_page', 'invalid_order_history_request',
  'invalid_order_line_transition',
]);

function mapError(error, reply) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (FORBIDDEN_ERRORS.has(message)) {
    return reply.code(403).send({error: 'forbidden'});
  }
  if (NOT_FOUND_ERRORS.has(message)) {
    return reply.code(404).send({error: 'order_operation_not_found'});
  }
  if (CONFLICT_ERRORS.has(message)) {
    return reply.code(409).send({error: 'order_operation_conflict'});
  }
  if (INPUT_ERRORS.has(message)) {
    return reply.code(400).send({error: 'invalid_order_operation'});
  }
  return reply.code(503).send({error: 'order_operations_unavailable'});
}

function requestContext(request) {
  return {verifiedIdentity: request.verifiedIdentity, verifiedStaff: request.verifiedStaff};
}

export function registerOrderOperationsHttp(app, {forRoles, operations, transitionOnly = false} = {}) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function' ||
      typeof forRoles !== 'function' || !operations ||
      typeof operations.listBoard !== 'function' || typeof operations.transitionLine !== 'function' ||
      typeof operations.listHistory !== 'function' || typeof transitionOnly !== 'boolean') {
    throw Error('invalid_order_operations_http_config');
  }
  const protectedRoles = forRoles(['admin', 'waiter', 'kitchen']);

  if (!transitionOnly) app.get('/api/v1/operations/order-lines', {preHandler: protectedRoles}, async (request, reply) => {
    headers(reply);
    const query = request.query;
    if (!exactPlainObject(query, ['status', 'limit', 'afterConfirmedAt', 'afterOrderId', 'afterLineNumber'])) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    const status = query.status ?? null;
    if ((status !== null && typeof status !== 'string') ||
        (query.limit !== undefined && typeof query.limit !== 'string')) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    const cursorValues = [query.afterConfirmedAt, query.afterOrderId, query.afterLineNumber];
    const hasCursor = cursorValues.some((value) => value !== undefined);
    if ((status !== null && !STATUS_SET.has(status)) ||
        typeof query.limit !== 'undefined' && !/^[1-9][0-9]*$/.test(query.limit) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        (hasCursor && (cursorValues.some((value) => typeof value !== 'string') ||
          !UUID.test(query.afterOrderId) || !/^[1-9][0-9]*$/.test(query.afterLineNumber) ||
          !Number.isFinite(Date.parse(query.afterConfirmedAt)) ||
          new Date(query.afterConfirmedAt).toISOString() !== query.afterConfirmedAt))) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    const role = request.verifiedStaff?.role;
    if ((role === 'kitchen' && status === 'picked_up') ||
        (role === 'waiter' && (status === 'confirmed' || status === 'preparing'))) {
      return reply.code(403).send({error: 'forbidden'});
    }
    try {
      const result = await operations.listBoard(requestContext(request), {
        status,
        limit,
        cursor: hasCursor ? {
          confirmedAt: query.afterConfirmedAt,
          orderId: query.afterOrderId,
          lineNumber: Number(query.afterLineNumber),
        } : null,
      });
      return reply.code(200).send(result);
    } catch (error) {
      return mapError(error, reply);
    }
  });

  app.post('/api/v1/operations/order-lines/:lineId/transitions', {
    preHandler: protectedRoles,
    bodyLimit: 2048,
  }, async (request, reply) => {
    headers(reply);
    const {lineId} = request.params ?? {};
    const verifiedRole = request.verifiedStaff?.role;
    const body = request.body;
    if (!UUID.test(lineId) || !exactPlainObject(body, ['targetStatus', 'correlationId']) ||
        Reflect.ownKeys(body).length !== 2 || !TARGET_SET.has(body.targetStatus) ||
        !CORRELATION.test(body.correlationId)) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    if ((verifiedRole === 'kitchen' && body.targetStatus === 'picked_up') ||
        (verifiedRole === 'waiter' && body.targetStatus !== 'picked_up')) {
      return reply.code(403).send({error: 'forbidden'});
    }
    try {
      const result = await operations.transitionLine(requestContext(request), {
        lineId,
        targetStatus: body.targetStatus,
        correlationId: body.correlationId,
      });
      return reply.code(result.repeated ? 200 : 201).send(result);
    } catch (error) {
      return mapError(error, reply);
    }
  });

  if (!transitionOnly) app.get('/api/v1/operations/orders/:orderId/history', {preHandler: protectedRoles}, async (request, reply) => {
    headers(reply);
    const {orderId} = request.params ?? {};
    const query = request.query;
    if (!UUID.test(orderId) || !exactPlainObject(query, ['limit']) ||
        (query.limit !== undefined &&
          (typeof query.limit !== 'string' || !/^[1-9][0-9]*$/.test(query.limit)))) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    try {
      return reply.code(200).send(await operations.listHistory(requestContext(request), {orderId, limit}));
    } catch (error) {
      return mapError(error, reply);
    }
  });
}
