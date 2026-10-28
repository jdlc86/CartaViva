import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  randomBytes,
  sign as signJwt,
} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {buildCatalogLineEvidence} from '../../apps/api/src/catalog-line-evidence.mjs';
import {createCatalogOrderConfirmationPoolCandidate} from '../../apps/api/src/catalog-order-confirmation-candidate.mjs';
import {createOrderOperationCapabilityIssuer} from '../../apps/api/src/order-operation-capability.mjs';
import {createOrderOperationReadCapabilityIssuer} from '../../apps/api/src/order-operation-read-capability.mjs';
import {createVerifiedOrderOperationsCandidate} from '../../apps/api/src/order-operations-candidate-app.mjs';
import {preflightOrderOperationsRuntimeIdentity} from '../../apps/api/src/order-operations-identity-preflight.mjs';
import {createAuthenticatedOrderOperationsGateway} from '../../apps/management/src/order-operations-authenticated-gateway.js';

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
const admin = new Pool({
  connectionString: url,
  max: 8,
  connectionTimeoutMillis: 3000,
  options: '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000',
});
const staffRole = 'sabora_ci_h4_staff_reader';
const operationsRole = 'sabora_ci_h4_operations';
const staffPassword = 'sabora_ci_h4_staff_ephemeral';
const operationsPassword = 'sabora_ci_h4_operations_ephemeral';
const keyId = 'ci_h4_read_binding_key_001';
const signingSecret = randomBytes(32);
const kitchenId = 'a1000000-0000-4000-8000-000000000001';
const waiterId = 'a1000000-0000-4000-8000-000000000002';
const adminId = 'a1000000-0000-4000-8000-000000000003';
const expiringId = 'a1000000-0000-4000-8000-000000000004';
const customerId = 'a1000000-0000-4000-8000-000000000099';
const authIssuer = 'https://ci.h4.sabora.invalid/auth/v1';
const authKeyId = 'ci-h4-auth-key';
const {privateKey: authPrivateKey, publicKey: authPublicKey} =
  generateKeyPairSync('rsa', {modulusLength: 2048});
const authJwk = Object.freeze({
  ...authPublicKey.export({format: 'jwk'}), kid: authKeyId, alg: 'RS256', use: 'sig',
});
let staffPool;
let operationsPool;
let app;
let issueTransitionCapability;
let issueReadCapability;

function poolFor(role, password, max = 4) {
  return new Pool({
    connectionString: `postgresql://${role}:${password}@127.0.0.1:${parsed.port}/postgres`,
    max,
    connectionTimeoutMillis: 3000,
    options: '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000',
  });
}

function bearer(userId, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({alg: 'RS256', typ: 'JWT', kid: authKeyId});
  const payload = encode({
    iss: authIssuer, aud: 'authenticated', sub: userId,
    role: 'authenticated', iat: now - 1, exp: now + 300, ...overrides,
  });
  return `${header}.${payload}.${signJwt('RSA-SHA256',
    Buffer.from(`${header}.${payload}`), authPrivateKey).toString('base64url')}`;
}

const headers = (userId) => ({authorization: `Bearer ${bearer(userId)}`});
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function directFixture(suffix, customerLabel = 'Mesa de integración') {
  const padded = String(suffix).padStart(12, '0');
  const tableId = `a2000000-0000-4000-8000-${padded}`;
  const orderId = `a3000000-0000-4000-8000-${padded}`;
  await admin.query(`INSERT INTO sabora.dining_tables
    (id, number, capacity, qr_token_hash, ordering_state)
    VALUES ($1, $2, 4, decode(repeat('a2',32),'hex'), 'open')`,
  [tableId, 970000 + Number(suffix)]);
  const table = await admin.query(
    'SELECT session_id FROM sabora.dining_tables WHERE id=$1', [tableId]);
  await admin.query(`INSERT INTO sabora.orders
    (id, table_id, session_id, company, employee_number,
     confirmed_at, grouping, items)
    VALUES ($1,$2,$3,$4,'42',clock_timestamp(),'first',
      '[{"category":"main","name":"Plato H4","quantity":1}]'::jsonb)`,
  [orderId, tableId, table.rows[0].session_id, customerLabel]);
  const line = await admin.query(
    'SELECT id FROM sabora.order_lines WHERE order_id=$1', [orderId]);
  assert.equal(line.rows.length, 1);
  return {tableId, orderId, lineId: line.rows[0].id};
}

function boardCall(capability, {
  actorId = capability.actorId,
  role = capability.staffRole,
  status = null,
  cursor = null,
  limit = 100,
  signatureHex = capability.signatureHex,
} = {}) {
  return operationsPool.query(
    `SELECT * FROM sabora.read_order_operations_board_authorized_candidate(
      $1::text,$2::text,$3::uuid,$4::text,$5::text,
      $6::bigint,$7::uuid,$8::integer,$9::integer,
      $10::bigint,$11::bigint,$12::text)`,
    [
      capability.keyId, capability.databaseRole, actorId, role, status,
      cursor === null ? null : Date.parse(cursor.confirmedAt),
      cursor?.orderId ?? null, cursor?.lineNumber ?? null, limit,
      capability.issuedAtMs, capability.expiresAtMs, signatureHex,
    ]
  );
}

function historyCall(capability, {
  actorId = capability.actorId,
  role = capability.staffRole,
  orderId,
  limit = 100,
  signatureHex = capability.signatureHex,
} = {}) {
  return operationsPool.query(
    `SELECT * FROM sabora.read_order_operations_history_authorized_candidate(
      $1::text,$2::text,$3::uuid,$4::text,$5::uuid,
      $6::integer,$7::bigint,$8::bigint,$9::text)`,
    [capability.keyId, capability.databaseRole, actorId, role, orderId, limit,
      capability.issuedAtMs, capability.expiresAtMs, signatureHex]
  );
}

test.before(async () => {
  await admin.query(`CREATE ROLE ${staffRole} LOGIN PASSWORD '${staffPassword}'
    NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`CREATE ROLE ${operationsRole} LOGIN PASSWORD '${operationsPassword}'
    NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${staffRole}, ${operationsRole}`);
  await admin.query(`GRANT SELECT (user_id,role,state)
    ON sabora.staff_members TO ${staffRole}`);
  await admin.query(`CREATE POLICY sabora_ci_h4_staff_reader_select
    ON sabora.staff_members FOR SELECT TO ${staffRole} USING (true)`);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.transition_order_line_authorized_candidate(text,text,uuid,uuid,text,text,bigint,bigint,text),
    sabora.read_order_operations_board_authorized_candidate(text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text),
    sabora.read_order_operations_history_authorized_candidate(text,text,uuid,text,uuid,integer,bigint,bigint,text)
    TO ${operationsRole}`);
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys
    (key_id,hmac_key,not_before,expires_at)
    VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
            clock_timestamp()+interval '1 hour')`,
  [keyId, signingSecret.toString('hex')]);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state) VALUES
    ($1,'kitchen','active'),($2,'waiter','active'),
    ($3,'admin','active'),($4,'kitchen','active')`,
  [kitchenId, waiterId, adminId, expiringId]);

  staffPool = poolFor(staffRole, staffPassword, 2);
  operationsPool = poolFor(operationsRole, operationsPassword, 8);
  issueTransitionCapability = createOrderOperationCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
  });
  issueReadCapability = createOrderOperationReadCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
  });
  app = await createVerifiedOrderOperationsCandidate({
    staffPool, operationsPool, staffRole, operationsRole,
    issuer: authIssuer, getTrustedKeys: async () => [authJwk],
    issueTransitionCapability, issueReadCapability,
  });
  for (const [method, url] of [
    ['GET', '/api/v1/operations/order-lines'],
    ['POST', '/api/v1/operations/order-lines/:lineId/transitions'],
    ['GET', '/api/v1/operations/orders/:orderId/history'],
  ]) {
    assert.equal(app.hasRoute({method, url}), true,
      'candidate must mount all three protected routes after SQL preflight');
  }
});

test.after(async () => {
  await app?.close();
  await staffPool?.end();
  await operationsPool?.end();
  await admin.end();
});

test('PG17 full operations principal has exactly three wrappers and no escalation path', async () => {
  assert.deepEqual(await preflightOrderOperationsRuntimeIdentity({
    pool: operationsPool, role: operationsRole,
  }), {role: operationsRole});
  for (const sql of [
    'SELECT * FROM sabora.orders',
    'SELECT * FROM sabora.order_lines',
    'SELECT * FROM sabora.order_line_events',
    'SELECT * FROM sabora.pickup_notifications',
    'SELECT * FROM sabora.staff_members',
    'SELECT * FROM sabora.order_operation_signing_keys',
    'SELECT * FROM sabora.transition_order_line_idempotent_candidate($1,$2,$3,$4)',
    'CREATE TABLE sabora.forbidden_h4_table(id integer)',
    'SET ROLE sabora_order_operations_fn_owner',
  ]) {
    const parameters = sql.includes('$1')
      ? [kitchenId, 'a3000000-0000-4000-8000-000000000001', 'preparing', 'forbidden_rpc_001']
      : [];
    await assert.rejects(operationsPool.query(sql, parameters));
  }
  await assert.rejects(staffPool.query(
    `SELECT * FROM sabora.read_order_operations_board_authorized_candidate(
      'missingkey','${staffRole}',$1,'kitchen',NULL,NULL,NULL,NULL,10,1,2,repeat('0',64))`,
  [kitchenId]));
});

test('PG17 real JWT drives kitchen, durable ready notice, waiter pickup, replay and history', async () => {
  const item = await directFixture(401);
  const boardUrl = '/api/v1/operations/order-lines?status=confirmed&limit=100';
  assert.equal((await app.inject({method: 'GET', url: boardUrl})).statusCode, 401);
  assert.equal((await app.inject({
    method: 'GET', url: boardUrl, headers: headers(customerId),
  })).statusCode, 403);
  const tampered = bearer(kitchenId).split('.');
  tampered[2] = `${tampered[2][0] === 'A' ? 'B' : 'A'}${tampered[2].slice(1)}`;
  assert.equal((await app.inject({
    method: 'GET', url: boardUrl,
    headers: {authorization: `Bearer ${tampered.join('.')}`},
  })).statusCode, 401);

  const initial = await app.inject({method: 'GET', url: boardUrl, headers: headers(kitchenId)});
  assert.equal(initial.statusCode, 200, initial.body);
  assert.ok(initial.json().items.some((line) => line.lineId === item.lineId));
  const transition = (userId, targetStatus, correlationId) => app.inject({
    method: 'POST',
    url: `/api/v1/operations/order-lines/${item.lineId}/transitions`,
    headers: headers(userId), payload: {targetStatus, correlationId},
  });
  assert.equal((await transition(waiterId, 'preparing', 'h4_waiter_forbidden_401')).statusCode, 403);
  assert.equal((await transition(kitchenId, 'picked_up', 'h4_kitchen_forbidden_401')).statusCode, 403);
  const preparing = await transition(kitchenId, 'preparing', 'h4_prepare_401');
  assert.equal(preparing.statusCode, 201, preparing.body);
  const replay = await transition(kitchenId, 'preparing', 'h4_prepare_401');
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.json().eventId, preparing.json().eventId);
  const ready = await transition(kitchenId, 'ready', 'h4_ready_401');
  assert.equal(ready.statusCode, 201, ready.body);

  const waiterBoard = await app.inject({
    method: 'GET', url: '/api/v1/operations/order-lines?status=ready&limit=100',
    headers: headers(waiterId),
  });
  assert.equal(waiterBoard.statusCode, 200, waiterBoard.body);
  const alert = waiterBoard.json().items.find((line) => line.lineId === item.lineId);
  assert.equal(alert.notification.id, ready.json().notificationId);
  assert.equal(alert.notification.acknowledgedAt, null);
  const picked = await transition(waiterId, 'picked_up', 'h4_pickup_401');
  assert.equal(picked.statusCode, 201, picked.body);
  const history = await app.inject({
    method: 'GET', url: `/api/v1/operations/orders/${item.orderId}/history?limit=100`,
    headers: headers(waiterId),
  });
  assert.equal(history.statusCode, 200, history.body);
  assert.deepEqual(history.json().events.map((event) => event.toStatus),
    ['preparing', 'ready', 'picked_up']);
  assert.deepEqual(history.json().events.map((event) => event.actorRole),
    ['kitchen', 'kitchen', 'waiter']);
  const durable = await admin.query(`SELECT line.status,
    (SELECT count(*)::integer FROM sabora.order_line_events event
      WHERE event.order_line_id=line.id) AS events,
    (SELECT count(*)::integer FROM sabora.order_line_transition_requests request
      WHERE request.order_line_id=line.id) AS requests,
    (SELECT count(*)::integer FROM sabora.pickup_notifications notice
      WHERE notice.order_line_id=line.id AND notice.acknowledged_at IS NOT NULL) AS acknowledged
    FROM sabora.order_lines line WHERE line.id=$1`, [item.lineId]);
  assert.deepEqual(durable.rows[0], {
    status: 'picked_up', events: 3, requests: 3, acknowledged: 1,
  });
});

test('PG17 read capabilities reject tampering, widening, expiry and cross-actor replay', async () => {
  const item = await directFixture(402);
  const input = {
    actorId: kitchenId, role: 'kitchen', operation: 'board',
    status: 'confirmed', limit: 25, cursor: null,
  };
  const capability = issueReadCapability(input);
  const valid = await boardCall(capability, {status: 'confirmed', limit: 25});
  assert.ok(valid.rows.some((row) => row.line_id === item.lineId));
  await assert.rejects(boardCall(capability, {
    status: 'ready', limit: 25,
  }), /invalid_order_operation_read_capability/);
  await assert.rejects(boardCall(capability, {
    actorId: waiterId, role: 'waiter', status: 'ready', limit: 25,
  }), /invalid_order_operation_read_capability/);
  await assert.rejects(boardCall(capability, {
    status: 'confirmed', limit: 25,
    signatureHex: `${capability.signatureHex.slice(0, 63)}` +
      (capability.signatureHex.endsWith('0') ? '1' : '0'),
  }), /invalid_order_operation_read_capability/);
  const expiredIssuer = createOrderOperationReadCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
    ttlMs: 100, clock: () => Date.now() - 60_000,
  });
  const expired = expiredIssuer(input);
  await assert.rejects(boardCall(expired, {status: 'confirmed', limit: 25}),
    /invalid_order_operation_read_capability/);

  const historyCapability = issueReadCapability({
    actorId: waiterId, role: 'waiter', operation: 'history', orderId: item.orderId, limit: 20,
  });
  await assert.rejects(historyCall(historyCapability, {
    orderId: 'a3000000-0000-4000-8000-000000000999', limit: 20,
  }), /invalid_order_operation_read_capability/);
});

test('PG17 read authorization rechecks expiry and revocation after lock waits', async () => {
  const shortIssuer = createOrderOperationReadCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
    ttlMs: 150,
  });
  const blocker = await admin.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(`UPDATE sabora.staff_members SET state=state WHERE user_id=$1`,
      [expiringId]);
    const capability = shortIssuer({
      actorId: expiringId, role: 'kitchen', operation: 'board',
      status: null, limit: 10, cursor: null,
    });
    const pending = boardCall(capability, {status: null, limit: 10});
    // Install the rejection observer before the deliberate lock wait. On a
    // heavily loaded runner the capability can expire and reject while the
    // test is still sleeping, which Node would otherwise report as unhandled.
    const pendingRejection = assert.rejects(pending,
      /invalid_order_operation_read_capability/);
    await wait(300);
    await blocker.query('COMMIT');
    await pendingRejection;

    await blocker.query('BEGIN');
    await blocker.query(`UPDATE sabora.order_operation_signing_keys
      SET disabled_at=clock_timestamp() WHERE key_id=$1`, [keyId]);
    const revoked = issueReadCapability({
      actorId: kitchenId, role: 'kitchen', operation: 'board',
      status: null, limit: 10, cursor: null,
    });
    const denied = boardCall(revoked, {status: null, limit: 10});
    const deniedRejection = assert.rejects(denied,
      /invalid_order_operation_read_capability/);
    await wait(100);
    await blocker.query('COMMIT');
    await deniedRejection;
    await admin.query(`UPDATE sabora.order_operation_signing_keys
      SET disabled_at=NULL WHERE key_id=$1`, [keyId]);
  } finally {
    try { await blocker.query('ROLLBACK'); } catch { /* already closed */ }
    blocker.release();
  }

  const suspended = issueReadCapability({
    actorId: expiringId, role: 'kitchen', operation: 'board',
    status: null, limit: 10, cursor: null,
  });
  await admin.query(`UPDATE sabora.staff_members SET state='suspended' WHERE user_id=$1`,
    [expiringId]);
  await assert.rejects(boardCall(suspended, {status: null, limit: 10}),
    /actor_not_authorized/);
  await admin.query(`UPDATE sabora.staff_members SET state='active' WHERE user_id=$1`,
    [expiringId]);
});

test('PG17 canonical customer confirmation reaches restricted kitchen and waiter flow atomically', async () => {
  const tableId = 'a4000000-0000-4000-8000-000000000501';
  const itemId = 'a4000000-0000-4000-8000-000000000502';
  const profileId = 'a4000000-0000-4000-8000-000000000503';
  const orderId = 'a4000000-0000-4000-8000-000000000504';
  const qrToken = 'ci_h5_authorized_qr_'.repeat(3);
  const sessionToken = 'ci_h5_customer_session_'.repeat(3);
  const visitId = 'visit_h5_real_501';
  const actorId = 'actor_h5_real_501';
  const basketId = 'basket_h5_real_501';
  const snapshot = {
    name: 'Corvina de costa', category: 'Primeros', priceCents: 2400,
    allergens: ['pescado'], options: [], extras: [], discount: null,
  };
  const selection = {options: {}, extras: []};
  const evidence = buildCatalogLineEvidence({
    itemId, publishedRevision: 1, snapshot, selection, quantity: 1,
  });
  const table = await admin.query(`INSERT INTO sabora.dining_tables
    (id,number,capacity,qr_token_hash,ordering_state)
    VALUES ($1,970501,4,sha256(convert_to($2,'UTF8')),'open')
    RETURNING session_id,qr_version`, [tableId, qrToken]);
  await admin.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
    VALUES ($1,'SB-555555555555','Cliente H5')`, [profileId]);
  await admin.query(`INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
    VALUES ($1,sha256(convert_to($2,'UTF8')),clock_timestamp()+interval '1 hour')`,
  [profileId, sessionToken]);
  await admin.query(`INSERT INTO sabora.customer_table_visits
    (table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 hour')`,
  [tableId, table.rows[0].session_id, profileId, visitId, actorId,
    table.rows[0].qr_version]);
  await admin.query(`INSERT INTO sabora.catalog_items
    (id,draft,draft_revision,published_revision,published_snapshot,published_at)
    VALUES ($1,$2::jsonb,1,1,$2::jsonb,clock_timestamp())`,
  [itemId, JSON.stringify(snapshot)]);
  await admin.query(`INSERT INTO sabora.catalog_displayed_quotes
    (table_id,session_id,visit_id,basket_id,actor_id,item_id,
     published_revision,subtotal_cents,discount_cents,total_cents,evidence,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10::jsonb,
      clock_timestamp()+interval '5 minutes')`,
  [tableId, table.rows[0].session_id, visitId, basketId, actorId, itemId,
    evidence.subtotalCents, evidence.discountCents, evidence.totalCents,
    JSON.stringify(evidence)]);
  const confirm = createCatalogOrderConfirmationPoolCandidate({
    pool: admin,
    secretKey: 'ci-only-h5-confirmation-secret-key-32',
    newOrderId: () => orderId,
  });
  const request = {
    tableId, visitId, basketId, actorId, itemId, selection, quantity: 1,
    requestKey: 'h5_customer_confirm_501', qrToken,
    customerSessionToken: sessionToken,
  };
  assert.equal((await confirm(request)).status, 'confirmed');
  assert.equal((await confirm(request)).status, 'replayed');
  const line = await admin.query(
    'SELECT id,status FROM sabora.order_lines WHERE order_id=$1', [orderId]);
  assert.equal(line.rows.length, 1);
  assert.equal(line.rows[0].status, 'confirmed');

  const change = (userId, targetStatus, correlationId) => app.inject({
    method: 'POST',
    url: `/api/v1/operations/order-lines/${line.rows[0].id}/transitions`,
    headers: headers(userId), payload: {targetStatus, correlationId},
  });
  const kitchenBoard = await app.inject({
    method: 'GET', url: '/api/v1/operations/order-lines?status=confirmed&limit=100',
    headers: headers(kitchenId),
  });
  assert.ok(kitchenBoard.json().items.some((entry) => entry.lineId === line.rows[0].id));
  assert.equal((await change(kitchenId, 'preparing', 'h5_prepare_501')).statusCode, 201);
  assert.equal((await change(kitchenId, 'ready', 'h5_ready_501')).statusCode, 201);
  const waiterBoard = await app.inject({
    method: 'GET', url: '/api/v1/operations/order-lines?status=ready&limit=100',
    headers: headers(waiterId),
  });
  assert.ok(waiterBoard.json().items.some((entry) => entry.lineId === line.rows[0].id));
  assert.equal((await change(waiterId, 'picked_up', 'h5_pickup_501')).statusCode, 201);
  const counts = await admin.query(`SELECT
    (SELECT count(*)::integer FROM sabora.orders WHERE id=$1) AS orders,
    (SELECT count(*)::integer FROM sabora.catalog_confirmation_attempts WHERE order_id=$1) AS attempts,
    (SELECT count(*)::integer FROM sabora.order_lines WHERE order_id=$1) AS lines,
    (SELECT count(*)::integer FROM sabora.order_line_events WHERE order_id=$1) AS events,
    (SELECT count(*)::integer FROM sabora.pickup_notifications WHERE order_id=$1) AS notices`,
  [orderId]);
  assert.deepEqual(counts.rows[0], {
    orders: 1, attempts: 1, lines: 1, events: 3, notices: 1,
  });
});

test('PG17 management authenticated gateway traverses actual candidate HTTP and durable SQL', async () => {
  const item = await directFixture(403);
  let tokenReads = 0;
  const gateway = createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => {
      tokenReads++;
      return bearer(kitchenId);
    },
    fetchImpl: async (path, options) => {
      const headers = Object.fromEntries(new Headers(options.headers).entries());
      const response = await app.inject({
        method: options.method,
        url: path,
        headers,
        payload: options.body,
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: {'content-type': response.headers['content-type'] ?? 'application/json'},
      });
    },
  });
  const board = await gateway.listBoard({status: 'confirmed', limit: 100});
  assert.ok(board.items.some((line) => line.lineId === item.lineId));
  const preparing = await gateway.transitionLine({
    lineId: item.lineId, targetStatus: 'preparing',
    correlationId: 'management_gateway_prepare_403',
  });
  assert.equal(preparing.currentStatus, 'preparing');
  const ready = await gateway.transitionLine({
    lineId: item.lineId, targetStatus: 'ready',
    correlationId: 'management_gateway_ready_403',
  });
  assert.equal(ready.currentStatus, 'ready');
  const history = await gateway.listHistory({orderId: item.orderId, limit: 100});
  assert.deepEqual(history.events.map((event) => event.toStatus), ['preparing', 'ready']);
  assert.equal(tokenReads, 4, 'every management operation requires a fresh access token');
  const durable = await admin.query(
    'SELECT status FROM sabora.order_lines WHERE id=$1', [item.lineId]);
  assert.equal(durable.rows[0].status, 'ready');
});

test('PG17 management gateways complete kitchen-to-waiter pickup with role boundaries and replay', async () => {
  const item = await directFixture(404, 'Mesa entrega integrada');
  const makeGateway = (userId) => createAuthenticatedOrderOperationsGateway({
    getAccessToken: async () => bearer(userId),
    fetchImpl: async (path, options) => {
      const response = await app.inject({
        method: options.method,
        url: path,
        headers: Object.fromEntries(new Headers(options.headers).entries()),
        payload: options.body,
      });
      return new Response(response.body, {
        status: response.statusCode,
        headers: {'content-type': response.headers['content-type'] ?? 'application/json'},
      });
    },
  });
  const kitchen = makeGateway(kitchenId);
  const waiter = makeGateway(waiterId);
  await assert.rejects(
    waiter.transitionLine({lineId: item.lineId, targetStatus:'preparing',
      correlationId:'management_forbidden_waiter_404'}),
    (error) => error.code === 'forbidden');
  await kitchen.transitionLine({lineId:item.lineId, targetStatus:'preparing',
    correlationId:'management_prepare_404'});
  const first = await kitchen.transitionLine({lineId:item.lineId, targetStatus:'ready',
    correlationId:'management_ready_404'});
  assert.equal(first.repeated, false);
  const replay = await kitchen.transitionLine({lineId:item.lineId, targetStatus:'ready',
    correlationId:'management_ready_404'});
  assert.equal(replay.repeated, true);
  const ready = await waiter.listBoard({status:'ready'});
  assert.ok(ready.items.some(line=>line.lineId===item.lineId));
  await assert.rejects(
    kitchen.transitionLine({lineId:item.lineId,targetStatus:'picked_up',
      correlationId:'management_forbidden_kitchen_404'}),
    (error) => error.code === 'forbidden');
  const pickup = await waiter.transitionLine({lineId:item.lineId,
    targetStatus:'picked_up',correlationId:'management_pickup_404'});
  assert.equal(pickup.currentStatus, 'picked_up');
  const history = await waiter.listHistory({orderId:item.orderId});
  assert.deepEqual(history.events.map(event=>event.toStatus),
    ['preparing','ready','picked_up']);
  const counts = await admin.query(`SELECT
    (SELECT count(*)::integer FROM sabora.order_line_events WHERE order_id=$1) AS events,
    (SELECT count(*)::integer FROM sabora.pickup_notifications WHERE order_id=$1) AS notices`,
    [item.orderId]);
  assert.deepEqual(counts.rows[0], {events:3, notices:1});
});


test('Chromium management PWA traverses signed Fastify candidate and disposable PG17 kitchen-to-waiter', {timeout: 120000}, async () => {
  const {spawn} = await import('node:child_process');
  const {pathToFileURL} = await import('node:url');
  const {chromium} = await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  const item = await directFixture(405, 'Mesa navegador real');
  const port = 4189;
  const origin = `http://127.0.0.1:${port}`;
  const vite = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: new URL('../../apps/management/', import.meta.url).pathname,
    stdio: 'ignore',
  });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (vite.exitCode !== null) throw Error('isolated_vite_exited');
      try {
        const response = await fetch(origin, {signal: AbortSignal.timeout(1000)});
        if (response.ok) { ready = true; break; }
      } catch { /* server starting */ }
      await wait(250);
    }
    assert.ok(ready, 'isolated Vite server must be ready');
    browser = await chromium.launch({headless: true});
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    const page = await context.newPage();
    let actor = kitchenId;
    const calls = [];
    await page.route('**/api/v1/operations/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname + new URL(request.url()).search;
      const auth = request.headers().authorization;
      calls.push({method: request.method(), path, auth});
      if (path.endsWith('/events')) {
        await route.fulfill({status: 503, contentType:'application/json',
          body: JSON.stringify({error:'order_operations_unavailable'})});
        return;
      }
      const response = await app.inject({
        method: request.method(), url: path,
        headers: {authorization: auth, accept: request.headers().accept || 'application/json',
          'content-type': request.headers()['content-type'] || 'application/json'},
        payload: request.postData() || undefined,
      });
      await route.fulfill({status: response.statusCode,
        contentType: response.headers['content-type'] || 'application/json',
        body: response.body});
    });
    const mount = async () => page.evaluate(async token => {
      const {mountAuthenticatedManagementApp} = await import('/src/main.tsx');
      window.__ciDispose = mountAuthenticatedManagementApp({
        element: document.getElementById('root'),
        getAccessToken: async () => token,
      });
    }, bearer(actor));
    try {
      await page.goto(origin + '/#comandas');
      await mount();
      await page.getByText('Plato H4').first().waitFor({timeout: 15000});
      await page.locator('.order-card').filter({hasText:'Mesa navegador real'}).getByRole('button', {name:'Iniciar preparación'}).click();
      await page.locator('.order-card').filter({hasText:'Mesa navegador real'}).getByRole('button', {name:'Marcar lista'}).waitFor();
      await page.locator('.order-card').filter({hasText:'Mesa navegador real'}).getByRole('button', {name:'Marcar lista'}).click();
      await page.getByText('Lista para recoger').first().waitFor();
      const durable = await admin.query('SELECT status FROM sabora.order_lines WHERE id=$1', [item.lineId]);
      assert.equal(durable.rows[0].status, 'ready');
      await page.evaluate(() => window.__ciDispose());
      actor = waiterId;
      await mount();
      const waiterCard = page.locator('.order-card').filter({hasText:'Mesa navegador real'});
      await waiterCard.getByText('Lista para recoger').waitFor({timeout: 15000});
      assert.equal(await page.getByRole('button',{name:'Marcar lista'}).count(), 0);
      assert.equal(await page.getByRole('button',{name:'Iniciar preparación'}).count(), 0);
      // An absent button is not an authorization boundary: prove that the
      // actual candidate rejects a forged waiter transition at HTTP level.
      const forbidden = await page.evaluate(async ({lineId, token}) => {
        const response = await fetch(`/api/v1/operations/order-lines/${lineId}/transitions`, {
          method:'POST', headers:{authorization:`Bearer ${token}`, 'content-type':'application/json'},
          body:JSON.stringify({targetStatus:'preparing',correlationId:'browser_waiter_denied_405'}),
        });
        return response.status;
      }, {lineId:item.lineId, token:bearer(waiterId)});
      assert.equal(forbidden, 403);
      await waiterCard.getByRole('button',{name:'Ver historial'}).click();
      await page.getByRole('region',{name:'Historial de comanda'}).getByText('Pendiente → En preparación · kitchen').waitFor();
      assert.ok(calls.some(call => call.method === 'POST'));
      assert.ok(calls.every(call => call.auth?.startsWith('Bearer ')));
      assert.ok(calls.some(call => call.path.includes('/history')));
      await page.evaluate(() => window.__ciDispose());
      await page.getByText('Canal operativo sin conectar').first().waitFor();
      const events = await admin.query(
        'SELECT count(*)::integer AS count FROM sabora.order_line_events WHERE order_line_id=$1',
        [item.lineId]);
      assert.equal(events.rows[0].count, 2);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    vite.kill('SIGTERM');
    await new Promise(resolve => {
      if (vite.exitCode !== null) resolve();
      else {vite.once('exit',resolve);setTimeout(resolve,2000).unref();}
    });
  }
});
