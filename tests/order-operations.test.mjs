import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createOrderOperationsRepository} from '../apps/api/src/order-operations-repository.mjs';
import {createOrderOperationsCoordinator} from '../apps/api/src/order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from '../apps/api/src/order-operations-http.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = require('fastify');
const actorId = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000002';
const lineId = '30000000-0000-4000-8000-000000000003';
const eventId = '40000000-0000-4000-8000-000000000004';
const notificationId = '50000000-0000-4000-8000-000000000005';
const confirmedAt = new Date('2026-10-24T10:00:00.000Z');

function context(role = 'kitchen') {
  return {
    verifiedIdentity: {userId: actorId},
    verifiedStaff: {userId: actorId, role},
  };
}

test('coordinator revalidates current membership inside every transaction', async () => {
  const calls = [];
  const repository = {
    async verifyMembership(_query, staff) { calls.push(['membership', staff]); },
    async listBoard(_query, input) { calls.push(['board', input]); return {version: 1, role: input.role, items: []}; },
    async transitionLine(_query, input) { calls.push(['transition', input]); return {version: 1}; },
    async listHistory(_query, input) { calls.push(['history', input]); return {version: 1}; },
  };
  const transactions = [];
  const operations = createOrderOperationsCoordinator({
    repository,
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
    'membership', 'board', 'membership', 'transition', 'membership', 'history',
  ]);
  assert.equal(calls[3][1].actorId, actorId);
});

test('coordinator rejects identity and membership mismatch before opening SQL transaction', async () => {
  let transactions = 0;
  const operations = createOrderOperationsCoordinator({
    repository: {
      verifyMembership() {}, listBoard() {}, transitionLine() {}, listHistory() {},
    },
    withTransaction: async () => { transactions += 1; },
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
  const transition = await repository.transitionLine(async () => ({rows: [{
    updated_order_id: orderId,
    updated_line_id: lineId,
    previous_status: 'preparing',
    current_status: 'ready',
    repeated: false,
    event_id: eventId,
    notification_id: notificationId,
  }]}), {actorId, role: 'kitchen', lineId, targetStatus: 'ready', correlationId: 'transition_002'});
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
    }), {actorId, role: 'admin', lineId, targetStatus, correlationId: 'transition_004'}),
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

test('untrusted operation inputs cannot replace verified actor or staff role', async () => {
  const observed = [];
  const repository = {
    async verifyMembership(_query, staff) { observed.push(['membership', staff]); },
    async listBoard(_query, input) { observed.push(['board', input]); return {version: 1, items: []}; },
    async transitionLine(_query, input) { observed.push(['transition', input]); return {version: 1}; },
    async listHistory(_query, input) { observed.push(['history', input]); return {version: 1}; },
  };
  const operations = createOrderOperationsCoordinator({
    repository,
    withTransaction: async work => work(async () => ({rows: []})),
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
