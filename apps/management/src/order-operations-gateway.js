import {normalizeOrderBoard, normalizeOrderHistory, normalizeOrderTransition} from './order-operations-model.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const TARGETS = new Set(['preparing', 'ready', 'picked_up']);

export class OrderOperationsGatewayError extends Error {
  constructor(code) { super(code); this.name = 'OrderOperationsGatewayError'; this.code = code; }
}

async function json(response) {
  const contentType = response?.headers?.get?.('content-type');
  if (!response || typeof response.status !== 'number' || typeof contentType !== 'string' ||
      !/^application\/json(?:;|$)/i.test(contentType)) throw new OrderOperationsGatewayError('invalid_response');
  let body;
  try { body = await response.json(); }
  catch { throw new OrderOperationsGatewayError('invalid_response'); }
  if (!response.ok) {
    const known = new Set(['unauthorized', 'forbidden', 'invalid_order_operation',
      'order_operation_not_found', 'order_operation_conflict', 'order_operations_unavailable']);
    const code = body && typeof body === 'object' && !Array.isArray(body) && known.has(body.error)
      ? body.error : 'invalid_response';
    throw new OrderOperationsGatewayError(code);
  }
  return body;
}

export function createOrderOperationsGateway({send} = {}) {
  if (typeof send !== 'function') throw Error('invalid_order_operations_sender');
  return Object.freeze({
    async listBoard({status = null, limit = 100} = {}) {
      const parameters = new URLSearchParams();
      if (status !== null) parameters.set('status', status);
      parameters.set('limit', String(limit));
      const response = await send(`/api/v1/operations/order-lines?${parameters}`, {
        method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: {'Accept': 'application/json'},
      });
      return normalizeOrderBoard(await json(response));
    },
    async transitionLine({lineId, targetStatus, correlationId} = {}) {
      if (!UUID.test(lineId) || !TARGETS.has(targetStatus) || !CORRELATION.test(correlationId)) {
        throw Error('invalid_order_transition');
      }
      const response = await send(`/api/v1/operations/order-lines/${lineId}/transitions`, {
        method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify({targetStatus, correlationId}),
      });
      const body = await json(response);
      return normalizeOrderTransition(body);
    },
    async listHistory({orderId, limit = 100} = {}) {
      if (!UUID.test(orderId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw Error('invalid_order_history');
      }
      const response = await send(`/api/v1/operations/orders/${orderId}/history?limit=${limit}`, {
        method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: {'Accept': 'application/json'},
      });
      return normalizeOrderHistory(await json(response));
    },
  });
}
