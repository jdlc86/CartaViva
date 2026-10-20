import { createStaffPoolLifecycle } from './staff-pool-lifecycle.mjs';
import { createStaffProtectedHooksFromPool } from './staff-protected-hooks-from-pool.mjs';
import { createStaffPoolObserver } from './staff-pool-observer.mjs';

// Offline bootstrap boundary: caller supplies driver, TLS configuration,
// JWT verifier, key provider and a structured event sink. No routes are added.
// A single owner controls the connection lifecycle and HTTP hooks together.
export function createStaffAuthorizationRuntime({
  Pool, env, issuer, getTrustedKeys, verify, emit = () => {}
} = {}) {
  const observe = createStaffPoolObserver({ emit });
  const lifecycle = createStaffPoolLifecycle({ Pool, env, observe });
  let hooks = null;

  return Object.freeze({
    async open() {
      if (hooks) {
        if (!lifecycle.isOpen) throw new Error('staff_pool_closing');
        return hooks;
      }
      const pool = lifecycle.open();
      try {
        hooks = createStaffProtectedHooksFromPool({
          pool, issuer, getTrustedKeys, verify, observe
        });
      } catch (error) {
        // Always terminate the pool when composition cannot finish.
        try { await lifecycle.close(); } catch { /* preserve original error */ }
        throw error;
      }
      return hooks;
    },
    close: () => lifecycle.close(),
    get isOpen() { return lifecycle.isOpen; }
  });
}
