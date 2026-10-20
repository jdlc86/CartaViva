import { readStaffPoolConfig } from './staff-pool-config.mjs';

// Inject the driver constructor so unit tests never need network access.
// Opening is explicit; no pool is created during module import.
export function createStaffPoolLifecycle({ Pool, env } = {}) {
  if (typeof Pool !== 'function') throw new Error('invalid_staff_pool_driver');
  const config = readStaffPoolConfig(env);
  let pool = null;
  let closing = null;

  return Object.freeze({
    open() {
      if (closing) throw new Error('staff_pool_closing');
      if (pool) return pool;
      pool = new Pool(config);
      if (!pool || typeof pool.query !== 'function' || typeof pool.end !== 'function') {
        pool = null;
        throw new Error('invalid_staff_pool_instance');
      }
      return pool;
    },
    async close() {
      if (closing) return closing;
      if (!pool) return;
      const current = pool;
      closing = Promise.resolve().then(() => current.end());
      try {
        await closing;
      } finally {
        pool = null;
        // A closed lifecycle is terminal; never reopen a pool after shutdown.
      }
    },
    get isOpen() { return pool !== null && closing === null; }
  });
}
