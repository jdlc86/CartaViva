// All statements and row locks execute on one checked-out PostgreSQL client.
// The pool must be a dedicated backend identity, never browser/anon credentials.
export function createPostgresTransaction({ pool } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw Error('invalid_transaction_pool');
  return async function withTransaction(work) {
    if (typeof work !== 'function') throw Error('invalid_transaction_callback');
    const client = await pool.connect();
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
      // A pool may return a malformed client. If it has a release method,
      // discard it before rejecting: otherwise a checked-out connection leaks.
      if (client && typeof client.release === 'function') {
        try { client.release(Error('invalid_transaction_client')); }
        catch { /* Preserve the invalid-client error; no SQL has run. */ }
      }
      throw Error('invalid_transaction_client');
    }
    const inFlight = new Set();
    let active = false;
    let began = false;
    let committed = false;
    let commitAttempted = false;
    let discardClient = null;
    let workError = null;
    let hasWorkError = false;
    try {
      await client.query('BEGIN');
      began = true;
      active = true;
      const result = await work(async (sql, parameters = []) => {
        if (!active) throw Error('transaction_scope_closed');
        // The candidate exposes only parameterized text statements, never
        // pg query-config objects or mutable/non-array parameter containers.
        if (typeof sql !== 'string' || sql.trim().length === 0 ||
            sql.includes('\u0000') || Buffer.byteLength(sql, 'utf8') > 65536 ||
            !Array.isArray(parameters)) throw Error('invalid_transaction_query');
        // Snapshot parameter bindings before the deferred driver invocation;
        // a caller must not be able to swap values after handing off SQL.
        // Reject accessor-backed arrays before reading values: Array#map
        // would otherwise invoke attacker-controlled getters.
        if (Reflect.ownKeys(parameters).length !== parameters.length + 1 ||
            parameters.length > 256 ||
            Object.getPrototypeOf(parameters) !== Array.prototype)
          throw Error('invalid_transaction_query');
        for (let index = 0; index < parameters.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(parameters, String(index));
          if (!descriptor || !Object.hasOwn(descriptor, 'value'))
            throw Error('invalid_transaction_query');
        }
        const boundParameters = parameters.map(value => {
          // The order writer passes a PostgreSQL timestamp as a Date. Copy it
          // too: cloning only the outer array would leave mutable timestamps.
          if (value instanceof Date) {
            const milliseconds = Date.prototype.getTime.call(value);
            if (!Number.isFinite(milliseconds)) throw Error('invalid_transaction_query');
            return new Date(milliseconds);
          }
          // The current candidate SQL binds primitives and Date only. Reject
          // arbitrary objects (including buffers, arrays and driver hooks)
          // rather than passing mutable user-owned references to pg.
          if (value !== null && typeof value === 'object')
            throw Error('invalid_transaction_query');
          if (typeof value === 'string' &&
              (Buffer.byteLength(value, 'utf8') > 65536 || value.includes('\u0000')))
            throw Error('invalid_transaction_query');
          if (typeof value === 'function' || typeof value === 'symbol' ||
              typeof value === 'bigint' ||
              (typeof value === 'number' && !Number.isSafeInteger(value)))
            throw Error('invalid_transaction_query');
          return value;
        });
        const operation = Promise.resolve().then(() => client.query(sql, boundParameters));
        inFlight.add(operation);
        try { return await operation; }
        finally { inFlight.delete(operation); }
      });
      active = false;
      if (inFlight.size !== 0) throw Error('transaction_queries_not_awaited');
      commitAttempted = true;
      await client.query('COMMIT');
      committed = true;
      return result;
    } catch (error) {
      workError = error;
      hasWorkError = true;
      active = false;
      // A failed BEGIN or COMMIT may leave the connection state uncertain.
      // Never return an uncertain connection to the pool.
      if (!began || commitAttempted) discardClient = error;
      // Detached operations must settle before ROLLBACK/release can reuse this connection.
      if (inFlight.size !== 0) {
        discardClient = error;
        // A detached query can schedule more queries before it settles.
        // Drain the entire set, not just its first snapshot, before rollback.
        while (inFlight.size !== 0) {
          await Promise.allSettled([...inFlight]);
        }
      }
      if (began && !committed) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) {
          discardClient = rollbackError;
          if (error && typeof error === 'object') {
            try { error.rollbackError = rollbackError; }
            catch { /* Preserve immutable original errors. */ }
          }
        }
      }
      throw error;
    } finally {
      active = false;
      try {
        client.release(discardClient || undefined);
      } catch (releaseError) {
        // A release failure must not replace the original SQL/COMMIT error.
        // On a successful COMMIT it is still a failure, never report success.
        if (hasWorkError) {
          if (workError && typeof workError === 'object') {
            try { workError.releaseError = releaseError; }
            catch { /* Preserve immutable original errors. */ }
          }
        } else {
          throw releaseError;
        }
      }
    }
  };
}
