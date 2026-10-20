// Explicit, low-cardinality pool lifecycle diagnostics. No exception messages,
// SQL, environment variables, connection strings or credentials are logged.
const EVENTS = new Set([
  'staff_pool_opened',
  'staff_pool_open_failed',
  'staff_pool_invalid',
  'staff_pool_closed',
  'staff_pool_close_failed'
]);

export function createStaffPoolObserver({ emit } = {}) {
  if (typeof emit !== 'function') throw new Error('invalid_staff_pool_observer');
  return function observe(event) {
    if (!EVENTS.has(event)) throw new Error('invalid_staff_pool_event');
    try {
      emit(Object.freeze({ component: 'staff_reader_pool', event }));
    } catch {
      // Diagnostics must never alter authorization or cleanup behavior.
    }
  };
}
