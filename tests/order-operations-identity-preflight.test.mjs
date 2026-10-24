import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightOrderOperationsIdentities} from '../apps/api/src/order-operations-identity-preflight.mjs';

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
