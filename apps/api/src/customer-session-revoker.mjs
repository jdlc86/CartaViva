import { hashCustomerSessionToken } from './customer-session.mjs';

// Server-side revocation only. No token is stored in plaintext, and no public
// identifier can be used to revoke another customer's session.
export function createCustomerSessionRevoker({ query } = {}) {
  if (typeof query !== 'function') throw Error('invalid_customer_session_query');
  return async function revokeCustomerSession(token) {
    const tokenHash = hashCustomerSessionToken(token);
    if (!tokenHash) return false;
    const result = await query(
      `UPDATE sabora.customer_sessions
       SET revoked_at = now()
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > now()
       RETURNING id`,
      [tokenHash]
    );
    if (!result || !Number.isSafeInteger(result.rowCount) || result.rowCount < 0 || result.rowCount > 1) {
      throw Error('invalid_customer_revocation_result');
    }
    return result.rowCount === 1;
  };
}
