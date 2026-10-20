// The caller supplies a dedicated PostgreSQL pool (not a browser credential).
// Never issue BEGIN and subsequent queries through pool.query: a single checked
// out connection is required for row locks and rollback to be meaningful.
export function createPostgresTransaction({ pool } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw Error('invalid_transaction_pool');
  return async function withTransaction(work) {
    if (typeof work !== 'function') throw Error('invalid_transaction_callback');
    const client = await pool.connect();
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
      throw Error('invalid_transaction_client');
    }
    let began = false;
    try {
      await client.query('BEGIN');
      began = true;
      const result = await work((sql, parameters=[]) => client.query(sql, parameters));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (began) {
        try { await client.query('ROLLBACK'); }
        catch (rollbackError) { error.rollbackError = rollbackError; }
      }
      throw error;
    } finally {
      client.release();
    }
  };
}
