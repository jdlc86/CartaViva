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
    assert.deepEqual(await preflightOrderOperationsIdentities({
      staffPool, operationsPool, staffRole, operationsRole,
    }), {staff: {role: staffRole}, operations: {role: operationsRole}});
    await admin.query('GRANT USAGE ON SCHEMA sabora TO sabora_ci_staff_identity, sabora_ci_operations_identity');
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
                  has_table_privilege($1, 'sabora.' || $2, 'DELETE') AS can_delete`,
          [role, resource]
        );
        assert.deepEqual(privileges.rows, [{
          can_read: false, can_insert: false, can_update: false, can_delete: false,
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
        }), /order_operations_sql_identity_rejected/);
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
