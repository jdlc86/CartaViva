import {createOrderOperationsGateway} from './order-operations-gateway.js';

// Explicit opt-in transport. The host authentication layer owns token
// acquisition and renewal; never persist credentials in browser storage.
export function createAuthenticatedOrderOperationsGateway({
  getAccessToken, fetchImpl = globalThis.fetch, reconnectDelayMs,
} = {}) {
  if (typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function') {
    throw Error('invalid_order_operations_auth_transport');
  }
  const send = async (path, options = {}) => {
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
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetchImpl(path, {
      ...options, credentials: 'omit', redirect: 'error',
      cache: 'no-store', headers,
    });
  };
  return createOrderOperationsGateway({send, reconnectDelayMs});
}
