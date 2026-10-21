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
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customer.customer_id) ||
        typeof customer.public_id !== 'string' || !/^SB-[23456789ABCDEFGHJKLMNPQRSTUVWXY]{12}$/.test(customer.public_id) ||
        typeof customer.alias !== 'string' || !customer.alias.trim() ||
        [...customer.alias].length > 80 || /[\u0000-\u001f\u007f]/u.test(customer.alias) ||
        (customer.company != null && (typeof customer.company !== 'string' ||
         [...customer.company].length > 160 || /[\u0000-\u001f\u007f]/u.test(customer.company)))) {
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
