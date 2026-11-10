import { SESSION_LOOKUP_SQL } from './customer-session-verifier.mjs';
import { SESSION_REVOKE_SQL } from './customer-session-query-boundary.mjs';

// Each RPC runs under a transaction-scoped PostgreSQL role. The LOGIN is
// NOINHERIT; plain pool.query() cannot invoke either restricted RPC.
// SET LOCAL prevents privileges leaking to the next pooled request.
export function createCustomerSessionScopedQuery({ pool } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw Error('invalid_customer_session_pool');
  return async function scopedQuery(sql, parameters) {
    if (sql !== SESSION_LOOKUP_SQL && sql !== SESSION_REVOKE_SQL) throw Error('customer_session_sql_not_allowed');
    if (!Array.isArray(parameters) || parameters.length !== 1 ||
        !Buffer.isBuffer(parameters[0]) || parameters[0].length !== 32) throw Error('invalid_customer_session_parameters');
    const client = await pool.connect();
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
      if (client && typeof client.release === 'function') {
        try { client.release(true); } catch { /* invalid connection is unusable */ }
      }
      throw Error('invalid_customer_session_client');
    }
    let began = false;
    let committed = false;
    try {
      await client.query('BEGIN');
      began = true;
      await client.query('SET LOCAL ROLE sabora_customer_session_runtime');
      const result = await client.query(sql,parameters);
      await client.query('COMMIT');
      committed = true;
      return result;
    } catch(error) {
      if (began && !committed) {
        try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      }
      throw error;
    } finally {
      // Discard uncertain connections rather than returning elevated or aborted state.
      try { client.release(!committed); }
      catch { /* do not replace the transaction error with cleanup failure */ }
    }
  };
}
