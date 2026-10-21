import { hashCustomerSessionToken } from './customer-session.mjs';
import { SESSION_REVOKE_SQL } from './customer-session-query-boundary.mjs';

// Server-side revocation only. No token is stored in plaintext, and no public
// identifier can be used to revoke another customer's session.
export function createCustomerSessionRevoker({ query } = {}) {
  if (typeof query !== 'function') throw Error('invalid_customer_session_query');
  return async function revokeCustomerSession(token) {
    const tokenHash = hashCustomerSessionToken(token);
    if (!tokenHash) return false;
    const result = await query(SESSION_REVOKE_SQL, [tokenHash]);
    if (!result || !Number.isSafeInteger(result.rowCount) || result.rowCount < 0 || result.rowCount > 1) {
      throw Error('invalid_customer_revocation_result');
    }
    return result.rowCount === 1;
  };
}
