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
    if (typeof client?.release === 'function') {
      try { client.release(Error('invalid_order_operations_sql_client')); }
      catch { /* Preserve the malformed-client error. */ }
    }
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
              has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
              has_function_privilege(current_user,
                'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)',
                'EXECUTE') AS candidate_rpc_execute,
              (SELECT count(*)::integer FROM pg_catalog.pg_class resource
                JOIN pg_catalog.pg_namespace ns ON ns.oid = resource.relnamespace
                WHERE ns.nspname = 'sabora'
                  AND resource.relkind IN ('r','p','v','m','f')
                  AND (has_table_privilege(current_user, resource.oid, 'SELECT')
                    OR has_table_privilege(current_user, resource.oid, 'INSERT')
                    OR has_table_privilege(current_user, resource.oid, 'UPDATE')
                    OR has_table_privilege(current_user, resource.oid, 'DELETE')
                    OR has_table_privilege(current_user, resource.oid, 'TRUNCATE')
                    OR has_table_privilege(current_user, resource.oid, 'REFERENCES')
                    OR has_table_privilege(current_user, resource.oid, 'TRIGGER')
                    OR has_any_column_privilege(current_user, resource.oid, 'SELECT')
                    OR has_any_column_privilege(current_user, resource.oid, 'INSERT')
                    OR has_any_column_privilege(current_user, resource.oid, 'UPDATE')
                    OR has_any_column_privilege(current_user, resource.oid, 'REFERENCES')))
                AS accessible_private_tables,
              (SELECT count(*)::integer FROM pg_catalog.pg_class resource
                JOIN pg_catalog.pg_namespace ns ON ns.oid = resource.relnamespace
                WHERE ns.nspname = 'sabora'
                  AND resource.relkind = 'S'
                  AND (has_sequence_privilege(current_user, resource.oid, 'USAGE')
                    OR has_sequence_privilege(current_user, resource.oid, 'SELECT')
                    OR has_sequence_privilege(current_user, resource.oid, 'UPDATE')))
                AS accessible_private_sequences,
              (SELECT count(*)::integer FROM pg_catalog.pg_proc routine
                JOIN pg_catalog.pg_namespace ns ON ns.oid = routine.pronamespace
                WHERE ns.nspname = 'sabora'
                  AND routine.prosecdef
                  AND has_function_privilege(current_user, routine.oid, 'EXECUTE'))
                AS accessible_private_definer_routines,
              (SELECT NOT routine.prosecdef
                 FROM pg_catalog.pg_proc routine
                WHERE routine.oid =
                  'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)'::regprocedure
              ) AS candidate_is_invoker,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_class resource
                 JOIN pg_catalog.pg_namespace ns ON ns.oid = resource.relnamespace
                WHERE ns.nspname = 'sabora'
                  AND resource.relname = 'order_line_transition_requests'
                  AND resource.relkind IN ('r','p')
                  AND resource.relrowsecurity
                  AND resource.relforcerowsecurity
              ) AS forced_rls_transition_requests,
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
        row.database_create !== false ||
        row.candidate_rpc_execute !== false ||
        row.candidate_is_invoker !== true ||
        row.forced_rls_transition_requests !== 1 ||
        !Number.isSafeInteger(row.accessible_private_tables) ||
        row.accessible_private_tables !== 0 ||
        row.accessible_private_sequences !== 0 ||
        !Number.isSafeInteger(row.accessible_private_sequences) ||
        row.accessible_private_definer_routines !== 0 ||
        !Number.isSafeInteger(row.accessible_private_definer_routines) ||
        !Number.isSafeInteger(row.connection_limit) || row.connection_limit === 0 || row.connection_limit < -1 ||
        (row.password_valid_until !== null &&
          (!(row.password_valid_until instanceof Date) ||
            !Number.isFinite(row.password_valid_until.getTime()) ||
            row.password_valid_until.getTime() <= Date.now()))) {
      throw Error('order_operations_sql_identity_rejected');
    }
    return Object.freeze({role: expectedRole});
  } catch (error) {
    discard = error;
    throw error;
  } finally {
    try { client.release(discard); }
    catch (releaseError) {
      // A failed inspection must retain its original cause. A successful
      // inspection with a failed release is never accepted as healthy.
      if (!discard) throw releaseError;
      if (discard && typeof discard === 'object') {
        try { discard.releaseError = releaseError; }
        catch { /* Preserve immutable SQL errors. */ }
      }
    }
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
