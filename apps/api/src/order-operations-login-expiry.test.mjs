import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightOrderOperationsIdentities} from './order-operations-identity-preflight.mjs';

function identity(role, overrides = {}) {
  return {
    current_role: role, session_role: role, superuser: false, bypass_rls: false,
    can_login: true, inherits_roles: false, can_create_role: false,
    can_create_db: false, can_replicate: false, connection_limit: -1,
    password_valid_until: null, schema_usage: true, schema_create: false,
    database_create: false, candidate_rpc_execute: false,
    accessible_private_tables: 0, accessible_private_sequences: 0,
    accessible_private_definer_routines: 0, candidate_is_invoker: true,
    forced_rls_transition_requests: 1, has_role_memberships: false, ...overrides,
  };
}
function pool(role, overrides = {}) {
  const state = {queries: 0, releases: []};
  return {
    state,
    async connect() {
      return {
        async query() { state.queries++; return {rows: [identity(role, overrides)]}; },
        release(error) { state.releases.push(error); },
      };
    },
  };
}
const roles = ['sabora_staff_reader', 'sabora_operations_login'];
for (const [name, overrides] of [
  ['expired credential', {password_valid_until: new Date('2000-01-01T00:00:00Z')}],
  ['disabled connections', {connection_limit: 0}],
  ['invalid connection limit', {connection_limit: -2}],
  ['non-date expiry', {password_valid_until: '2030-01-01'}],
]) {
  for (const failingIndex of [0, 1]) {
    test(`startup rejects ${name} for SQL identity ${failingIndex + 1}`, async () => {
      const pools = roles.map((role, index) => pool(role, index === failingIndex ? overrides : {}));
      await assert.rejects(preflightOrderOperationsIdentities({
        staffPool: pools[0], operationsPool: pools[1],
        staffRole: roles[0], operationsRole: roles[1],
      }), /order_operations_sql_identity_rejected/);
      assert.equal(pools[failingIndex].state.releases.length, 1);
      assert.ok(pools[failingIndex].state.releases[0] instanceof Error);
    });
  }
}
test('startup accepts separate minimally privileged identities with future expiry', async () => {
  const staffPool = pool(roles[0], {password_valid_until: new Date('2099-01-01T00:00:00Z'), connection_limit: 1});
  const operationsPool = pool(roles[1]);
  const result = await preflightOrderOperationsIdentities({
    staffPool, operationsPool, staffRole: roles[0], operationsRole: roles[1],
  });
  assert.equal(result.staff.role, roles[0]);
  assert.equal(result.operations.role, roles[1]);
  assert.deepEqual(staffPool.state.releases, [null]);
  assert.deepEqual(operationsPool.state.releases, [null]);
});

test('SQL inspection failure remains primary when client release also fails', async () => {
  const staffPool = pool(roles[0]);
  const operationsPool = {
    async connect() {
      return {
        async query() { throw Error('sql_inspection_failed'); },
        release() { throw Error('sql_release_failed'); },
      };
    },
  };
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, staffRole: roles[0], operationsRole: roles[1],
  }), error => {
    assert.equal(error.message, 'sql_inspection_failed');
    assert.equal(error.releaseError?.message, 'sql_release_failed');
    return true;
  });
});

test('successful SQL inspection cannot hide failed connection release', async () => {
  const staffPool = pool(roles[0]);
  const operationsPool = {
    async connect() {
      return {
        async query() { return {rows: [identity(roles[1])]}; },
        release() { throw Error('sql_release_failed'); },
      };
    },
  };
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, staffRole: roles[0], operationsRole: roles[1],
  }), /sql_release_failed/);
});

test('malformed SQL client release failure preserves malformed-client error', async () => {
  const staffPool = pool(roles[0]);
  const operationsPool = {
    async connect() { return {release() { throw Error('release_failed'); }}; },
  };
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, staffRole: roles[0], operationsRole: roles[1],
  }), /invalid_order_operations_sql_client/);
});
