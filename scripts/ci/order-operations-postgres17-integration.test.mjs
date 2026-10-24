import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createOrderOperationCapabilityIssuer} from '../../apps/api/src/order-operation-capability.mjs';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';
import {createOrderOperationsRepository} from '../../apps/api/src/order-operations-repository.mjs';
import {createOrderOperationsCoordinator} from '../../apps/api/src/order-operations-coordinator.mjs';
import {registerOrderOperationsHttp} from '../../apps/api/src/order-operations-http.mjs';

const url = process.env.SABORA_CI_PG_URL;
const modulePath = process.env.SABORA_CI_PG_MODULE;
if (!url || !modulePath) throw Error('disposable_pg17_harness_required');
const parsed = new URL(url);
if (process.env.GITHUB_ACTIONS !== 'true' ||
    !isDisposablePgModulePath(modulePath) ||
    parsed.protocol !== 'postgresql:' || parsed.hostname !== '127.0.0.1' ||
    parsed.username !== 'postgres' || parsed.password !== 'sabora_ci_ephemeral_only' ||
    parsed.pathname !== '/postgres' || parsed.port === '' ||
    !/^[0-9]+$/.test(parsed.port) || parsed.search !== '' || parsed.hash !== '') {
  throw Error('unsafe_pg17_harness_target');
}
const require = createRequire(import.meta.url);
const {Pool} = require(modulePath);
const Fastify = createRequire(new URL('../../apps/api/package.json', import.meta.url))('fastify');
const pool = new Pool({
  connectionString: url,
  max: 8,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 1000,
  options: '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000',
});
const withTransaction = createPostgresTransaction({pool});
const repository = createOrderOperationsRepository();
const keyId = 'ci_pg17_operations_key';
const signingSecret = randomBytes(32);
const issueTransitionCapability = createOrderOperationCapabilityIssuer({
  keyId, secret: signingSecret, databaseRole: 'postgres',
});
const operations = createOrderOperationsCoordinator({
  withTransaction, repository, issueTransitionCapability,
});

const kitchenId = 'd1000000-0000-4000-8000-000000000001';
const waiterId = 'd1000000-0000-4000-8000-000000000002';
const suspendedKitchenId = 'd1000000-0000-4000-8000-000000000003';

function context(userId, role) {
  return {verifiedIdentity: {userId}, verifiedStaff: {userId, role}};
}

async function fixture({suffix, actorAlias = 'Mesa operativa'}) {
  const tableId = `d2000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
  const orderId = `d3000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
  const tableNumber = 940000 + Number(suffix);
  await pool.query(`INSERT INTO sabora.dining_tables
    (id, number, capacity, qr_token_hash, ordering_state)
    VALUES ($1, $2, 4, decode(repeat('d2',32),'hex'), 'open')`, [tableId, tableNumber]);
  const session = await pool.query('SELECT session_id FROM sabora.dining_tables WHERE id=$1', [tableId]);
  await pool.query(`INSERT INTO sabora.orders
    (id, table_id, session_id, company, employee_number,
     confirmed_at, grouping, items)
    VALUES ($1, $2, $3, $4, '42', clock_timestamp(), 'first',
      '[{"category":"main","name":"Arroz de temporada","quantity":1}]'::jsonb)`,
  [orderId, tableId, session.rows[0].session_id, actorAlias]);
  const lines = await pool.query('SELECT id FROM sabora.order_lines WHERE order_id=$1', [orderId]);
  assert.equal(lines.rows.length, 1);
  return {tableId, orderId, lineId: lines.rows[0].id, tableNumber};
}

test.before(async () => {
  await pool.query(`INSERT INTO sabora.order_operation_signing_keys
    (key_id, hmac_key, not_before, expires_at)
    VALUES ($1, decode($2, 'hex'), clock_timestamp() - interval '1 minute',
            clock_timestamp() + interval '1 hour')`, [keyId, signingSecret.toString('hex')]);
  await pool.query(`INSERT INTO sabora.staff_members(user_id, role, state) VALUES
    ($1, 'kitchen', 'active'),
    ($2, 'waiter', 'active'),
    ($3, 'kitchen', 'active')`, [kitchenId, waiterId, suspendedKitchenId]);
});
test.after(async () => pool.end());

test('PG17 persists the complete preparation, ready notification and pickup cycle', async () => {
  const item = await fixture({suffix: '101'});
  const kitchen = context(kitchenId, 'kitchen');
  const waiter = context(waiterId, 'waiter');
  const initial = await operations.listBoard(kitchen, {status: 'confirmed', limit: 20, cursor: null});
  assert.ok(initial.items.some((line) => line.lineId === item.lineId));

  const preparing = await operations.transitionLine(kitchen, {
    lineId: item.lineId, targetStatus: 'preparing', correlationId: 'pg_cycle_preparing_101',
  });
  assert.equal(preparing.repeated, false);
  const preparingReplay = await operations.transitionLine(kitchen, {
    lineId: item.lineId, targetStatus: 'preparing', correlationId: 'pg_cycle_preparing_101',
  });
  assert.equal(preparingReplay.repeated, true);
  assert.equal(preparingReplay.eventId, preparing.eventId);
  await assert.rejects(operations.transitionLine(kitchen, {
    lineId: item.lineId, targetStatus: 'ready', correlationId: 'pg_cycle_preparing_101',
  }), /line_transition_idempotency_conflict/);

  await assert.rejects(operations.transitionLine(waiter, {
    lineId: item.lineId, targetStatus: 'ready', correlationId: 'pg_waiter_cannot_ready_101',
  }), /order_operations_forbidden/);
  const ready = await operations.transitionLine(kitchen, {
    lineId: item.lineId, targetStatus: 'ready', correlationId: 'pg_cycle_ready_101',
  });
  assert.equal(ready.repeated, false);
  assert.match(ready.notificationId, /^[0-9a-f-]{36}$/i);

  const waiterBoard = await operations.listBoard(waiter, {status: 'ready', limit: 20, cursor: null});
  const alert = waiterBoard.items.find((line) => line.lineId === item.lineId);
  assert.equal(alert.notification.acknowledgedAt, null);
  const pickedUp = await operations.transitionLine(waiter, {
    lineId: item.lineId, targetStatus: 'picked_up', correlationId: 'pg_cycle_pickup_101',
  });
  assert.equal(pickedUp.notificationId, ready.notificationId);

  const recovered = await operations.listBoard(waiter, {status: 'picked_up', limit: 20, cursor: null});
  const recoveredLine = recovered.items.find((line) => line.lineId === item.lineId);
  assert.ok(recoveredLine.notification.acknowledgedAt);
  const history = await operations.listHistory(waiter, {orderId: item.orderId, limit: 20});
  assert.deepEqual(history.events.map((event) => event.toStatus), ['preparing', 'ready', 'picked_up']);
  assert.deepEqual(history.events.map((event) => event.actorRole), ['kitchen', 'kitchen', 'waiter']);
});

test('PG17 serializes repeated and competing concurrent operations', async () => {
  const same = await fixture({suffix: '102'});
  const kitchen = context(kitchenId, 'kitchen');
  const simultaneous = await Promise.all([
    operations.transitionLine(kitchen, {
      lineId: same.lineId, targetStatus: 'preparing', correlationId: 'pg_concurrent_same_102',
    }),
    operations.transitionLine(kitchen, {
      lineId: same.lineId, targetStatus: 'preparing', correlationId: 'pg_concurrent_same_102',
    }),
  ]);
  assert.deepEqual(simultaneous.map((result) => result.repeated).sort(), [false, true]);
  assert.equal(new Set(simultaneous.map((result) => result.eventId)).size, 1);

  const competing = await fixture({suffix: '103'});
  const settled = await Promise.allSettled([
    operations.transitionLine(kitchen, {
      lineId: competing.lineId, targetStatus: 'preparing', correlationId: 'pg_concurrent_a_103',
    }),
    operations.transitionLine(kitchen, {
      lineId: competing.lineId, targetStatus: 'preparing', correlationId: 'pg_concurrent_b_103',
    }),
  ]);
  assert.equal(settled.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(settled.filter((result) => result.status === 'rejected').length, 1);
  assert.match(settled.find((result) => result.status === 'rejected').reason.message,
    /invalid_line_transition/);
  const persisted = await pool.query(`SELECT count(*)::integer AS n
    FROM sabora.order_line_transition_requests WHERE order_line_id=$1`, [competing.lineId]);
  assert.equal(persisted.rows[0].n, 1);
});

test('PG17 rolls back line, notification, event and idempotency record together', async () => {
  const item = await fixture({suffix: '104'});
  await assert.rejects(withTransaction(async (query) => {
    await repository.verifyMembership(query, {actorId: kitchenId, role: 'kitchen'});
    await repository.transitionLine(query, {
      actorId: kitchenId,
      role: 'kitchen',
      lineId: item.lineId,
      targetStatus: 'preparing',
      correlationId: 'pg_forced_rollback_104',
      capability: issueTransitionCapability({
        actorId: kitchenId, lineId: item.lineId, targetStatus: 'preparing',
        correlationId: 'pg_forced_rollback_104',
      }),
    });
    throw Error('forced_mid_operation_failure');
  }), /forced_mid_operation_failure/);
  const state = await pool.query(`SELECT lines.status,
    (SELECT count(*)::integer FROM sabora.order_line_events events
      WHERE events.order_line_id=lines.id) AS event_count,
    (SELECT count(*)::integer FROM sabora.order_line_transition_requests requests
      WHERE requests.order_line_id=lines.id) AS request_count,
    (SELECT count(*)::integer FROM sabora.pickup_notifications notifications
      WHERE notifications.order_line_id=lines.id) AS notification_count
    FROM sabora.order_lines lines WHERE lines.id=$1`, [item.lineId]);
  assert.deepEqual(state.rows[0], {
    status: 'confirmed', event_count: 0, request_count: 0, notification_count: 0,
  });
});

test('PG17 staff suspension wins before a waiting operational mutation', async () => {
  const item = await fixture({suffix: '105'});
  const prior = await fixture({suffix: '108'});
  await operations.transitionLine(context(suspendedKitchenId, 'kitchen'), {
    lineId: prior.lineId, targetStatus: 'preparing', correlationId: 'pg_before_suspension_108',
  });
  const blocker = await pool.connect();
  let settled = false;
  try {
    await blocker.query('BEGIN');
    await blocker.query(`UPDATE sabora.staff_members SET state='suspended' WHERE user_id=$1`,
      [suspendedKitchenId]);
    const attempt = operations.transitionLine(context(suspendedKitchenId, 'kitchen'), {
      lineId: item.lineId, targetStatus: 'preparing', correlationId: 'pg_suspension_race_105',
    }).finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(settled, false);
    await blocker.query('COMMIT');
    await assert.rejects(attempt, /actor_not_authorized/);
    await assert.rejects(operations.transitionLine(context(suspendedKitchenId, 'kitchen'), {
      lineId: prior.lineId, targetStatus: 'preparing', correlationId: 'pg_before_suspension_108',
    }), /actor_not_authorized/);
    await assert.rejects(pool.query(
      `SELECT * FROM sabora.transition_order_line_idempotent_candidate($1,$2,$3,$4)`,
      [suspendedKitchenId, prior.lineId, 'preparing', 'pg_before_suspension_108']
    ), /actor_not_authorized/);
  } finally {
    await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
  }
  const line = await pool.query('SELECT status FROM sabora.order_lines WHERE id=$1', [item.lineId]);
  assert.equal(line.rows[0].status, 'confirmed');
});

test('PG17 operational audit and idempotency history are append-only', async () => {
  const item = await fixture({suffix: '106'});
  await operations.transitionLine(context(kitchenId, 'kitchen'), {
    lineId: item.lineId, targetStatus: 'preparing', correlationId: 'pg_append_only_106',
  });
  await assert.rejects(pool.query(`UPDATE sabora.order_line_events
    SET to_status='ready' WHERE order_line_id=$1`, [item.lineId]),
  /order_operation_history_append_only/);
  await assert.rejects(pool.query(`DELETE FROM sabora.order_line_transition_requests
    WHERE order_line_id=$1`, [item.lineId]), /order_operation_history_append_only/);
  const persisted = await pool.query(`SELECT events.to_status, requests.current_status
    FROM sabora.order_line_events events
    JOIN sabora.order_line_transition_requests requests ON requests.event_id=events.id
    WHERE events.order_line_id=$1`, [item.lineId]);
  assert.deepEqual(persisted.rows, [{to_status: 'preparing', current_status: 'preparing'}]);
});

test('Fastify and PG17 integrate board, transition, replay and authorization responses', async (t) => {
  const item = await fixture({suffix: '107'});
  const app = Fastify({logger: false});
  const forRoles = (roles) => [async (request, reply) => {
    const [scheme, userId, role] = String(request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Test' || !roles.includes(role)) return reply.code(401).send({error: 'unauthorized'});
    request.verifiedIdentity = {userId};
    request.verifiedStaff = {userId, role};
  }];
  registerOrderOperationsHttp(app, {forRoles, operations});
  await app.ready();
  t.after(() => app.close());
  const unauthorized = await app.inject({method: 'GET', url: '/api/v1/operations/order-lines'});
  assert.equal(unauthorized.statusCode, 401);
  const authorization = `Test ${kitchenId} kitchen`;
  const board = await app.inject({method: 'GET',
    url: '/api/v1/operations/order-lines?status=confirmed&limit=100',
    headers: {authorization}});
  assert.equal(board.statusCode, 200, board.body);
  assert.ok(board.json().items.some((line) => line.lineId === item.lineId));
  const payload = {targetStatus: 'preparing', correlationId: 'pg_http_transition_107'};
  const first = await app.inject({method: 'POST',
    url: `/api/v1/operations/order-lines/${item.lineId}/transitions`,
    headers: {authorization}, payload});
  const replay = await app.inject({method: 'POST',
    url: `/api/v1/operations/order-lines/${item.lineId}/transitions`,
    headers: {authorization}, payload});
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(first.json().eventId, replay.json().eventId);
});
