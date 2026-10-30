import {createOrderOperationsGateway, OrderOperationsGatewayError} from './order-operations-gateway.js';

// Explicit opt-in transport. The host authentication layer owns token
// acquisition and renewal; never persist credentials in browser storage.
export function createAuthenticatedOrderOperationsGateway({
  getAccessToken, fetchImpl = globalThis.fetch, reconnectDelayMs,
} = {}) {
  if (typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function') {
    throw Error('invalid_order_operations_auth_transport');
  }
  const controller = new AbortController();
  const send = async (path, options = {}) => {
    if (controller.signal.aborted) throw Error('order_operations_auth_unavailable');
    if (typeof path !== 'string' || !path.startsWith('/api/v1/operations/') ||
        path.startsWith('//') || path.includes('\\') ||
        /[\r\n]/.test(path)) {
      throw Error('invalid_order_operations_path');
    }
    const token = await getAccessToken();
    if (typeof token !== 'string' || token.length < 16 ||
        token.length > 16384 || /[^A-Za-z0-9._~-]/.test(token)) {
      throw Error('order_operations_auth_unavailable');
    }
    if (controller.signal.aborted) throw Error('order_operations_auth_unavailable');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const requestController = new AbortController();
    const abort = () => requestController.abort();
    controller.signal.addEventListener('abort', abort, {once: true});
    options.signal?.addEventListener('abort', abort, {once: true});
    if (controller.signal.aborted || options.signal?.aborted) abort();
    try {
      if (requestController.signal.aborted) throw Error('order_operations_auth_unavailable');
      return await fetchImpl(path, {
        ...options, credentials: 'omit', redirect: 'error',
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
  const subscriptions = new Set();
  return Object.freeze({
    ...gateway,
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
