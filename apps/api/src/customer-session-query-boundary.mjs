import { SESSION_LOOKUP_SQL } from './customer-session-verifier.mjs';

// This is a query-level boundary, NOT a substitute for a least-privilege
// PostgreSQL role. Its pool must never be reachable from the browser.
export const SESSION_REVOKE_SQL = `UPDATE sabora.customer_sessions
       SET revoked_at = now()
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       RETURNING id`;

export function createCustomerSessionQueryBoundary({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') throw Error('invalid_customer_session_pool');
  return async function query(sql, parameters) {
    if (sql !== SESSION_LOOKUP_SQL && sql !== SESSION_REVOKE_SQL) {
      throw Error('customer_session_sql_not_allowed');
    }
    if (!Array.isArray(parameters) || parameters.length !== 1 ||
        !Buffer.isBuffer(parameters[0]) || parameters[0].length !== 32) {
      throw Error('invalid_customer_session_parameters');
    }
    return pool.query(sql, parameters);
  };
}
