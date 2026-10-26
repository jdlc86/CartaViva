import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createOrderOperationsRepository} from '../apps/api/src/order-operations-repository.mjs';
import {createOrderOperationsCoordinator} from '../apps/api/src/order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from '../apps/api/src/order-operations-http.mjs';
import {createOrderOperationReadCapabilityIssuer} from '../apps/api/src/order-operation-read-capability.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = require('fastify');
const actorId = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000002';
const lineId = '30000000-0000-4000-8000-000000000003';
const eventId = '40000000-0000-4000-8000-000000000004';
const notificationId = '50000000-0000-4000-8000-000000000005';
const confirmedAt = new Date('2026-10-24T10:00:00.000Z');

function capability({actorId: actor, lineId: line, targetStatus, correlationId}) {
  return Object.freeze({
    keyId: 'test_key_01', databaseRole: 'sabora_operations',
    actorId: actor, lineId: line, targetStatus, correlationId,
    issuedAtMs: 1_000, expiresAtMs: 16_000, signatureHex: 'a'.repeat(64),
  });
}

function context(role = 'kitchen') {
  return {
    verifiedIdentity: {userId: actorId},
    verifiedStaff: {userId: actorId, role},
  };
}

test('coordinator binds a transition capability and leaves membership revalidation to SQL', async () => {
  const calls = [];
  const repository = {
    async verifyMembership(_query, staff) { calls.push(['membership', staff]); return {...staff}; },
    async listBoard(_query, input) { calls.push(['board', input]); return {version: 1, role: input.role, items: []}; },
    async transitionLine(_query, input) { calls.push(['transition', input]); return {version: 1}; },
    async listHistory(_query, input) { calls.push(['history', input]); return {version: 1}; },
  };
  const transactions = [];
  const operations = createOrderOperationsCoordinator({
    repository,
    issueTransitionCapability: capability,
    withTransaction: async (work) => {
      transactions.push('BEGIN');
      const result = await work(async () => ({rows: []}));
      transactions.push('COMMIT');
      return result;
    },
  });
  await operations.listBoard(context(), {status: 'confirmed', limit: 20, cursor: null});
  await operations.transitionLine(context(), {lineId, targetStatus: 'preparing', correlationId: 'transition_001'});
  await operations.listHistory(context(), {orderId, limit: 10});
  assert.deepEqual(transactions, ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  assert.deepEqual(calls.map(([name]) => name), [
    'membership', 'board', 'transition', 'membership', 'history',
  ]);
  assert.equal(calls[2][1].actorId, actorId);
  assert.equal(calls[2][1].capability.actorId, actorId);
});

test('restricted coordinator binds board and history scope without direct membership SQL', async () => {
  const calls = [];
  const readCapabilities = [];
  const repository = {
    async verifyMembership() { throw Error('direct_membership_query_forbidden'); },
    async listBoard(_query, input) { calls.push(['board', input]); return {items: []}; },
    async transitionLine() { return {version: 1}; },
    async listHistory(_query, input) { calls.push(['history', input]); return {events: []}; },
  };
  const issueReadCapability = (input) => {
    readCapabilities.push(input);
    return Object.freeze({operation: input.operation});
  };
  const operations = createOrderOperationsCoordinator({
    repository,
    issueTransitionCapability: capability,
    issueReadCapability,
    withTransaction: (work) => work(async () => ({rows: []})),
  });
  await operations.listBoard(context(), {status: 'ready', limit: 20, cursor: null});
  await operations.listHistory(context('waiter'), {orderId, limit: 10});
  assert.deepEqual(readCapabilities, [
    {actorId, role: 'kitchen', operation: 'board', status: 'ready', limit: 20, cursor: null},
    {actorId, role: 'waiter', operation: 'history', orderId, limit: 10},
  ]);
  assert.equal(calls[0][1].capability.operation, 'board');
  assert.equal(calls[1][1].capability.operation, 'history');
});

test('coordinator rejects identity and membership mismatch before opening SQL transaction', async () => {
  let transactions = 0;
  const operations = createOrderOperationsCoordinator({
    repository: {
      verifyMembership() {}, listBoard() {}, transitionLine() {}, listHistory() {},
    },
    withTransaction: async () => { transactions += 1; },
    issueTransitionCapability: capability,
  });
  await assert.rejects(operations.listBoard({
    verifiedIdentity: {userId: actorId},
    verifiedStaff: {userId: '90000000-0000-4000-8000-000000000009', role: 'kitchen'},
  }, {}), /order_operations_forbidden/);
  assert.equal(transactions, 0);
});

test('coordinator rejects malformed verified actor context without opening a transaction', async () => {
  let transactions = 0;
  const operations = createOrderOperationsCoordinator({
    repository: {
      verifyMembership() {}, listBoard() {}, transitionLine() {}, listHistory() {},
    },
    withTransaction: async () => { transactions++; },
    issueTransitionCapability: capability,
  });
  for (const invalid of [
    {verifiedIdentity: {userId: actorId}, verifiedStaff: {userId: 1, role: 'kitchen'}},
    {verifiedIdentity: {userId: actorId}, verifiedStaff: {userId: null, role: 'kitchen'}},
    {verifiedIdentity: {userId: actorId}, verifiedStaff: {userId: 'invalid', role: 'kitchen'}},
    {verifiedIdentity: [], verifiedStaff: {userId: actorId, role: 'kitchen'}},
    {verifiedIdentity: {userId: actorId}, verifiedStaff: []},
    {verifiedIdentity: {userId: actorId}, verifiedStaff: {userId: actorId, role: 'root'}},
  ]) {
    await assert.rejects(operations.listBoard(invalid, {}), /order_operations_forbidden/);
  }
  assert.equal(transactions, 0);
});

test('repository returns a bounded kitchen projection without private identifiers', async () => {
  const repository = createOrderOperationsRepository();
  const queries = [];
  const query = async (sql, parameters) => {
    queries.push({sql, parameters});
    return {rows: [{
      order_id: orderId,
      line_id: lineId,
      table_number: 12,
      customer_label: 'Mesa Ana',
      confirmed_at: confirmedAt,
      grouping: 'first',
      line_number: 1,
      category: 'main',
      name: 'Arroz',
      quantity: 2,
      status: 'ready',
      notification_id: notificationId,
      notification_created_at: new Date('2026-10-24T10:05:00.000Z'),
      notification_acknowledged_at: null,
    }]};
  };
  const board = await repository.listBoard(query, {
    actorId, role: 'kitchen', status: 'ready', limit: 10, cursor: null,
  });
  assert.equal(board.version, 1);
  assert.equal(board.items[0].notification.id, notificationId);
  assert.equal(board.items[0].notification.acknowledgedAt, null);
  assert.deepEqual(queries[0].parameters, ['kitchen', 'ready', null, null, null, 11]);
  assert.equal(Object.hasOwn(board.items[0], 'actorUserId'), false);
  assert.equal(Object.hasOwn(board.items[0], 'sessionId'), false);
});

test('repository uses only actor-bound wrappers when read capabilities are supplied', async () => {
  const repository = createOrderOperationsRepository();
  const issue = createOrderOperationReadCapabilityIssuer({
    keyId: 'test_read_key_01', secret: Buffer.alloc(32, 3),
    databaseRole: 'sabora_operations', clock: () => 1_800_000_000_000,
  });
  const queries = [];
  const boardCapability = issue({
    actorId, role: 'kitchen', operation: 'board', status: 'ready', limit: 10, cursor: null,
  });
  const board = await repository.listBoard(async (sql, parameters) => {
    queries.push({sql, parameters});
    return {rows: [{
      order_id: orderId, line_id: lineId, table_number: 12,
      customer_label: 'Mesa Ana', confirmed_at: confirmedAt, grouping: 'first',
      line_number: 1, category: 'main', name: 'Arroz', quantity: 2, status: 'ready',
      notification_id: notificationId, notification_created_at: confirmedAt,
      notification_acknowledged_at: null,
    }]};
  }, {actorId, role: 'kitchen', status: 'ready', limit: 10, cursor: null,
    capability: boardCapability});
  assert.equal(board.items.length, 1);
  assert.match(queries[0].sql, /read_order_operations_board_authorized_candidate/);
  assert.equal(queries[0].parameters[2], actorId);
  assert.equal(queries[0].parameters[3], 'kitchen');
  assert.equal(queries[0].parameters[4], 'ready');

  const historyCapability = issue({
    actorId, role: 'waiter', operation: 'history', orderId, limit: 10,
  });
  const history = await repository.listHistory(async (sql, parameters) => {
    queries.push({sql, parameters});
    return {rows: [{
      event_id: eventId, line_id: lineId, line_number: 1, name: 'Arroz',
      from_status: 'ready', to_status: 'picked_up', occurred_at: confirmedAt,
      actor_role: 'waiter',
    }]};
  }, {actorId, role: 'waiter', orderId, limit: 10, capability: historyCapability});
  assert.equal(history.events.length, 1);
  assert.match(queries[1].sql, /read_order_operations_history_authorized_candidate/);
  assert.deepEqual(queries[1].parameters.slice(2, 6), [actorId, 'waiter', orderId, 10]);

  await assert.rejects(repository.listBoard(async () => ({rows: []}), {
    actorId, role: 'kitchen', status: 'confirmed', limit: 10, cursor: null,
    capability: boardCapability,
  }), /invalid_order_operation_read_capability/);
});

test('repository rejects SQL board rows outside verified role or requested filter', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    order_id: orderId, line_id: lineId, table_number: 12,
    customer_label: 'Mesa Ana', confirmed_at: confirmedAt, grouping: 'first',
    line_number: 1, category: 'main', name: 'Arroz', quantity: 2,
    status: 'ready', notification_id: notificationId,
    notification_created_at: confirmedAt, notification_acknowledged_at: null,
  };
  for (const [role, status, returned] of [
    ['kitchen', null, 'picked_up'],
    ['waiter', null, 'confirmed'],
    ['waiter', null, 'preparing'],
    ['admin', 'ready', 'confirmed'],
    ['kitchen', 'preparing', 'ready'],
  ]) {
    await assert.rejects(repository.listBoard(async () => ({
      rows: [{...base, status: returned}],
    }), {actorId, role, status, limit: 10, cursor: null}),
    /invalid_order_operations_sql_result/);
  }
});

test('repository validates ordering, cursor and overflow row before returning a board', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    order_id: orderId, line_id: lineId, table_number: 12,
    customer_label: 'Mesa Ana', confirmed_at: confirmedAt, grouping: 'first',
    line_number: 1, category: 'main', name: 'Arroz', quantity: 2,
    status: 'ready', notification_id: notificationId,
    notification_created_at: confirmedAt, notification_acknowledged_at: null,
  };
  const second = {
    ...base, line_id: '60000000-0000-4000-8000-000000000006',
    line_number: 2,
  };
  const options = {actorId, role: 'kitchen', status: 'ready', limit: 1, cursor: null};
  const valid = await repository.listBoard(async () => ({rows: [base, second]}), options);
  assert.equal(valid.items.length, 1);
  assert.deepEqual(valid.nextCursor, {
    confirmedAt: confirmedAt.toISOString(), orderId, lineNumber: 1,
  });
  for (const rows of [
    [second, base],
    [base, {...second, line_id: lineId}],
    [base, {...second, confirmed_at: new Date('2026-10-24T09:59:00.000Z')}],
    [base, {...second, confirmed_at: 'not-a-date'}],
    [base, {...second, table_number: 0}],
    [base, {...second, customer_label: ''}],
    [base, {...second, quantity: 0}],
    [base, {...second, notification_id: 'not-a-uuid'}],
    [base, {...second, notification_created_at: null}],
    [base, {...second, grouping: 'unknown'}],
  ]) {
    await assert.rejects(repository.listBoard(async () => ({rows}), options),
      /invalid_order_operations_sql_result/);
  }
  await assert.rejects(repository.listBoard(async () => ({rows: [base]}), {
    ...options,
    cursor: {confirmedAt: confirmedAt.toISOString(), orderId, lineNumber: 1},
  }), /invalid_order_operations_sql_result/);
});

test('repository blocks role-incompatible projections before SQL', async () => {
  const repository = createOrderOperationsRepository();
  let queries = 0;
  await assert.rejects(repository.listBoard(async () => { queries += 1; }, {
    actorId, role: 'waiter', status: 'preparing', limit: 10, cursor: null,
  }), /order_operations_forbidden/);
  assert.equal(queries, 0);
});

test('repository denies role-incompatible transitions without any SQL call', async () => {
  const repository = createOrderOperationsRepository();
  let queries = 0;
  const query = async () => { queries++; throw Error('unexpected_sql'); };
  for (const [role, targetStatus] of [
    ['kitchen', 'picked_up'], ['waiter', 'preparing'],
    ['waiter', 'ready'], ['unknown', 'ready'],
  ]) {
    await assert.rejects(repository.transitionLine(query, {
      actorId, role, lineId, targetStatus, correlationId: 'transition_003',
    }), role === 'unknown' ? /invalid_order_line_transition/ : /order_operations_forbidden/);
  }
  assert.equal(queries, 0);
});

test('repository validates idempotent transition and history results', async () => {
  const repository = createOrderOperationsRepository();
  const observed = [];
  const transitionCapability = capability({
    actorId, lineId, targetStatus: 'ready', correlationId: 'transition_002',
  });
  const transition = await repository.transitionLine(async (sql, parameters) => {
    observed.push({sql, parameters});
    return {rows: [{
    updated_order_id: orderId,
    updated_line_id: lineId,
    previous_status: 'preparing',
    current_status: 'ready',
    repeated: false,
    event_id: eventId,
    notification_id: notificationId,
  }]};
  }, {actorId, role: 'kitchen', lineId, targetStatus: 'ready',
    correlationId: 'transition_002', capability: transitionCapability});
  assert.deepEqual(transition, {
    version: 1,
    orderId,
    lineId,
    previousStatus: 'preparing',
    currentStatus: 'ready',
    repeated: false,
    eventId,
    notificationId,
  });
  assert.match(observed[0].sql, /transition_order_line_authorized_candidate/);
  assert.deepEqual(observed[0].parameters, [
    transitionCapability.keyId, transitionCapability.databaseRole, actorId, lineId,
    'ready', 'transition_002', transitionCapability.issuedAtMs,
    transitionCapability.expiresAtMs, transitionCapability.signatureHex,
  ]);
  const history = await repository.listHistory(async () => ({rows: [{
    event_id: eventId,
    line_id: lineId,
    line_number: 1,
    name: 'Arroz',
    from_status: 'preparing',
    to_status: 'ready',
    occurred_at: new Date('2026-10-24T10:05:00.000Z'),
    actor_role: 'kitchen',
  }]}), {actorId, role: 'kitchen', orderId, limit: 20});
  assert.equal(history.events[0].actorRole, 'kitchen');
  assert.equal(Object.hasOwn(history.events[0], 'actorUserId'), false);
});

test('repository rejects a missing, altered or overlong capability before SQL', async () => {
  const repository = createOrderOperationsRepository();
  let queries = 0;
  const base = {
    actorId, role: 'kitchen', lineId, targetStatus: 'preparing',
    correlationId: 'transition_capability_001',
  };
  const valid = capability(base);
  for (const invalid of [
    undefined,
    {...valid, actorId: '90000000-0000-4000-8000-000000000009'},
    {...valid, targetStatus: 'ready'},
    {...valid, correlationId: 'transition_capability_002'},
    {...valid, expiresAtMs: valid.issuedAtMs + 30_001},
    {...valid, signatureHex: 'A'.repeat(64)},
    {...valid, extra: true},
  ]) {
    await assert.rejects(repository.transitionLine(async () => { queries++; }, {
      ...base, capability: invalid,
    }), /invalid_order_operation_capability/);
  }
  assert.equal(queries, 0);
});

test('repository rejects globally unordered history with role-compatible event rows', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    event_id: eventId, line_id: lineId, line_number: 1,
    name: 'Arroz', from_status: 'confirmed', to_status: 'preparing',
    occurred_at: confirmedAt, actor_role: 'kitchen',
  };
  const another = {...base,
    event_id: '60000000-0000-4000-8000-000000000006',
    line_id: '70000000-0000-4000-8000-000000000007',
    line_number: 2, actor_role: 'kitchen',
  };
  const read = rows => repository.listHistory(async () => ({rows}),
    {actorId, role: 'admin', orderId, limit: 10});
  await assert.rejects(read([
    {...base, occurred_at: new Date('2026-10-24T10:01:00.000Z')},
    {...another, occurred_at: confirmedAt},
  ]), /invalid_order_operations_sql_result/);
  await assert.rejects(read([another, base]),
    /invalid_order_operations_sql_result/);
  const valid = await read([base, another]);
  assert.equal(valid.events.length, 2);
  assert.equal(valid.events[0].actorRole, 'kitchen');
});

test('repository rejects duplicate history event identifiers even across distinct lines', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    event_id: eventId, line_id: lineId, line_number: 1,
    name: 'Arroz', from_status: 'confirmed', to_status: 'preparing',
    occurred_at: confirmedAt, actor_role: 'kitchen',
  };
  await assert.rejects(repository.listHistory(async () => ({rows: [
    base,
    {...base, line_id: '60000000-0000-4000-8000-000000000006', line_number: 2},
  ]}), {actorId, role: 'admin', orderId, limit: 10}), /invalid_order_operations_sql_result/);
});

test('repository rejects discontinuous or out-of-order history for the same line', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    event_id: eventId, line_id: lineId, line_number: 1,
    name: 'Arroz', from_status: 'confirmed', to_status: 'preparing',
    occurred_at: confirmedAt, actor_role: 'kitchen',
  };
  for (const second of [
    {from_status: 'ready', to_status: 'picked_up', occurred_at: new Date('2026-10-24T10:01:00.000Z')},
    {from_status: 'preparing', to_status: 'ready', occurred_at: new Date('2026-10-24T09:59:00.000Z')},
    {from_status: 'confirmed', to_status: 'preparing', occurred_at: new Date('2026-10-24T10:01:00.000Z')},
  ]) {
    await assert.rejects(repository.listHistory(async () => ({rows: [
      base,
      {...base, ...second, event_id: '60000000-0000-4000-8000-000000000006'},
    ]}), {actorId, role: 'admin', orderId, limit: 10}), /invalid_order_operations_sql_result/);
  }
  const valid = await repository.listHistory(async () => ({rows: [
    base,
    {...base, event_id: '60000000-0000-4000-8000-000000000006',
      from_status: 'preparing', to_status: 'ready',
      occurred_at: new Date('2026-10-24T10:01:00.000Z')},
  ]}), {actorId, role: 'admin', orderId, limit: 10});
  assert.equal(valid.events.length, 2);
});

test('repository rejects historical transitions attributed to forbidden staff roles', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    event_id: eventId, line_id: lineId, line_number: 1,
    name: 'Arroz', from_status: 'confirmed', to_status: 'preparing',
    occurred_at: confirmedAt, actor_role: 'kitchen',
  };
  for (const override of [
    {actor_role: 'waiter', from_status: 'confirmed', to_status: 'preparing'},
    {actor_role: 'waiter', from_status: 'preparing', to_status: 'ready'},
    {actor_role: 'kitchen', from_status: 'ready', to_status: 'picked_up'},
  ]) {
    await assert.rejects(repository.listHistory(async () => ({
      rows: [{...base, ...override}],
    }), {actorId, role: 'admin', orderId, limit: 10}),
    /invalid_order_operations_sql_result/);
  }
  for (const override of [
    {actor_role: 'kitchen', from_status: 'preparing', to_status: 'ready'},
    {actor_role: 'waiter', from_status: 'ready', to_status: 'picked_up'},
    {actor_role: 'admin', from_status: 'confirmed', to_status: 'preparing'},
  ]) {
    const result = await repository.listHistory(async () => ({
      rows: [{...base, ...override}],
    }), {actorId, role: 'admin', orderId, limit: 10});
    assert.equal(result.events.length, 1);
  }
});

test('repository rejects impossible historical state edges returned by SQL', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    event_id: eventId, line_id: lineId, line_number: 1,
    name: 'Arroz', from_status: 'confirmed', to_status: 'preparing',
    occurred_at: confirmedAt, actor_role: 'kitchen',
  };
  for (const [from_status, to_status] of [
    ['confirmed', 'ready'], ['ready', 'preparing'],
    ['picked_up', 'ready'], ['ready', 'ready'],
  ]) {
    await assert.rejects(repository.listHistory(async () => ({
      rows: [{...base, from_status, to_status}],
    }), {actorId, role: 'admin', orderId, limit: 10}),
    /invalid_order_operations_sql_result/);
  }
});

test('repository rejects impossible SQL transition results and missing pickup notifications', async () => {
  const repository = createOrderOperationsRepository();
  const base = {
    updated_order_id: orderId, updated_line_id: lineId,
    previous_status: 'preparing', current_status: 'ready',
    repeated: false, event_id: eventId, notification_id: notificationId,
  };
  for (const [targetStatus, override] of [
    ['ready', {previous_status: 'confirmed'}],
    ['ready', {notification_id: null}],
    ['picked_up', {previous_status: 'ready', current_status: 'picked_up', notification_id: null}],
    ['preparing', {previous_status: 'confirmed', current_status: 'preparing', notification_id: notificationId}],
    ['ready', {updated_line_id: null}],
  ]) {
    await assert.rejects(repository.transitionLine(async () => ({
      rows: [{...base, ...override}],
    }), {actorId, role: 'admin', lineId, targetStatus, correlationId: 'transition_004',
      capability: capability({actorId, lineId, targetStatus, correlationId: 'transition_004'})}),
    /invalid_order_operations_sql_result/);
  }
});

async function httpHarness({role = 'kitchen', operations} = {}) {
  const app = Fastify({logger: false});
  const forRoles = (allowed) => [async (request, reply) => {
    if (request.headers.authorization !== 'Bearer test') {
      return reply.code(401).send({error: 'unauthorized'});
    }
    if (!allowed.includes(role)) return reply.code(403).send({error: 'forbidden'});
    request.verifiedIdentity = {userId: actorId};
    request.verifiedStaff = {userId: actorId, role};
  }];
  registerOrderOperationsHttp(app, {forRoles, operations});
  await app.ready();
  return app;
}

test('HTTP rejects forbidden board filters before coordinator and allows scoped ones', async (t) => {
  const observed = [];
  const operations = {
    async listBoard(_ctx, page) { observed.push(page); return {version: 1, items: []}; },
    async listHistory() { return {events: []}; },
    async transitionLine() { throw Error('unexpected_transition'); },
  };
  for (const [role, forbiddenStatus, permittedStatus] of [
    ['kitchen', 'picked_up', 'preparing'],
    ['waiter', 'confirmed', 'picked_up'],
    ['waiter', 'preparing', 'ready'],
  ]) {
    const app = await httpHarness({role, operations});
    t.after(() => app.close());
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/operations/order-lines?status=${forbiddenStatus}`,
      headers: {authorization: 'Bearer test'},
    });
    assert.equal(forbidden.statusCode, 403);
    assert.deepEqual(forbidden.json(), {error: 'forbidden'});
    const allowed = await app.inject({
      method: 'GET',
      url: `/api/v1/operations/order-lines?status=${permittedStatus}`,
      headers: {authorization: 'Bearer test'},
    });
    assert.equal(allowed.statusCode, 200);
  }
  assert.equal(observed.length, 3);
});

test('HTTP rejects role-incompatible transition before calling coordinator', async (t) => {
  let transitions = 0;
  const operations = {
    async listBoard() { return {items: []}; },
    async listHistory() { return {events: []}; },
    async transitionLine() { transitions++; throw Error('unexpected_transition'); },
  };
  for (const [role, targetStatus] of [
    ['kitchen', 'picked_up'],
    ['waiter', 'preparing'],
    ['waiter', 'ready'],
  ]) {
    const app = await httpHarness({role, operations});
    t.after(() => app.close());
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/operations/order-lines/${lineId}/transitions`,
      headers: {authorization: 'Bearer test'},
      payload: {targetStatus, correlationId: 'http_role_guard_001'},
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), {error: 'forbidden'});
  }
  assert.equal(transitions, 0);
});

test('HTTP rejects duplicated numeric query parameters instead of coercing arrays', async (t) => {
  let reads = 0;
  const app = await httpHarness({operations: {
    listBoard: async () => { reads++; return {items: []}; },
    listHistory: async () => { reads++; return {events: []}; },
    transitionLine: async () => { throw Error('unexpected_transition'); },
  }});
  t.after(() => app.close());
  for (const url of [
    '/api/v1/operations/order-lines?limit=10&limit=20',
    '/api/v1/operations/order-lines?status=ready&status=preparing',
    '/api/v1/operations/order-lines?afterConfirmedAt=2026-10-24T10%3A00%3A00.000Z&afterConfirmedAt=2026-10-24T10%3A00%3A00.000Z&afterOrderId=' + orderId + '&afterLineNumber=1',
    '/api/v1/operations/order-lines?afterConfirmedAt=2026-10-24T10%3A00%3A00.000Z&afterOrderId=' + orderId + '&afterOrderId=' + orderId + '&afterLineNumber=1',
    '/api/v1/operations/order-lines?afterConfirmedAt=2026-10-24T10%3A00%3A00.000Z&afterOrderId=' + orderId + '&afterLineNumber=1&afterLineNumber=1',
    `/api/v1/operations/orders/${orderId}/history?limit=10&limit=20`,
  ]) {
    const response = await app.inject({
      method: 'GET', url, headers: {authorization: 'Bearer test'},
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {error: 'invalid_order_operation'});
  }
  assert.equal(reads, 0);
});

test('HTTP transition exposes created and replayed outcomes without accepting actor or role', async (t) => {
  const received = [];
  const app = await httpHarness({operations: {
    listBoard: async () => ({version: 1, role: 'kitchen', items: [], nextCursor: null}),
    listHistory: async () => ({version: 1, orderId, events: []}),
    transitionLine: async (ctx, input) => {
      received.push({ctx, input});
      return {version: 1, orderId, lineId, previousStatus: 'confirmed',
        currentStatus: 'preparing', repeated: received.length > 1, eventId, notificationId: null};
    },
  }});
  t.after(() => app.close());
  const board = await app.inject({method: 'GET',
    url: '/api/v1/operations/order-lines?status=confirmed&limit=10',
    headers: {authorization: 'Bearer test'}});
  assert.equal(board.statusCode, 200);
  const body = {targetStatus: 'preparing', correlationId: 'transition_http_001'};
  const first = await app.inject({method: 'POST',
    url: `/api/v1/operations/order-lines/${lineId}/transitions`,
    headers: {authorization: 'Bearer test'}, payload: body});
  const replay = await app.inject({method: 'POST',
    url: `/api/v1/operations/order-lines/${lineId}/transitions`,
    headers: {authorization: 'Bearer test'}, payload: body});
  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(received[0].ctx.verifiedIdentity.userId, actorId);
  assert.deepEqual(received[0].input, {lineId, ...body});
  const forged = await app.inject({method: 'POST',
    url: `/api/v1/operations/order-lines/${lineId}/transitions`,
    headers: {authorization: 'Bearer test'},
    payload: {...body, actorId, role: 'admin'}});
  assert.equal(forged.statusCode, 400);
  assert.equal(received.length, 2);
});

test('HTTP board validates cursors and maps authorization, conflict and private failures', async (t) => {
  const app = await httpHarness({operations: {
    listBoard: async () => { throw Error('order_operations_forbidden'); },
    listHistory: async () => { throw Error('private_sql_dsn=secret'); },
    transitionLine: async () => { throw Error('invalid_line_transition'); },
  }});
  t.after(() => app.close());
  const unauthorized = await app.inject({method: 'GET', url: '/api/v1/operations/order-lines'});
  assert.equal(unauthorized.statusCode, 401);
  const forbidden = await app.inject({method: 'GET', url: '/api/v1/operations/order-lines',
    headers: {authorization: 'Bearer test'}});
  assert.equal(forbidden.statusCode, 403);
  const invalidCursor = await app.inject({method: 'GET',
    url: '/api/v1/operations/order-lines?afterOrderId=bad',
    headers: {authorization: 'Bearer test'}});
  assert.equal(invalidCursor.statusCode, 400);
  const conflict = await app.inject({method: 'POST',
    url: `/api/v1/operations/order-lines/${lineId}/transitions`,
    headers: {authorization: 'Bearer test'},
    payload: {targetStatus: 'preparing', correlationId: 'transition_http_002'}});
  assert.equal(conflict.statusCode, 409);
  const unavailable = await app.inject({method: 'GET',
    url: `/api/v1/operations/orders/${orderId}/history`,
    headers: {authorization: 'Bearer test'}});
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.includes('secret'), false);
});

test('HTTP maps only exact domain errors and never leaks driver messages', async (t) => {
  const errors = [
    ['actor_not_authorized', 403, 'forbidden'],
    ['role_not_allowed_for_line_transition', 403, 'forbidden'],
    ['line_not_found', 404, 'order_operation_not_found'],
    ['order_not_found', 404, 'order_operation_not_found'],
    ['line_transition_idempotency_conflict', 409, 'order_operation_conflict'],
    ['invalid_order_history_request', 400, 'invalid_order_operation'],
    ['driver forbidden connection=secret', 503, 'order_operations_unavailable'],
    ['invalid_line_transition unexpected SQL detail=secret', 503, 'order_operations_unavailable'],
    ['line_not_found;password=secret', 503, 'order_operations_unavailable'],
  ];
  for (const [message, code, publicError] of errors) {
    const app = await httpHarness({operations: {
      listBoard: async () => { throw Error(message); },
      listHistory: async () => ({events: []}),
      transitionLine: async () => ({repeated: false}),
    }});
    t.after(() => app.close());
    const response = await app.inject({
      method: 'GET', url: '/api/v1/operations/order-lines',
      headers: {authorization: 'Bearer test'},
    });
    assert.equal(response.statusCode, code, message);
    assert.deepEqual(response.json(), {error: publicError}, message);
    assert.equal(response.body.includes('secret'), false);
  }
});

test('untrusted operation inputs cannot replace verified actor or staff role', async () => {
  const observed = [];
  const repository = {
    async verifyMembership(_query, staff) { observed.push(['membership', staff]); return {...staff}; },
    async listBoard(_query, input) { observed.push(['board', input]); return {version: 1, items: []}; },
    async transitionLine(_query, input) { observed.push(['transition', input]); return {version: 1}; },
    async listHistory(_query, input) { observed.push(['history', input]); return {version: 1}; },
  };
  const operations = createOrderOperationsCoordinator({
    repository,
    withTransaction: async work => work(async () => ({rows: []})),
    issueTransitionCapability: capability,
  });
  const forged = {actorId: '90000000-0000-4000-8000-000000000009', role: 'admin'};
  await operations.listBoard(context('waiter'), {...forged, limit: 10});
  await operations.transitionLine(context('waiter'), {...forged, lineId, targetStatus: 'picked_up'});
  await operations.listHistory(context('waiter'), {...forged, orderId});
  for (const [, input] of observed) {
    assert.equal(input.actorId, actorId);
    assert.equal(input.role, 'waiter');
  }
});
