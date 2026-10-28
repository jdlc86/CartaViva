import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVerifiedOrderOperationsCandidate} from '../apps/api/src/order-operations-candidate-app.mjs';

test('candidate factory fails closed on missing dependencies without connecting SQL', async () => {
  await assert.rejects(createVerifiedOrderOperationsCandidate(),
    /invalid_order_operations_pool_isolation/);
});

test('candidate factory never connects to SQL when cryptographic wiring is invalid', async () => {
  const seen = [];
  const pool = user => ({
    options: {user, connectionString: 'postgres://' + user},
    query() { seen.push('query'); throw Error('unexpected_sql'); },
    async connect() { seen.push('connect'); throw Error('unexpected_sql'); },
  });
  const base = {
    staffPool: pool('sabora_staff_reader'),
    operationsPool: pool('sabora_operations'),
    staffRole: 'sabora_staff_reader',
    operationsRole: 'sabora_operations',
    issueTransitionCapability() {},
    issueReadCapability() {},
    issuer: 'https://issuer.example.test',
    getTrustedKeys: async () => [],
  };
  for (const override of [
    {issuer: ''},
    {getTrustedKeys: null},
    {issueTransitionCapability: null},
    {issueReadCapability: null},
    {staffRole: 'sabora_operations'},
  ]) {
    await assert.rejects(createVerifiedOrderOperationsCandidate({...base, ...override}),
      /invalid_order_operations_auth_config|invalid_order_operation_capability_issuer|invalid_order_operations_pool_isolation/);
    assert.deepEqual(seen, []);
  }
});

test('candidate is not imported by default production server', () => {
  const server = readFileSync(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  const factory = readFileSync(new URL('../apps/api/src/order-operations-candidate-app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /order-operations-candidate-app/);
  assert.doesNotMatch(factory, /listen\(|process\.env|new Pool\(|DATABASE_URL|SUPABASE_URL/);
});

test('candidate startup discards a failing SQL inspection and never exposes an HTTP listener', async () => {
  const seen = [];
  const makePool = role => ({
    options: {user: role, connectionString: 'postgres://' + role},
    query() { throw Error('unexpected_direct_query'); },
    async connect() {
      seen.push('connect:' + role);
      return {
        async query() {
          seen.push('inspect:' + role);
          throw Error('injected_candidate_sql_failure');
        },
        release(error) {
          assert.match(error.message, /injected_candidate_sql_failure/);
          seen.push('discard:' + role);
        },
      };
    },
  });
  await assert.rejects(createVerifiedOrderOperationsCandidate({
    staffPool: makePool('sabora_staff_reader'),
    operationsPool: makePool('sabora_operations'),
    staffRole: 'sabora_staff_reader',
    operationsRole: 'sabora_operations',
    issueTransitionCapability() {},
    issueReadCapability() {},
    issuer: 'https://issuer.example.test',
    getTrustedKeys: async () => [],
  }), /injected_candidate_sql_failure/);
  assert.deepEqual(seen, [
    'connect:sabora_staff_reader',
    'inspect:sabora_staff_reader',
    'discard:sabora_staff_reader',
  ]);
});

test('isolated candidate starts all three protected endpoints after both SQL identity inspections', async t => {
  const seen = [];
  function inspectedPool(role, kind) {
    return {
      options: {user: role, connectionString: `postgres://${role}`},
      query() { throw Error('unexpected_direct_query'); },
      async connect() {
        seen.push(`connect:${role}`);
        return {
          async query(sql) {
            seen.push(`inspect:${role}`);
            assert.match(sql, /read_order_operations_board_authorized_candidate/);
            const operations = kind === 'operations';
            return {rows: [{
              current_role: role, session_role: role,
              superuser: false, bypass_rls: false, can_login: true,
              inherits_roles: false, can_create_role: false, can_create_db: false,
              can_replicate: false, has_role_memberships: false, has_role_grantees: false,
              connection_limit: -1, password_valid_until: null,
              schema_usage: true, schema_create: false, database_create: false,
              candidate_rpc_execute: false,
              authorized_rpc_execute: operations,
              authorized_board_rpc_execute: operations,
              authorized_history_rpc_execute: operations,
              unsafe_actor_rpc_execute: 0,
              accessible_private_tables: operations ? 0 : 1,
              staff_reader_exact_columns: !operations,
              accessible_private_sequences: 0,
              accessible_private_definer_routines: operations ? 3 : 0,
              candidate_is_invoker: true,
              authorized_is_definer: true,
              authorized_owner: 'sabora_order_operations_fn_owner',
              authorized_search_path_locked: true,
              authorized_board_is_definer: true,
              authorized_board_owner: 'sabora_order_operations_fn_owner',
              authorized_board_search_path_locked: true,
              authorized_history_is_definer: true,
              authorized_history_owner: 'sabora_order_operations_fn_owner',
              authorized_history_search_path_locked: true,
              authorized_owner_is_sealed: true,
              authorized_owner_memberships: 0,
              forced_rls_transition_requests: 1,
              forced_rls_signing_keys: 1,
            }]};
          },
          release(error) { assert.equal(error, null); seen.push(`release:${role}`); },
        };
      },
    };
  }
  const app = await createVerifiedOrderOperationsCandidate({
    staffPool: inspectedPool('sabora_staff_reader', 'staff'),
    operationsPool: inspectedPool('sabora_operations', 'operations'),
    staffRole: 'sabora_staff_reader',
    operationsRole: 'sabora_operations',
    issuer: 'https://issuer.example.test',
    getTrustedKeys: async () => [],
    issueTransitionCapability: () => ({}),
    issueReadCapability: () => ({}),
  });
  t.after(() => app.close());
  assert.equal(app.server.listening, false);
  for (const [method, url] of [
    ['GET', '/api/v1/operations/order-lines'],
    ['POST', '/api/v1/operations/order-lines/:lineId/transitions'],
    ['GET', '/api/v1/operations/orders/:orderId/history'],
  ]) {
    assert.equal(app.hasRoute({method, url}), true);
  }
  assert.equal((await app.inject({method: 'GET', url: '/api/v1/operations/order-lines'})).statusCode, 401);
  assert.equal((await app.inject({method: 'GET', url: '/api/v1/operations/orders/30000000-0000-4000-8000-000000000003/history'})).statusCode, 401);
  assert.equal((await app.inject({
    method: 'POST',
    url: '/api/v1/operations/order-lines/30000000-0000-4000-8000-000000000003/transitions',
    payload: {targetStatus: 'preparing', correlationId: 'candidate_test_01'},
  })).statusCode, 401);
  assert.deepEqual(seen, [
    'connect:sabora_staff_reader', 'inspect:sabora_staff_reader', 'release:sabora_staff_reader',
    'connect:sabora_operations', 'inspect:sabora_operations', 'release:sabora_operations',
  ]);
});

test('candidate aborts if second SQL principal fails after successful staff inspection', async () => {
  const seen = [];
  function inspectedPool(role, kind) {
    return {
      options: {user: role, connectionString: `postgres://${role}`},
      query() { throw Error('unexpected_direct_query'); },
      async connect() {
        seen.push(`connect:${role}`);
        return {
          async query(sql) {
            seen.push(`inspect:${role}`);
            assert.match(sql, /read_order_operations_board_authorized_candidate/);
            const operations = kind === 'operations';
            if (operations) throw Error('operations_identity_denied');
            return {rows: [{
              current_role: role, session_role: role,
              superuser: false, bypass_rls: false, can_login: true,
              inherits_roles: false, can_create_role: false, can_create_db: false,
              can_replicate: false, has_role_memberships: false, has_role_grantees: false,
              connection_limit: -1, password_valid_until: null,
              schema_usage: true, schema_create: false, database_create: false,
              candidate_rpc_execute: false,
              authorized_rpc_execute: operations,
              authorized_board_rpc_execute: operations,
              authorized_history_rpc_execute: operations,
              unsafe_actor_rpc_execute: 0,
              accessible_private_tables: operations ? 0 : 1,
              staff_reader_exact_columns: !operations,
              accessible_private_sequences: 0,
              accessible_private_definer_routines: operations ? 3 : 0,
              candidate_is_invoker: true,
              authorized_is_definer: true,
              authorized_owner: 'sabora_order_operations_fn_owner',
              authorized_search_path_locked: true,
              authorized_board_is_definer: true,
              authorized_board_owner: 'sabora_order_operations_fn_owner',
              authorized_board_search_path_locked: true,
              authorized_history_is_definer: true,
              authorized_history_owner: 'sabora_order_operations_fn_owner',
              authorized_history_search_path_locked: true,
              authorized_owner_is_sealed: true,
              authorized_owner_memberships: 0,
              forced_rls_transition_requests: 1,
              forced_rls_signing_keys: 1,
            }]};
          },
          release(error) {
            if (kind === 'operations') assert.match(error?.message ?? '', /operations_identity_denied/);
            else assert.equal(error, null);
            seen.push((error ? 'discard:' : 'release:') + role);
          },
        };
      },
    };
  }
  await assert.rejects(createVerifiedOrderOperationsCandidate({
    staffPool: inspectedPool('sabora_staff_reader', 'staff'),
    operationsPool: inspectedPool('sabora_operations', 'operations'),
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
    issuer: 'https://issuer.example.test',
    getTrustedKeys: async () => [],
    issueTransitionCapability: () => ({}), issueReadCapability: () => ({}),
  }), /operations_identity_denied/);
  assert.deepEqual(seen, [
    'connect:sabora_staff_reader', 'inspect:sabora_staff_reader', 'release:sabora_staff_reader',
    'connect:sabora_operations', 'inspect:sabora_operations', 'discard:sabora_operations',
  ]);
});
