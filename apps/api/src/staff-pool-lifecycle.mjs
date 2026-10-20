import { readStaffPoolConfig } from './staff-pool-config.mjs';

// Dependency-injected driver; importing this module never opens a connection.
export function createStaffPoolLifecycle({ Pool, env } = {}) {
  if (typeof Pool !== 'function') throw new Error('invalid_staff_pool_driver');
  const config = readStaffPoolConfig(env);
  let pool = null;
  let closing = null;
  let terminal = false;

  return Object.freeze({
    open() {
      if (terminal || closing) throw new Error('staff_pool_closing');
      if (pool) return pool;
      // A failed constructor must never be retried on the same lifecycle.
      terminal = true;
      const candidate = new Pool(config);
      if (!candidate || typeof candidate.query !== 'function' ||
          typeof candidate.end !== 'function') {
        // An invalid driver cannot be safely used. If it has an end method,
        // schedule cleanup without leaking a rejected promise.
        if (candidate && typeof candidate.end === 'function') {
          Promise.resolve().then(() => candidate.end()).catch(() => {});
        }
        throw new Error('invalid_staff_pool_instance');
      }
      pool = candidate;
      terminal = false;
      return pool;
    },
    async close() {
      terminal = true;
      if (closing) return closing;
      if (!pool) return;
      const current = pool;
      closing = Promise.resolve().then(() => current.end());
      try {
        await closing;
      } finally {
        pool = null;
      }
    },
    get isOpen() { return pool !== null && !terminal && closing === null; }
  });
}
