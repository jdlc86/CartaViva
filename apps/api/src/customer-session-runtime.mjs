import { readCustomerSessionPoolConfig } from './customer-session-pool-config.mjs';
import { createCustomerSessionQueryBoundary } from './customer-session-query-boundary.mjs';
import { createCustomerSessionVerifier } from './customer-session-verifier.mjs';
import { createCustomerSessionRevoker } from './customer-session-revoker.mjs';

// Not wired into server.mjs. Driver injection avoids accidental connections.
export function createCustomerSessionRuntime({ Pool, env } = {}) {
  if (typeof Pool !== 'function') throw Error('invalid_customer_session_driver');
  const config = readCustomerSessionPoolConfig(env);
  let pool = null;
  let closed = false;
  return Object.freeze({
    open() {
      if (closed) throw Error('customer_session_runtime_closed');
      if (pool) return pool;
      const candidate = new Pool(config);
      if (!candidate || typeof candidate.query !== 'function' || typeof candidate.end !== 'function') {
        closed = true;
        if (candidate && typeof candidate.end === 'function') {
          Promise.resolve().then(() => candidate.end()).catch(() => {});
        }
        throw Error('invalid_customer_session_pool');
      }
      pool = candidate;
      return pool;
    },
    createOperations() {
      const activePool = this.open();
      const query = createCustomerSessionQueryBoundary({pool:activePool});
      return Object.freeze({
        verify: createCustomerSessionVerifier({query}),
        revoke: createCustomerSessionRevoker({query})
      });
    },
    async close() {
      closed = true;
      const activePool = pool;
      pool = null;
      if (activePool) await activePool.end();
    }
  });
}
