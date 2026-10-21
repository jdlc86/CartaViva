import { hashCustomerSessionToken } from './customer-session.mjs';

// Backend-only verification. Caller must provide a restricted backend query
// capability; no browser role can query sabora.customer_sessions.
const SESSION_LOOKUP_SQL = `SELECT customer_id, public_id, alias, company FROM sabora.verify_customer_session_hash($1::bytea)`;

export function createCustomerSessionVerifier({ query } = {}) {
  if (typeof query !== 'function') throw Error('invalid_customer_session_query');
  return async function verifyCustomerSession(token) {
    const hash = hashCustomerSessionToken(token);
    if (!hash) return null;
    const result = await query(SESSION_LOOKUP_SQL, [hash]);
    if (!result || !Array.isArray(result.rows) || result.rows.length > 1) {
      throw Error('invalid_customer_session_result');
    }
    const customer = result.rows[0];
    if (!customer) return null;
    if (typeof customer.customer_id !== 'string' ||
        typeof customer.public_id !== 'string' || typeof customer.alias !== 'string') {
      throw Error('invalid_customer_session_result');
    }
    return {
      customerId: customer.customer_id,
      publicId: customer.public_id,
      alias: customer.alias,
      company: customer.company ?? null
    };
  };
}

export { SESSION_LOOKUP_SQL };
