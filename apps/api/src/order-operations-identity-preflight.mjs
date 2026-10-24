// Explicit opt-in startup gate. Never provisions users, grants or connections.
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

function validateRole(role) {
  if (typeof role !== 'string' || !ROLE_NAME.test(role) ||
      role === 'postgres' || role === 'anon' || role === 'authenticated' ||
      role === 'service_role' || role === 'public') {
    throw Error('invalid_order_operations_sql_identity');
  }
  return role;
}

async function inspect(pool, expectedRole) {
  if (!pool || typeof pool.connect !== 'function') throw Error('invalid_order_operations_sql_pool');
  const client = await pool.connect();
  if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
    if (typeof client?.release === 'function') client.release(Error('invalid_order_operations_sql_client'));
    throw Error('invalid_order_operations_sql_client');
  }
  let discard = null;
  try {
    const result = await client.query(
      `SELECT current_user::text AS current_role,
              session_user::text AS session_role,
              role.rolsuper AS superuser,
              role.rolbypassrls AS bypass_rls,
              role.rolcanlogin AS can_login,
              role.rolinherit AS inherits_roles,
              role.rolcreaterole AS can_create_role,
              role.rolcreatedb AS can_create_db,
              role.rolreplication AS can_replicate,
              role.rolconnlimit AS connection_limit,
              role.rolvaliduntil AS password_valid_until,
              has_schema_privilege(current_user, 'sabora', 'USAGE') AS schema_usage,
              has_schema_privilege(current_user, 'sabora', 'CREATE') AS schema_create,
              has_function_privilege(current_user,
                'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)',
                'EXECUTE') AS candidate_rpc_execute,
              EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members membership
                 WHERE membership.member = role.oid
              ) AS has_role_memberships
         FROM pg_catalog.pg_roles role
        WHERE role.rolname = current_user`
    );
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      throw Error('order_operations_sql_identity_rejected');
    }
    const row = result.rows[0];
    if (row.current_role !== expectedRole || row.session_role !== expectedRole ||
        row.superuser !== false || row.bypass_rls !== false || row.can_login !== true ||
        row.inherits_roles !== false || row.can_create_role !== false ||
        row.can_create_db !== false || row.can_replicate !== false ||
        row.has_role_memberships !== false ||
        row.schema_usage !== true || row.schema_create !== false ||
        row.candidate_rpc_execute !== false ||
        !Number.isSafeInteger(row.connection_limit) || row.connection_limit < -1 ||
        (row.password_valid_until !== null &&
          (!(row.password_valid_until instanceof Date) ||
            !Number.isFinite(row.password_valid_until.getTime())))) {
      throw Error('order_operations_sql_identity_rejected');
    }
    return Object.freeze({role: expectedRole});
  } catch (error) {
    discard = error;
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function preflightOrderOperationsIdentities({
  staffPool, operationsPool, staffRole, operationsRole,
} = {}) {
  validateRole(staffRole);
  validateRole(operationsRole);
  if (staffRole === operationsRole || !staffPool || !operationsPool ||
      staffPool === operationsPool) throw Error('invalid_order_operations_pool_isolation');
  // Both roles must be separate, non-superuser, non-BYPASSRLS LOGIN identities.
  // This is a prerequisite, not a replacement for explicit table grants/RLS.
  const staff = await inspect(staffPool, staffRole);
  const operations = await inspect(operationsPool, operationsRole);
  return Object.freeze({staff, operations});
}
