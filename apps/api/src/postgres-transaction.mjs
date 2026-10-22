// All statements and row locks execute on one checked-out PostgreSQL client.
// The pool must be a dedicated backend identity, never browser/anon credentials.
export function createPostgresTransaction({ pool } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw Error('invalid_transaction_pool');
  return async function withTransaction(work) {
    if (typeof work !== 'function') throw Error('invalid_transaction_callback');
    const client = await pool.connect();
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
      throw Error('invalid_transaction_client');
    }
    let active = false;
    let began = false;
    let committed = false;
    let commitAttempted = false;
    let discardClient = null;
    try {
      await client.query('BEGIN');
      began = true;
      active = true;
      const result = await work((sql, parameters = []) => {
        if (!active) throw Error('transaction_scope_closed');
        return client.query(sql, parameters);
      });
      active = false;
      commitAttempted = true;
      await client.query('COMMIT');
      committed = true;
      return result;
    } catch (error) {
      active = false;
      // A failed BEGIN or COMMIT may leave the connection state uncertain.
      // Never return an uncertain connection to the pool.
      if (!began || commitAttempted) discardClient = error;
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
