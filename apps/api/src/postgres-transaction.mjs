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
    try {
      await client.query('BEGIN');
      began = true;
      active = true;
      const result = await work(async (sql, parameters = []) => {
        if (!active) throw Error('transaction_scope_closed');
        const operation = Promise.resolve().then(() => client.query(sql, parameters));
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
      active = false;
      // A failed BEGIN or COMMIT may leave the connection state uncertain.
      // Never return an uncertain connection to the pool.
      if (!began || commitAttempted) discardClient = error;
      // Detached operations must settle before ROLLBACK/release can reuse this connection.
      if (inFlight.size !== 0) {
        discardClient = error;
        await Promise.allSettled([...inFlight]);
      }
      if (began && !committed) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) {
          discardClient = rollbackError;
          if (error && typeof error === 'object') error.rollbackError = rollbackError;
        }
      }
      throw error;
    } finally {
      active = false;
      client.release(discardClient || undefined);
    }
  };
}
