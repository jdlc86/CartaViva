// Transaction-scoped administrative write boundary. The transaction adapter MUST
// provide a single PostgreSQL connection and commit/rollback the whole callback.
// This is not an HTTP endpoint or a grant of SQL privileges.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createTransactionalAdminWrite({ withTransaction } = {}) {
  if (typeof withTransaction !== 'function') throw Error('invalid_transaction_config');
  return async function performAdminWrite({ verifiedIdentity, mutate } = {}) {
    if (!verifiedIdentity || typeof verifiedIdentity.userId !== 'string' ||
        !UUID.test(verifiedIdentity.userId) || typeof mutate !== 'function') {
      return { error: 'forbidden' };
    }
    return withTransaction(async query => {
      if (typeof query !== 'function') throw Error('invalid_transaction_query');
      // Same connection and transaction for lock, actor revalidation and mutation.
      const ownership = await query(
        'select owner_user_id from sabora.admin_write_ownership where singleton = true for update', []
      );
      if (!ownership || ownership.rows?.length !== 1) throw Error('ownership_unavailable');
      const staff = await query(
        'select role, state from sabora.staff_members where user_id = $1 for update',
        [verifiedIdentity.userId]
      );
      if (!staff || staff.rows?.length !== 1) return { error: 'forbidden' };
      const { role, state } = staff.rows[0];
      if (state !== 'active' || !['root', 'admin'].includes(role)) return { error: 'forbidden' };
      const owner = ownership.rows[0].owner_user_id;
      if (role === 'admin' && (typeof owner !== 'string' ||
          owner.toLowerCase() !== verifiedIdentity.userId.toLowerCase())) {
        return { error: 'write_ownership_required' };
      }
      return mutate(query, Object.freeze({ userId: verifiedIdentity.userId, role }));
    });
  };
}
