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

function mapError(error, reply) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.includes('forbidden') || message.includes('actor_not_authorized') ||
      message.includes('role_not_allowed')) {
    return reply.code(403).send({error: 'forbidden'});
  }
  if (message.includes('line_not_found') || message.includes('order_not_found')) {
    return reply.code(404).send({error: 'order_operation_not_found'});
  }
  if (message.includes('invalid_line_transition') || message.includes('idempotency_conflict')) {
    return reply.code(409).send({error: 'order_operation_conflict'});
  }
  if (message.includes('invalid_order_operations_page') || message.includes('invalid_order_history_request') ||
      message.includes('invalid_order_line_transition')) {
    return reply.code(400).send({error: 'invalid_order_operation'});
  }
  return reply.code(503).send({error: 'order_operations_unavailable'});
}

function requestContext(request) {
  return {verifiedIdentity: request.verifiedIdentity, verifiedStaff: request.verifiedStaff};
}

export function registerOrderOperationsHttp(app, {forRoles, operations} = {}) {
  if (!app || typeof app.get !== 'function' || typeof app.post !== 'function' ||
      typeof forRoles !== 'function' || !operations ||
      typeof operations.listBoard !== 'function' || typeof operations.transitionLine !== 'function' ||
      typeof operations.listHistory !== 'function') {
    throw Error('invalid_order_operations_http_config');
  }
  const protectedRoles = forRoles(['admin', 'waiter', 'kitchen']);

  app.get('/api/v1/operations/order-lines', {preHandler: protectedRoles}, async (request, reply) => {
    headers(reply);
    const query = request.query;
    if (!exactPlainObject(query, ['status', 'limit', 'afterConfirmedAt', 'afterOrderId', 'afterLineNumber'])) {
      return reply.code(400).send({error: 'invalid_order_operation'});
    }
    const status = query.status ?? null;
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
    const body = request.body;
    if (!UUID.test(lineId) || !exactPlainObject(body, ['targetStatus', 'correlationId']) ||
        Reflect.ownKeys(body).length !== 2 || !TARGET_SET.has(body.targetStatus) ||
        !CORRELATION.test(body.correlationId)) {
      return reply.code(400).send({error: 'invalid_order_operation'});
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

  app.get('/api/v1/operations/orders/:orderId/history', {preHandler: protectedRoles}, async (request, reply) => {
    headers(reply);
    const {orderId} = request.params ?? {};
    const query = request.query;
    if (!UUID.test(orderId) || !exactPlainObject(query, ['limit']) ||
        (query.limit !== undefined && !/^[1-9][0-9]*$/.test(query.limit))) {
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
