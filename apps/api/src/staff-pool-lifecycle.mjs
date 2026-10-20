import { readStaffPoolConfig } from './staff-pool-config.mjs';

// Dependency-injected driver; importing this module never opens a connection.
export function createStaffPoolLifecycle({ Pool, env, observe = () => {} } = {}) {
  if (typeof observe !== 'function') throw new Error('invalid_staff_pool_observer');
  if (typeof Pool !== 'function') throw new Error('invalid_staff_pool_driver');
  const config = readStaffPoolConfig(env);
  let pool = null;
  let closing = null;
  let terminal = false;
  const signal = event => { try { observe(event); } catch { /* non-fatal diagnostics */ } };

  return Object.freeze({
    open() {
      if (terminal || closing) throw new Error('staff_pool_closing');
      if (pool) return pool;
      // A failed constructor must never be retried on the same lifecycle.
      terminal = true;
      let candidate;
      try { candidate = new Pool(config); }
      catch (error) { signal('staff_pool_open_failed'); throw error; }
      if (!candidate || typeof candidate.query !== 'function' ||
          typeof candidate.end !== 'function') {
        // An invalid driver cannot be safely used. If it has an end method,
        // schedule cleanup without leaking a rejected promise.
        if (candidate && typeof candidate.end === 'function') {
          Promise.resolve().then(() => candidate.end()).catch(() => {});
        }
        signal('staff_pool_invalid');
        throw new Error('invalid_staff_pool_instance');
      }
      pool = candidate;
      terminal = false;
      signal('staff_pool_opened');
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
        signal('staff_pool_closed');
      } catch (error) {
        signal('staff_pool_close_failed');
        throw error;
      } finally {
        pool = null;
      }
    },
    get isOpen() { return pool !== null && !terminal && closing === null; }
  });
}
