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
            !Array.isArray(parameters)) throw Error('invalid_transaction_query');
        // Snapshot parameter bindings before the deferred driver invocation;
        // a caller must not be able to swap values after handing off SQL.
        const boundParameters = parameters.slice();
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
