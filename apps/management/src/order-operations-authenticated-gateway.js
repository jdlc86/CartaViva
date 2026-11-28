import {createOrderOperationsGateway, OrderOperationsGatewayError} from './order-operations-gateway.js';
import {createTableChangeDecisionGateway} from './table-change-decision-gateway.js';
import {createStaffGatewayAuth} from './staff-gateway-auth.js';

// Explicit opt-in transport. The host authentication layer owns token
// acquisition and renewal; never persist credentials in browser storage.
export function createAuthenticatedOrderOperationsGateway({
  getAccessToken, cookieSession, fetchImpl = globalThis.fetch, reconnectDelayMs, enableWaiterCalls=false,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw Error('invalid_order_operations_auth_transport');
  }
  const auth = createStaffGatewayAuth({getAccessToken, cookieSession}, {
    invalid: 'invalid_order_operations_auth_transport',
    unavailable: () => Error('order_operations_auth_unavailable')
  });
  const controller = new AbortController();
  const send = async (path, options = {}) => {
    if (controller.signal.aborted) throw Error('order_operations_auth_unavailable');
    if (typeof path !== 'string' || !path.startsWith('/api/v1/operations/') ||
        path.startsWith('//') || path.includes('\\') ||
        /[\r\n]/.test(path)) {
      throw Error('invalid_order_operations_path');
    }
    const headers = await auth.headers(options.headers);
    if (controller.signal.aborted) throw Error('order_operations_auth_unavailable');
    const requestController = new AbortController();
    const abort = () => requestController.abort();
    controller.signal.addEventListener('abort', abort, {once: true});
    options.signal?.addEventListener('abort', abort, {once: true});
    if (controller.signal.aborted || options.signal?.aborted) abort();
    try {
      if (requestController.signal.aborted) throw Error('order_operations_auth_unavailable');
      return await fetchImpl(path, {
        ...options, credentials: auth.credentials, redirect: 'error',
        cache: 'no-store', headers, signal: requestController.signal,
      });
    } catch (error) {
      // Logout and caller cancellation retain their original abort semantics;
      // an unrelated transport failure is normalized without exposing host or
      // driver details to the view.
      if (controller.signal.aborted || options.signal?.aborted || requestController.signal.aborted) {
        throw error;
      }
      throw new OrderOperationsGatewayError('network_error');
    } finally {
      controller.signal.removeEventListener('abort', abort);
      options.signal?.removeEventListener('abort', abort);
    }
  };
  const gateway = createOrderOperationsGateway({send, reconnectDelayMs});
  const tableChangeDecisions = createTableChangeDecisionGateway({send});
  const subscriptions = new Set();
  return Object.freeze({
    ...gateway,
    ...(enableWaiterCalls?{}:{listWaiterCalls:undefined,attendWaiterCall:undefined}),
    decideTableChange: tableChangeDecisions.decide,
    listPendingTableChanges: tableChangeDecisions.listPending,
    subscribeEvents(callbacks) {
      if (controller.signal.aborted) throw Error('order_operations_auth_unavailable');
      const unsubscribe = gateway.subscribeEvents(callbacks);
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        subscriptions.delete(close);
        unsubscribe();
      };
      subscriptions.add(close);
      if (controller.signal.aborted) close();
      return close;
    },
    revoke() {
      controller.abort();
      for (const close of [...subscriptions]) close();
    },
  });
}
