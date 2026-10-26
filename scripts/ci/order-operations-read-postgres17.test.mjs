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
import {registerVerifiedRestrictedOrderOperationsFromPools} from '../../apps/api/src/order-operations-composition.mjs';
import {preflightOrderOperationsRuntimeIdentity} from '../../apps/api/src/order-operations-identity-preflight.mjs';

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
  app = Fastify({logger: false});
  await registerVerifiedRestrictedOrderOperationsFromPools(app, {
    staffPool, operationsPool, staffRole, operationsRole,
    issuer: authIssuer, getTrustedKeys: async () => [authJwk],
    issueTransitionCapability, issueReadCapability,
  });
  await app.ready();
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
    await wait(300);
    await blocker.query('COMMIT');
    await assert.rejects(pending, /invalid_order_operation_read_capability/);

    await blocker.query('BEGIN');
    await blocker.query(`UPDATE sabora.order_operation_signing_keys
      SET disabled_at=clock_timestamp() WHERE key_id=$1`, [keyId]);
    const revoked = issueReadCapability({
      actorId: kitchenId, role: 'kitchen', operation: 'board',
      status: null, limit: 10, cursor: null,
    });
    const denied = boardCall(revoked, {status: null, limit: 10});
    await wait(100);
    await blocker.query('COMMIT');
    await assert.rejects(denied, /invalid_order_operation_read_capability/);
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
