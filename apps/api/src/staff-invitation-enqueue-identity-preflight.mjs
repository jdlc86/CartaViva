const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const INTEGRATED_ROUTINE =
  'sabora.transition_staff_lifecycle_with_outbox_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text)';
const LIFECYCLE_ROUTINE =
  'sabora.transition_staff_lifecycle_with_identity_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text)';

function validRole(role) {
  if (typeof role !== 'string' || !ROLE_NAME.test(role) ||
      ['postgres', 'anon', 'authenticated', 'service_role', 'public'].includes(role)) {
    throw Error('invalid_staff_invitation_enqueue_sql_identity');
  }
  return role;
}

export async function preflightStaffInvitationEnqueueIdentity({pool, role} = {}) {
  const expectedRole = validRole(role);
  if (!pool || typeof pool.connect !== 'function') {
    throw Error('invalid_staff_invitation_enqueue_sql_pool');
  }
  const client = await pool.connect();
  if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
    if (typeof client?.release === 'function') {
      client.release(Error('invalid_staff_invitation_enqueue_sql_client'));
    }
    throw Error('invalid_staff_invitation_enqueue_sql_client');
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
              has_function_privilege(current_user,$1,'EXECUTE') AS integrated_execute,
              has_function_privilege(current_user,$2,'EXECUTE') AS lifecycle_execute,
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
                 FROM pg_catalog.pg_proc routine WHERE routine.oid=$1::regprocedure
              ) AS integrated_is_definer,
              (SELECT owner.rolname
                 FROM pg_catalog.pg_proc routine
                 JOIN pg_catalog.pg_roles owner ON owner.oid=routine.proowner
                WHERE routine.oid=$1::regprocedure
              ) AS integrated_owner,
              (SELECT routine.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
                 FROM pg_catalog.pg_proc routine WHERE routine.oid=$1::regprocedure
              ) AS integrated_search_path_locked,
              (SELECT owner.rolcanlogin=false AND owner.rolinherit=false
                      AND owner.rolsuper=false AND owner.rolbypassrls=false
                      AND owner.rolcreatedb=false AND owner.rolcreaterole=false
                      AND owner.rolreplication=false
                 FROM pg_catalog.pg_roles owner
                WHERE owner.rolname='sabora_staff_invitation_enqueue_fn_owner'
              ) AS enqueue_owner_is_sealed,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_auth_members membership
                 JOIN pg_catalog.pg_roles owner
                   ON owner.oid=membership.roleid OR owner.oid=membership.member
                WHERE owner.rolname='sabora_staff_invitation_enqueue_fn_owner'
              ) AS enqueue_owner_memberships,
              (SELECT has_schema_privilege(owner.oid,'sabora','USAGE')
                      AND NOT has_schema_privilege(owner.oid,'sabora','CREATE')
                      AND has_function_privilege(owner.oid,$2,'EXECUTE')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','id','SELECT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','enrollment_id','SELECT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','invite_version','SELECT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','invite_token_hash','SELECT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','state','SELECT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','id','INSERT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','enrollment_id','INSERT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','invite_version','INSERT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','invite_token_hash','INSERT')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','state','UPDATE')
                      AND has_column_privilege(owner.oid,'sabora.staff_invitation_outbox','updated_at','UPDATE')
                      AND NOT has_table_privilege(owner.oid,'sabora.staff_invitation_outbox','DELETE')
                      AND NOT has_table_privilege(owner.oid,'sabora.staff_invitation_outbox','TRUNCATE')
                      AND NOT has_table_privilege(owner.oid,'sabora.staff_invitation_outbox','TRIGGER')
                 FROM pg_catalog.pg_roles owner
                WHERE owner.rolname='sabora_staff_invitation_enqueue_fn_owner'
              ) AS enqueue_owner_surface_exact,
              (SELECT count(*)::integer FROM pg_catalog.pg_policies
                WHERE schemaname='sabora' AND tablename='staff_invitation_outbox'
                  AND policyname IN ('staff_invitation_enqueue_owner_select',
                    'staff_invitation_enqueue_owner_insert',
                    'staff_invitation_enqueue_owner_cancel')
              ) AS enqueue_owner_policies,
              (SELECT count(*)::integer
                 FROM pg_catalog.pg_class resource
                 JOIN pg_catalog.pg_namespace ns ON ns.oid=resource.relnamespace
                WHERE ns.nspname='sabora'
                  AND resource.relname IN ('staff_enrollments',
                    'staff_lifecycle_requests','staff_lifecycle_audit',
                    'staff_lifecycle_signing_keys','staff_invitation_outbox')
                  AND resource.relkind IN ('r','p')
                  AND resource.relrowsecurity AND resource.relforcerowsecurity
              ) AS forced_rls_staff_tables,
              EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership
                WHERE membership.member=role.oid) AS has_role_memberships
         FROM pg_catalog.pg_roles role
        WHERE role.rolname=current_user`,
      [INTEGRATED_ROUTINE, LIFECYCLE_ROUTINE],
    );
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      throw Error('staff_invitation_enqueue_sql_identity_rejected');
    }
    const row = result.rows[0];
    if (row.current_role !== expectedRole || row.session_role !== expectedRole ||
        row.superuser !== false || row.bypass_rls !== false || row.can_login !== true ||
        row.inherits_roles !== false || row.can_create_role !== false ||
        row.can_create_db !== false || row.can_replicate !== false ||
        row.schema_usage !== true || row.schema_create !== false ||
        row.database_create !== false || row.integrated_execute !== true ||
        row.lifecycle_execute !== false || row.accessible_private_tables !== 0 ||
        row.accessible_private_sequences !== 0 ||
        row.accessible_private_definer_routines !== 1 ||
        row.integrated_is_definer !== true ||
        row.integrated_owner !== 'sabora_staff_invitation_enqueue_fn_owner' ||
        row.integrated_search_path_locked !== true ||
        row.enqueue_owner_is_sealed !== true || row.enqueue_owner_memberships !== 0 ||
        row.enqueue_owner_surface_exact !== true || row.enqueue_owner_policies !== 3 ||
        row.forced_rls_staff_tables !== 5 || row.has_role_memberships !== false) {
      throw Error('staff_invitation_enqueue_sql_identity_rejected');
    }
    return Object.freeze({role: expectedRole});
  } catch (error) {
    discard = error;
    throw error;
  } finally {
    client.release(discard);
  }
}

export const STAFF_INVITATION_ENQUEUE_ROUTINE = INTEGRATED_ROUTINE;
