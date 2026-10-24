import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {preflightOrderOperationsIdentities} from '../../apps/api/src/order-operations-identity-preflight.mjs';

// Identical isolation guard to the existing disposable node-postgres harness.
const url = process.env.SABORA_CI_PG_URL;
const modulePath = process.env.SABORA_CI_PG_MODULE;
if (!url || !modulePath) throw Error('disposable_pg17_harness_required');
const parsed = new URL(url);
if (process.env.GITHUB_ACTIONS !== 'true' ||
    !modulePath.startsWith('/tmp/tmp') || !modulePath.endsWith('/node_modules/pg') ||
    !/^[A-Za-z0-9_.-]+$/.test(modulePath.slice(8, -16)) ||
    parsed.protocol !== 'postgresql:' || parsed.hostname !== '127.0.0.1' ||
    parsed.username !== 'postgres' || parsed.password !== 'sabora_ci_ephemeral_only' ||
    parsed.pathname !== '/postgres' || parsed.port === '' ||
    !/^[0-9]+$/.test(parsed.port) || parsed.search !== '' || parsed.hash !== '') {
  throw Error('unsafe_pg17_harness_target');
}
const require = createRequire(import.meta.url);
const {Pool} = require(modulePath);
const admin = new Pool({connectionString: url, max: 1});
const staffRole = 'sabora_ci_staff_identity';
const operationsRole = 'sabora_ci_operations_identity';

test('PG17 preflight accepts distinct nonprivileged login identities and rejects SET ROLE', async () => {
  // The only DDL here is on the disposable loopback CI container.
  await admin.query(`CREATE ROLE sabora_ci_staff_identity LOGIN PASSWORD 'sabora_ci_staff_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT`);
  await admin.query(`CREATE ROLE sabora_ci_operations_identity LOGIN PASSWORD 'sabora_ci_operations_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT`);
  const makePool = (role, password) => new Pool({
    connectionString: `postgresql://${role}:${password}@127.0.0.1:${parsed.port}/postgres`,
    max: 1,
    connectionTimeoutMillis: 3000,
  });
  const staffPool = makePool(staffRole, 'sabora_ci_staff_ephemeral');
  const operationsPool = makePool(operationsRole, 'sabora_ci_operations_ephemeral');
  try {
    await admin.query('GRANT USAGE ON SCHEMA sabora TO sabora_ci_staff_identity, sabora_ci_operations_identity');
    assert.deepEqual(await preflightOrderOperationsIdentities({
      staffPool, operationsPool, staffRole, operationsRole,
    }), {staff: {role: staffRole}, operations: {role: operationsRole}});
    // Explicit negative matrix: schema visibility alone must not grant access
    // to any operational table or the candidate SECURITY INVOKER RPC.
    const resources = [
      'staff_members', 'orders', 'order_lines', 'dining_tables',
      'pickup_notifications', 'order_line_events', 'order_line_transition_requests',
    ];
    for (const role of [staffRole, operationsRole]) {
      for (const resource of resources) {
        const privileges = await admin.query(
          `SELECT has_table_privilege($1, 'sabora.' || $2, 'SELECT') AS can_read,
                  has_table_privilege($1, 'sabora.' || $2, 'INSERT') AS can_insert,
                  has_table_privilege($1, 'sabora.' || $2, 'UPDATE') AS can_update,
                  has_table_privilege($1, 'sabora.' || $2, 'DELETE') AS can_delete,
                  has_table_privilege($1, 'sabora.' || $2, 'TRUNCATE') AS can_truncate,
                  has_table_privilege($1, 'sabora.' || $2, 'REFERENCES') AS can_reference,
                  has_table_privilege($1, 'sabora.' || $2, 'TRIGGER') AS can_trigger`,
          [role, resource]
        );
        assert.deepEqual(privileges.rows, [{
          can_read: false, can_insert: false, can_update: false, can_delete: false,
          can_truncate: false, can_reference: false, can_trigger: false,
        }], `unexpected privileges for ${role} on ${resource}`);
      }
      const rpc = await admin.query(
        `SELECT has_function_privilege(
          $1, 'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)', 'EXECUTE'
        ) AS can_execute`,
        [role]
      );
      assert.equal(rpc.rows[0].can_execute, false);
    }
    // Runtime logins must not be able to create schema objects or inspect
    // privileged role metadata through inherited membership.
    for (const role of [staffRole, operationsRole]) {
      const schema = await admin.query(
        `SELECT has_schema_privilege($1, 'sabora', 'USAGE') AS can_use,
                has_schema_privilege($1, 'sabora', 'CREATE') AS can_create`,
        [role]
      );
      assert.deepEqual(schema.rows, [{can_use: true, can_create: false}]);
    }
    // A metadata check is not sufficient: exercise the SQL denial with the
    // actual login sessions before any temporary grants are introduced.
    for (const [role, clientPool] of [
      [staffRole, staffPool], [operationsRole, operationsPool],
    ]) {
      await assert.rejects(clientPool.query(
        'CREATE TABLE sabora.sabora_ci_forbidden_ddl (id integer)'
      ), /permission denied/,
      `${role} unexpectedly created an object in the private schema`);
      await assert.rejects(clientPool.query(
        'SELECT * FROM sabora.staff_members LIMIT 1'
      ), /permission denied/,
      `${role} unexpectedly read staff membership without an explicit grant`);
    }
    // Check the two independent logins against the whole private schema.
    // A grant on an unrelated table would bypass the seven-resource inventory.
    const unexpectedGrants = await admin.query(
      `SELECT roles.rolname AS role_name, tables.relname AS table_name,
              privilege.privilege AS privilege
         FROM pg_catalog.pg_roles roles
         CROSS JOIN pg_catalog.pg_class tables
         JOIN pg_catalog.pg_namespace ns ON ns.oid = tables.relnamespace
         CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                            ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privilege(privilege)
        WHERE roles.rolname = ANY($1::text[])
          AND ns.nspname = 'sabora'
          AND tables.relkind IN ('r','p','v','m','f')
          AND has_table_privilege(roles.oid, tables.oid, privilege.privilege)
        ORDER BY roles.rolname, tables.relname, privilege.privilege`,
      [[staffRole, operationsRole]]
    );
    assert.deepEqual(unexpectedGrants.rows, [],
      'technical login unexpectedly accesses a table outside the explicit inventory');
    // Sequence privileges are independent of table grants. No technical
    // identity may consume, inspect or advance a sequence in this schema.
    const sequenceGrants = await admin.query(
      `SELECT roles.rolname AS role_name, sequences.relname AS sequence_name,
              privilege.privilege AS privilege
         FROM pg_catalog.pg_roles roles
         CROSS JOIN pg_catalog.pg_class sequences
         JOIN pg_catalog.pg_namespace ns ON ns.oid = sequences.relnamespace
         CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) privilege(privilege)
        WHERE roles.rolname = ANY($1::text[])
          AND ns.nspname = 'sabora'
          AND sequences.relkind = 'S'
          AND has_sequence_privilege(roles.oid, sequences.oid, privilege.privilege)
        ORDER BY roles.rolname, sequences.relname, privilege.privilege`,
      [[staffRole, operationsRole]]
    );
    assert.deepEqual(sequenceGrants.rows, [],
      'technical login unexpectedly accesses a private schema sequence');
    // Functions are a separate attack surface: the only explicit operational
    // candidate must remain inaccessible, including its default PUBLIC grant.
    // This inventory deliberately does not assert that unrelated legacy
    // functions are private; that requires a separate migration review.
    const candidateExecution = await admin.query(
      `SELECT roles.rolname AS role_name,
              has_function_privilege(roles.oid,
                'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)'::regprocedure,
                'EXECUTE') AS can_execute
         FROM pg_catalog.pg_roles roles
        WHERE roles.rolname = ANY($1::text[])
        ORDER BY roles.rolname`,
      [[staffRole, operationsRole]]
    );
    assert.deepEqual(candidateExecution.rows, [
      {role_name: operationsRole, can_execute: false},
      {role_name: staffRole, can_execute: false},
    ].sort((a, b) => a.role_name.localeCompare(b.role_name)));
    // A schema-wide inventory of routines prevents a future migration from
    // silently exposing new SECURITY DEFINER functions to runtime logins.
    // Only newly introduced definer routines are flagged here; the positive
    // privilege design still needs its own explicit review.
    const elevatedRoutines = await admin.query(
      `SELECT routine.proname AS routine_name,
              pg_catalog.pg_get_function_identity_arguments(routine.oid) AS arguments
         FROM pg_catalog.pg_proc routine
         JOIN pg_catalog.pg_namespace ns ON ns.oid = routine.pronamespace
        WHERE ns.nspname = 'sabora'
          AND routine.prosecdef
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles roles
             WHERE roles.rolname = ANY($1::text[])
               AND has_function_privilege(roles.oid, routine.oid, 'EXECUTE')
          )
        ORDER BY routine.proname, arguments`,
      [[staffRole, operationsRole]]
    );
    assert.deepEqual(elevatedRoutines.rows, [],
      'technical login unexpectedly executes a SECURITY DEFINER routine');
    // SQL login privileges must not grant arbitrary execution of private
    // routines. The explicit operational candidate is checked separately.
    // Only functions with SECURITY DEFINER are a privilege-escalation path;
    // invoker routines may be publicly executable yet still lack table rights.
    const definerCount = await admin.query(
      `SELECT count(*)::integer AS total
         FROM pg_catalog.pg_proc routine
         JOIN pg_catalog.pg_namespace ns ON ns.oid = routine.pronamespace
        WHERE ns.nspname = 'sabora' AND routine.prosecdef`
    );
    assert.ok(Number.isSafeInteger(definerCount.rows[0]?.total));
    // Temporary grants are made only inside the disposable CI database.
    // Each escalation must independently block route-registration preflight.
    for (const [grant, revoke] of [
      [
        'GRANT CREATE ON SCHEMA sabora TO sabora_ci_operations_identity',
        'REVOKE CREATE ON SCHEMA sabora FROM sabora_ci_operations_identity',
      ],
      [
        'GRANT EXECUTE ON FUNCTION sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text) TO sabora_ci_operations_identity',
        'REVOKE EXECUTE ON FUNCTION sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text) FROM sabora_ci_operations_identity',
      ],
    ]) {
      await admin.query(grant);
      try {
        await assert.rejects(preflightOrderOperationsIdentities({
          staffPool, operationsPool, staffRole, operationsRole,
        }), /order_operations_sql_identity_rejected/);
      } finally {
        await admin.query(revoke);
      }
      assert.deepEqual(await preflightOrderOperationsIdentities({
        staffPool, operationsPool, staffRole, operationsRole,
      }), {staff: {role: staffRole}, operations: {role: operationsRole}});
    }
    // Prove the runtime preflight detects an accidental table grant, not
    // merely that the offline catalog inventory reports it.
    await admin.query('GRANT SELECT ON sabora.staff_members TO sabora_ci_operations_identity');
    try {
      await assert.rejects(preflightOrderOperationsIdentities({
        staffPool, operationsPool, staffRole, operationsRole,
      }), /order_operations_sql_identity_rejected/);
    } finally {
      await admin.query('REVOKE SELECT ON sabora.staff_members FROM sabora_ci_operations_identity');
    }
    assert.deepEqual(await preflightOrderOperationsIdentities({
      staffPool, operationsPool, staffRole, operationsRole,
    }), {staff: {role: staffRole}, operations: {role: operationsRole}});
    // An unrelated private sequence must also trigger the startup gate.
    // All objects are ephemeral in this disposable PostgreSQL 17 container.
    await admin.query('CREATE SEQUENCE sabora.sabora_ci_preflight_sequence');
    try {
      await admin.query('GRANT USAGE ON SEQUENCE sabora.sabora_ci_preflight_sequence TO sabora_ci_operations_identity');
      try {
        await assert.rejects(preflightOrderOperationsIdentities({
          staffPool, operationsPool, staffRole, operationsRole,
        }), /order_operations_sql_identity_rejected/);
      } finally {
        await admin.query('REVOKE USAGE ON SEQUENCE sabora.sabora_ci_preflight_sequence FROM sabora_ci_operations_identity');
      }
    } finally {
      await admin.query('DROP SEQUENCE sabora.sabora_ci_preflight_sequence');
    }
    assert.deepEqual(await preflightOrderOperationsIdentities({
      staffPool, operationsPool, staffRole, operationsRole,
    }), {staff: {role: staffRole}, operations: {role: operationsRole}});
    // SECURITY DEFINER is an independent privilege-escalation surface.
    // The temporary function is harmless, lives only in disposable PG17,
    // and its default PUBLIC EXECUTE grant is explicitly revoked.
    await admin.query(`CREATE FUNCTION sabora.sabora_ci_preflight_definer()
      RETURNS integer LANGUAGE sql SECURITY DEFINER
      SET search_path = pg_catalog AS 'SELECT 1'`);
    try {
      await admin.query('REVOKE ALL ON FUNCTION sabora.sabora_ci_preflight_definer() FROM PUBLIC');
      await admin.query('GRANT EXECUTE ON FUNCTION sabora.sabora_ci_preflight_definer() TO sabora_ci_operations_identity');
      try {
        await assert.rejects(preflightOrderOperationsIdentities({
          staffPool, operationsPool, staffRole, operationsRole,
        }), /order_operations_sql_identity_rejected/);
      } finally {
        await admin.query('REVOKE EXECUTE ON FUNCTION sabora.sabora_ci_preflight_definer() FROM sabora_ci_operations_identity');
      }
      assert.deepEqual(await preflightOrderOperationsIdentities({
        staffPool, operationsPool, staffRole, operationsRole,
      }), {staff: {role: staffRole}, operations: {role: operationsRole}});
    } finally {
      await admin.query('DROP FUNCTION sabora.sabora_ci_preflight_definer()');
    }
    // A narrowly granted SELECT still cannot bypass FORCE RLS. The test
    // runs on the disposable database only and revokes its temporary grant.
    await admin.query(
      'GRANT SELECT ON sabora.order_line_transition_requests TO sabora_ci_operations_identity'
    );
    try {
      const restricted = await operationsPool.query(
        'SELECT actor_user_id, correlation_id FROM sabora.order_line_transition_requests'
      );
      assert.deepEqual(restricted.rows, []);
      // Even with a narrowly scoped read grant, write and RPC privileges
      // must remain unavailable to the operations login.
      const stillDenied = await admin.query(
        `SELECT has_table_privilege($1, 'sabora.order_line_transition_requests', 'INSERT') AS can_insert,
                has_table_privilege($1, 'sabora.order_line_transition_requests', 'UPDATE') AS can_update,
                has_table_privilege($1, 'sabora.order_line_transition_requests', 'DELETE') AS can_delete,
                has_table_privilege($1, 'sabora.order_line_transition_requests', 'TRUNCATE') AS can_truncate,
                has_function_privilege($1,
                  'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)',
                  'EXECUTE') AS can_execute`,
        [operationsRole]
      );
      assert.deepEqual(stillDenied.rows, [{
        can_insert: false, can_update: false, can_delete: false,
        can_truncate: false, can_execute: false,
      }]);
      const policies = await admin.query(`SELECT relrowsecurity, relforcerowsecurity
        FROM pg_catalog.pg_class
        WHERE oid = 'sabora.order_line_transition_requests'::regclass`);
      assert.deepEqual(policies.rows, [{relrowsecurity: true, relforcerowsecurity: true}]);
    } finally {
      await admin.query(
        'REVOKE SELECT ON sabora.order_line_transition_requests FROM sabora_ci_operations_identity'
      );
    }
    const staffClient = await staffPool.connect();
    try {
      const role = await staffClient.query('SELECT current_user, session_user');
      assert.equal(role.rows[0].current_user, staffRole);
      assert.equal(role.rows[0].session_user, staffRole);
      await assert.rejects(staffClient.query('SELECT * FROM sabora.order_line_transition_requests'),
        /permission denied/);
      await assert.rejects(staffClient.query(
        'SELECT * FROM sabora.transition_order_line_idempotent_candidate(NULL,NULL,NULL,NULL)'),
      /permission denied/);
    } finally { staffClient.release(); }
    const operationClient = await operationsPool.connect();
    try {
      await assert.rejects(operationClient.query('SELECT * FROM sabora.order_line_transition_requests'),
        /permission denied/);
      await assert.rejects(operationClient.query(
        'SELECT * FROM sabora.transition_order_line_idempotent_candidate(NULL,NULL,NULL,NULL)'),
      /permission denied/);
    } finally { operationClient.release(); }
    // Prove that a non-superuser login with an added role membership is rejected.
    await admin.query('CREATE ROLE sabora_ci_forbidden_membership NOLOGIN');
    await admin.query('GRANT sabora_ci_forbidden_membership TO sabora_ci_operations_identity');
    try {
      await assert.rejects(preflightOrderOperationsIdentities({
        staffPool, operationsPool, staffRole, operationsRole,
      }), /order_operations_sql_identity_rejected/);
      // Membership alone is forbidden; SET ROLE is independently forbidden.
      await operationsPool.query('SET ROLE sabora_ci_forbidden_membership');
      try {
        await assert.rejects(preflightOrderOperationsIdentities({
          staffPool, operationsPool, staffRole, operationsRole,
        }), /order_operations_sql_identity_rejected|permission denied for schema sabora/);
      } finally {
        await operationsPool.query('RESET ROLE');
      }
    } finally {
      await admin.query('REVOKE sabora_ci_forbidden_membership FROM sabora_ci_operations_identity');
      await admin.query('DROP ROLE sabora_ci_forbidden_membership');
    }
  } finally {
    await staffPool.end();
    await operationsPool.end();
  }
});
test.after(async () => admin.end());
