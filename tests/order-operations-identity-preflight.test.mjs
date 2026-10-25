import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preflightOrderOperationsIdentities,
  preflightOrderTransitionIdentity,
} from '../apps/api/src/order-operations-identity-preflight.mjs';

function pool(role, overrides = {}) {
  const state = {queries: 0, releases: []};
  return {
    state,
    async connect() {
      return {
        async query(sql) {
          state.queries++;
          assert.match(sql, /current_user/);
          assert.match(sql, /session_user/);
          assert.match(sql, /rolbypassrls/);
          return {rows: [{
            current_role: role, session_role: role,
            superuser: false, bypass_rls: false, can_login: true,
            inherits_roles: false, can_create_role: false, can_create_db: false,
            can_replicate: false, has_role_memberships: false, has_role_grantees: false,
            connection_limit: -1, password_valid_until: null,
            schema_usage: true, schema_create: false, database_create: false,
            candidate_rpc_execute: false,
            authorized_rpc_execute: false,
            unsafe_actor_rpc_execute: 0,
            accessible_private_tables: 0, accessible_private_sequences: 0,
            accessible_private_definer_routines: 0,
            candidate_is_invoker: true, forced_rls_transition_requests: 1,
            authorized_is_definer: true,
            authorized_owner: 'sabora_order_operations_fn_owner',
            authorized_search_path_locked: true,
            authorized_owner_is_sealed: true,
            authorized_owner_memberships: 0,
            forced_rls_signing_keys: 1,
            ...overrides,
          }]};
        },
        release(error) { state.releases.push(error); },
      };
    },
  };
}

const roles = {staffRole: 'sabora_staff_reader', operationsRole: 'sabora_kitchen_ops'};

test('preflight accepts only two distinct verified non-privileged SQL logins', async () => {
  const staffPool = pool(roles.staffRole);
  const operationsPool = pool(roles.operationsRole);
  const result = await preflightOrderOperationsIdentities({staffPool, operationsPool, ...roles});
  assert.deepEqual(result, {staff: {role: roles.staffRole}, operations: {role: roles.operationsRole}});
  assert.equal(staffPool.state.queries, 1);
  assert.equal(operationsPool.state.queries, 1);
  assert.deepEqual(staffPool.state.releases, [null]);
  assert.deepEqual(operationsPool.state.releases, [null]);
});

test('candidate transition preflight accepts exactly one authorized wrapper', async () => {
  const operationsPool = pool(roles.operationsRole, {
    authorized_rpc_execute: true,
    accessible_private_definer_routines: 1,
  });
  assert.deepEqual(await preflightOrderTransitionIdentity({
    pool: operationsPool, role: roles.operationsRole,
  }), {role: roles.operationsRole});
});

test('preflight rejects shared pools, roles and privileged role names before querying', async () => {
  const staffPool = pool(roles.staffRole);
  const operationsPool = pool(roles.operationsRole);
  for (const value of ['postgres', 'anon', 'authenticated', 'service_role', 'public', 'Bad;SQL']) {
    await assert.rejects(preflightOrderOperationsIdentities({
      staffPool, operationsPool, ...roles, operationsRole: value,
    }), /invalid_order_operations_sql_identity/);
  }
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool: staffPool, ...roles,
  }), /pool_isolation/);
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, ...roles, operationsRole: roles.staffRole,
  }), /pool_isolation/);
  assert.equal(staffPool.state.queries, 0);
});

test('preflight fails closed for SET ROLE, elevated privileges and mismatched identity', async () => {
  for (const override of [
    {session_role: 'postgres'}, {current_role: 'postgres'},
    {superuser: true}, {bypass_rls: true}, {can_login: false},
    {inherits_roles: true}, {can_create_role: true}, {can_create_db: true},
    {can_replicate: true}, {has_role_memberships: true},
    {connection_limit: 'invalid'}, {connection_limit: -2},
    {password_valid_until: 'invalid'},
    {schema_usage: false}, {schema_create: true}, {database_create: true}, {database_create: null},
    {candidate_rpc_execute: true}, {candidate_rpc_execute: null},
    {authorized_rpc_execute: true}, {authorized_rpc_execute: null},
    {unsafe_actor_rpc_execute: 1}, {unsafe_actor_rpc_execute: null},
    {accessible_private_tables: 1}, {accessible_private_tables: null},
    {accessible_private_tables: '0'},
    {accessible_private_sequences: 1}, {accessible_private_sequences: null},
    {accessible_private_definer_routines: 1}, {accessible_private_definer_routines: '0'},
    {candidate_is_invoker: false}, {candidate_is_invoker: null},
    {authorized_is_definer: false}, {authorized_is_definer: null},
    {authorized_owner: 'postgres'}, {authorized_owner: null},
    {authorized_search_path_locked: false},
    {authorized_owner_is_sealed: false},
    {authorized_owner_memberships: 1},
    {forced_rls_transition_requests: 0}, {forced_rls_transition_requests: null},
    {forced_rls_signing_keys: 0}, {forced_rls_signing_keys: null},
  ]) {
    const staffPool = pool(roles.staffRole);
    const operationsPool = pool(roles.operationsRole, override);
    await assert.rejects(preflightOrderOperationsIdentities({
      staffPool, operationsPool, ...roles,
    }), /order_operations_sql_identity_rejected/);
    assert.equal(operationsPool.state.releases.length, 1);
    assert.ok(operationsPool.state.releases[0] instanceof Error);
  }
});

test('candidate transition preflight fails closed on extra or missing capability surface', async () => {
  for (const override of [
    {},
    {authorized_rpc_execute: true, accessible_private_definer_routines: 2},
    {authorized_rpc_execute: true, accessible_private_definer_routines: 1,
      accessible_private_tables: 1},
    {authorized_rpc_execute: true, accessible_private_definer_routines: 1,
      candidate_rpc_execute: true},
  ]) {
    const operationsPool = pool(roles.operationsRole, override);
    await assert.rejects(preflightOrderTransitionIdentity({
      pool: operationsPool, role: roles.operationsRole,
    }), /order_operations_sql_identity_rejected/);
  }
});

test('preflight discards a SQL client when identity inspection fails', async () => {
  const staffPool = pool(roles.staffRole);
  const state = {releases: []};
  const operationsPool = {
    async connect() {
      return {
        async query() { throw Error('sql_connection_failed'); },
        release(error) { state.releases.push(error); },
      };
    },
  };
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, ...roles,
  }), /sql_connection_failed/);
  assert.equal(state.releases.length, 1);
  assert.match(state.releases[0].message, /sql_connection_failed/);
});

test('preflight rejects malformed SQL identity results', async () => {
  const staffPool = pool(roles.staffRole);
  const operationsPool = {
    async connect() {
      return {query: async () => ({rows: []}), release() {}};
    },
  };
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, ...roles,
  }), /order_operations_sql_identity_rejected/);
});


test('preflight rejects SQL role membership in both directions for both principals', async () => {
  for (const field of ['has_role_memberships', 'has_role_grantees']) {
    for (const affected of ['staff', 'operations']) {
      const staffPool = pool(roles.staffRole, affected === 'staff' ? {[field]: true} : {});
      const operationsPool = pool(roles.operationsRole, affected === 'operations' ? {[field]: true} : {});
      await assert.rejects(preflightOrderOperationsIdentities({staffPool, operationsPool, ...roles}), /order_operations_sql_identity_rejected/);
      const failing = affected === 'staff' ? staffPool : operationsPool;
      assert.equal(failing.state.releases.length, 1);
      assert.ok(failing.state.releases[0] instanceof Error);
    }
  }
});

test('preflight fails closed if a successful SQL inspection cannot release its client', async () => {
  const staffPool = pool(roles.staffRole);
  const operationsPool = pool(roles.operationsRole);
  const reference = pool(roles.operationsRole);
  operationsPool.connect = async () => ({
    async query(sql) { return (await reference.connect()).query(sql); },
    release() { throw Error('sql_release_failed'); },
  });
  await assert.rejects(
    preflightOrderOperationsIdentities({staffPool, operationsPool, ...roles}),
    /sql_release_failed/,
  );
});

test('preflight preserves inspection error when releasing a discarded client also fails', async () => {
  const staffPool = pool(roles.staffRole);
  const operationsPool = {
    async connect() {
      return {
        async query() { throw Error('sql_inspection_failed'); },
        release() { throw Error('sql_release_failed'); },
      };
    },
  };
  await assert.rejects(
    preflightOrderOperationsIdentities({staffPool, operationsPool, ...roles}),
    /sql_inspection_failed/,
  );
});

test('preflight preserves malformed client rejection if discard release fails', async () => {
  const staffPool = pool(roles.staffRole);
  const operationsPool = {
    async connect() {
      return {release() { throw Error('sql_release_failed'); }};
    },
  };
  await assert.rejects(
    preflightOrderOperationsIdentities({staffPool, operationsPool, ...roles}),
    /invalid_order_operations_sql_client/,
  );
});
