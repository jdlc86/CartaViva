// Read-only owner adapter. Its query identity must have separately provisioned
// least-privileged SELECT access; no browser, anon or authenticated credentials.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createPostgresOwnerLookup({ query } = {}) {
  if (typeof query !== 'function') throw new Error('invalid_owner_lookup_config');
  return async function lookupOwner() {
    const result = await query('select owner_user_id from sabora.admin_write_ownership where singleton = true', []);
    if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) {
      throw new Error('invalid_owner_lookup_result');
    }
    const id = result.rows[0]?.owner_user_id;
    if (id === null) return null; // Valid unassigned bootstrap state.
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error('invalid_owner_lookup_result');
    return id.toLowerCase();
  };
}
