// Read-only adapter. The supplied query must run with a separately provisioned,
// least-privileged backend identity; never use an anon/authenticated browser client.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const STATES = new Set(['invited', 'active', 'suspended', 'revoked']);

export function createPostgresStaffLookup({ query } = {}) {
  if (typeof query !== 'function') throw new Error('invalid_staff_lookup_config');

  return async function lookupStaff(userId) {
    if (typeof userId !== 'string' || !UUID.test(userId)) throw new Error('invalid_verified_user_id');
    const result = await query(
      'select role, state from sabora.staff_members where user_id = $1',
      [userId]
    );
    if (!result || !Array.isArray(result.rows) || result.rows.length > 1) {
      throw new Error('invalid_staff_lookup_result');
    }
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (!row || !ROLES.has(row.role) || !STATES.has(row.state)) {
      throw new Error('invalid_staff_membership');
    }
    return Object.freeze({ role: row.role, state: row.state });
  };
}
