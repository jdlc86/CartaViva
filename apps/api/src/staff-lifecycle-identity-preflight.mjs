const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

function validRole(role) {
  if (typeof role !== 'string' || !ROLE_NAME.test(role) ||
      ['postgres', 'anon', 'authenticated', 'service_role', 'public'].includes(role)) {
    throw Error('invalid_staff_lifecycle_sql_identity');
  }
  return role;
}

export async function preflightStaffLifecycleIdentity({pool, role} = {}) {
  const expectedRole = validRole(role);
  if (!pool || typeof pool.connect !== 'function') {
    throw Error('invalid_staff_lifecycle_sql_pool');
  }
  const client = await pool.connect();
  if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
    if (typeof client?.release === 'function') {
      client.release(Error('invalid_staff_lifecycle_sql_client'));
    }
    throw Error('invalid_staff_lifecycle_sql_client');
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
              has_schema_privilege(current_user,'sabora','USAGE') AS schema_usage,
              has_schema_privilege(current_user,'sabora','CREATE') AS schema_create,
              has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
              has_function_privilege(current_user,
                'sabora.transition_staff_lifecycle_with_directory_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)',
                'EXECUTE') AS lifecycle_execute,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_class resource
                 JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
                WHERE ns.nspname='sabora'
                  AND resource.relkind IN ('r','p','v','m','f')
                  AND (has_table_privilege(current_user,resource.oid,'SELECT')
                    OR has_table_privilege(current_user,resource.oid,'INSERT')
                    OR has_table_privilege(current_user,resource.oid,'UPDATE')
                    OR has_table_privilege(current_user,resource.oid,'DELETE')
                    OR has_table_privilege(current_user,resource.oid,'TRUNCATE')
                    OR has_table_privilege(current_user,resource.oid,'REFERENCES')
                    OR has_table_privilege(current_user,resource.oid,'TRIGGER')
                    OR has_any_column_privilege(current_user,resource.oid,'SELECT')
                    OR has_any_column_privilege(current_user,resource.oid,'INSERT')
                    OR has_any_column_privilege(current_user,resource.oid,'UPDATE')
                    OR has_any_column_privilege(current_user,resource.oid,'REFERENCES'))
              ) AS accessible_private_tables,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_class resource
                 JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
                WHERE ns.nspname='sabora' AND resource.relkind='S'
                  AND (has_sequence_privilege(current_user,resource.oid,'USAGE')
                    OR has_sequence_privilege(current_user,resource.oid,'SELECT')
                    OR has_sequence_privilege(current_user,resource.oid,'UPDATE'))
              ) AS accessible_private_sequences,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_proc routine
                 JOIN pg_catalog.pg_namespace ns ON ns.oid=routine.pronamespace
                WHERE ns.nspname='sabora' AND routine.prosecdef
                  AND has_function_privilege(current_user,routine.oid,'EXECUTE')
              ) AS accessible_private_definer_routines,
              (SELECT routine.prosecdef
                 FROM pg_catalog.pg_proc routine
                WHERE routine.oid=
                  'sabora.transition_staff_lifecycle_with_directory_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)'::regprocedure
              ) AS lifecycle_is_definer,
              (SELECT owner.rolname
                 FROM pg_catalog.pg_proc routine
                 JOIN pg_catalog.pg_roles owner ON owner.oid=routine.proowner
                WHERE routine.oid=
                  'sabora.transition_staff_lifecycle_with_directory_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)'::regprocedure
              ) AS lifecycle_owner,
              (SELECT routine.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
                 FROM pg_catalog.pg_proc routine
                WHERE routine.oid=
                  'sabora.transition_staff_lifecycle_with_directory_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text)'::regprocedure
              ) AS lifecycle_search_path_locked,
              (SELECT owner.rolcanlogin=false AND owner.rolinherit=false
                      AND owner.rolsuper=false AND owner.rolbypassrls=false
                      AND owner.rolcreatedb=false AND owner.rolcreaterole=false
                      AND owner.rolreplication=false
                 FROM pg_catalog.pg_roles owner
                WHERE owner.rolname='sabora_staff_directory_fn_owner'
              ) AS lifecycle_owner_is_sealed,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_auth_members membership
                 JOIN pg_catalog.pg_roles owner
                   ON owner.oid=membership.roleid OR owner.oid=membership.member
                WHERE owner.rolname='sabora_staff_directory_fn_owner'
              ) AS lifecycle_owner_memberships,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_class resource
                 JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
                WHERE ns.nspname='sabora'
                  AND resource.relname IN (
                    'staff_enrollments','staff_lifecycle_requests',
                    'staff_lifecycle_audit','staff_lifecycle_signing_keys',
                    'staff_employee_code_pool','staff_employee_code_events',
                    'staff_identity_requests','staff_code_maintenance_requests',
                    'staff_directory_contacts'
                  )
                  AND resource.relkind IN ('r','p')
                  AND resource.relrowsecurity AND resource.relforcerowsecurity
              ) AS forced_rls_lifecycle_tables,
              EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership
                WHERE membership.member=role.oid) AS has_role_memberships
         FROM pg_catalog.pg_roles role
        WHERE role.rolname=current_user`
    );
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      throw Error('staff_lifecycle_sql_identity_rejected');
    }
    const row = result.rows[0];
    if (row.current_role !== expectedRole || row.session_role !== expectedRole ||
        row.superuser !== false || row.bypass_rls !== false || row.can_login !== true ||
        row.inherits_roles !== false || row.can_create_role !== false ||
        row.can_create_db !== false || row.can_replicate !== false ||
        row.schema_usage !== true || row.schema_create !== false ||
        row.database_create !== false || row.lifecycle_execute !== true ||
        row.accessible_private_tables !== 0 || row.accessible_private_sequences !== 0 ||
        row.accessible_private_definer_routines !== 1 ||
        row.lifecycle_is_definer !== true ||
        row.lifecycle_owner !== 'sabora_staff_directory_fn_owner' ||
        row.lifecycle_search_path_locked !== true || row.lifecycle_owner_is_sealed !== true ||
        row.lifecycle_owner_memberships !== 0 || row.forced_rls_lifecycle_tables !== 9 ||
        row.has_role_memberships !== false ||
        !Number.isSafeInteger(row.accessible_private_tables) ||
        !Number.isSafeInteger(row.accessible_private_sequences) ||
        !Number.isSafeInteger(row.accessible_private_definer_routines) ||
        !Number.isSafeInteger(row.lifecycle_owner_memberships) ||
        !Number.isSafeInteger(row.forced_rls_lifecycle_tables)) {
      throw Error('staff_lifecycle_sql_identity_rejected');
    }
    return Object.freeze({role: expectedRole});
  } catch (error) {
    discard = error;
    throw error;
  } finally {
    client.release(discard);
  }
}
