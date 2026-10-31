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
import {createH4H6IntegratedCandidate} from '../../apps/api/src/h4-h6-integrated-candidate.mjs';
import {preflightOrderOperationsRuntimeIdentity,
  preflightOrderOperationsH6DeliveryIdentity} from '../../apps/api/src/order-operations-identity-preflight.mjs';
import {createAuthenticatedOrderOperationsGateway} from '../../apps/management/src/order-operations-authenticated-gateway.js';
import {createOrderOperationsRepository} from '../../apps/api/src/order-operations-repository.mjs';
import {registerVerifiedH6DeliveryOrderOperationsFromPools} from '../../apps/api/src/order-operations-composition.mjs';
import {createH6StaffCapabilityIssuer} from '../../apps/api/src/h6-staff-capability.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createCustomerProductionFlow, AUTHORIZE_VISIT_SQL, PREPARE_QUOTE_SQL,
  INSERT_QUOTE_SQL, LOOKUP_ATTEMPT_SQL, PREPARE_CONFIRMATION_SQL,
  READ_H6_PAYMENT_POLICY_SQL, READ_H6_ROUND_SQL, PERSIST_H6_ORDER_SQL}
  from '../../apps/api/src/customer-production-flow.mjs';
import {createCustomerSessionQueryBoundary} from '../../apps/api/src/customer-session-query-boundary.mjs';
import {createCustomerSessionVerifier} from '../../apps/api/src/customer-session-verifier.mjs';
import {createCustomerSessionRevoker} from '../../apps/api/src/customer-session-revoker.mjs';
import {createCustomerCookieAuth} from '../../apps/api/src/customer-cookie-session-candidate.mjs';
import {createH6StripeAdapter} from '../../apps/api/src/h6-stripe-adapter.mjs';

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
const h6CustomerRole = 'sabora_ci_integrated_h6_customer';
const h6ProviderRole = 'sabora_ci_integrated_h6_provider';
const h6OperationsRole = 'sabora_ci_integrated_h6_operations';
const h6NotifierRole = 'sabora_ci_integrated_h6_notifier';
const customerFlowRole = 'sabora_ci_integrated_customer_flow';
const customerSessionRole = 'sabora_ci_integrated_customer_session';
const integrationPasswords = Object.freeze({
  customer: 'sabora_ci_integrated_customer_1',
  provider: 'sabora_ci_integrated_provider_2',
  operations: 'sabora_ci_integrated_operations_3',
  notifier: 'sabora_ci_integrated_notifier_4',
  flow: 'sabora_ci_integrated_flow_5',
  session: 'sabora_ci_integrated_session_6',
});
const keyId = 'ci_h4_read_binding_key_001';
const signingSecret = randomBytes(32);
const kitchenId = 'a1000000-0000-4000-8000-000000000001';
const waiterId = 'a1000000-0000-4000-8000-000000000002';
const adminId = 'a1000000-0000-4000-8000-000000000003';
const expiringId = 'a1000000-0000-4000-8000-000000000004';
const secondWaiterId = 'a1000000-0000-4000-8000-000000000005';
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
let h6CustomerPool;
let h6ProviderPool;
let h6OperationsPool;
let h6NotifierPool;
let customerFlowPool;
let customerSessionPool;
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
  return {tableId, orderId, lineId: line.rows[0].id, sessionId: table.rows[0].session_id};
}

async function integratedFixture(suffix, customerLabel) {
  const fixture = await directFixture(suffix, customerLabel);
  const padded = String(suffix).padStart(12, '0');
  const customerProfileId = `b2000000-0000-4000-8000-${padded}`;
  const accountId = `c2000000-0000-4000-8000-${padded}`;
  const roundId = `d2000000-0000-4000-8000-${padded}`;
  const dispatchId = `e2000000-0000-4000-8000-${padded}`;
  const publicSuffix = String((Number(suffix) % 8) + 2);
  const visitKey = `integrated_visit_${suffix}`;
  await admin.query(`INSERT INTO sabora.customer_profiles(id,public_id,alias)
    VALUES($1,$2,$3)`, [customerProfileId, `SB-ABCDEFGHJKL${publicSuffix}`, customerLabel]);
  await admin.query(`INSERT INTO sabora.customer_accounts(
    id,table_id,session_id,visit_key,customer_id,state)
    VALUES($1,$2,$3,$4,$5,'open')`,
  [accountId, fixture.tableId, fixture.sessionId, visitKey, customerProfileId]);
  await admin.query(`INSERT INTO sabora.customer_table_visits(
    table_id,session_id,customer_id,visit_key,actor_id,authorized_qr_version,expires_at)
    VALUES($1,$2,$3,$4,$5,1,clock_timestamp()+interval '1 hour')`,
  [fixture.tableId, fixture.sessionId, customerProfileId, visitKey, `integrated_actor_${suffix}`]);
  await admin.query(`UPDATE sabora.orders SET company=NULL,employee_number=NULL,
    customer_alias=$2,customer_identifier=$3,customer_visit_key=$4,
    economic_snapshot='{"schemaVersion":"1"}'::jsonb WHERE id=$1`,
  [fixture.orderId, customerLabel, `SB-ABCDEFGHJKL${publicSuffix}`, visitKey]);
  await admin.query(`INSERT INTO sabora.order_rounds(
    id,order_id,account_id,amount_cents,payment_mode,payment_policy_version,
    grouping_deadline,state)
    VALUES($1,$2,$3,0,NULL,1,clock_timestamp()+interval '5 minutes','kitchen_acknowledged')`,
  [roundId, fixture.orderId, accountId]);
  await admin.query(`INSERT INTO sabora.kitchen_dispatches(
    id,round_id,order_id,revision_number,dispatch_key,state,requested_at,acknowledged_at)
    VALUES($1,$2,$3,1,$4,'acknowledged',clock_timestamp(),clock_timestamp())`,
  [dispatchId, roundId, fixture.orderId, `h6_dispatch_integrated_${suffix}_candidate`]);
  return {...fixture, customerProfileId, accountId, roundId, dispatchId};
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
  await admin.query(`
    CREATE ROLE ${h6CustomerRole} LOGIN PASSWORD '${integrationPasswords.customer}'
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE ${h6ProviderRole} LOGIN PASSWORD '${integrationPasswords.provider}'
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE ${h6OperationsRole} LOGIN PASSWORD '${integrationPasswords.operations}'
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE ${h6NotifierRole} LOGIN PASSWORD '${integrationPasswords.notifier}'
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE ${customerFlowRole} LOGIN PASSWORD '${integrationPasswords.flow}'
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE ${customerSessionRole} LOGIN PASSWORD '${integrationPasswords.session}'
      NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;
    GRANT sabora_h6_customer_runtime TO ${h6CustomerRole};
    GRANT sabora_h6_provider_runtime TO ${h6ProviderRole};
    GRANT sabora_h6_operations_runtime TO ${h6OperationsRole};
    GRANT sabora_customer_flow_runtime TO ${customerFlowRole};
    GRANT sabora_customer_session_runtime TO ${customerSessionRole};
  `);
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
    ($3,'admin','active'),($4,'kitchen','active'),($5,'waiter','active')`,
  [kitchenId, waiterId, adminId, expiringId, secondWaiterId]);
  await admin.query(`INSERT INTO sabora.staff_enrollments(
    id,invitee_email_hash,requested_role,state,auth_user_id,invite_token_hash,
    credential_evidence_hash,created_by,created_at,last_invited_at,accepted_at,
    credential_registered_at,activated_at,updated_at,given_name,family_name,
    employee_code,operational_display_id)
   SELECT gen_random_uuid(),sha256(convert_to(source.email,'UTF8')),source.role,'active',
    source.user_id,sha256(convert_to(source.token,'UTF8')),sha256(convert_to(source.credential,'UTF8')),
    $3,statement_timestamp(),statement_timestamp(),statement_timestamp(),statement_timestamp(),
    statement_timestamp(),statement_timestamp(),source.given_name,source.family_name,source.code,source.display_id
   FROM (VALUES
    ($1::uuid,'kitchen','kitchen-integrated@example.invalid','token-kitchen-integrated','credential-kitchen-integrated','Karla','Cocina','811','KC-811'),
    ($2::uuid,'waiter','waiter-integrated@example.invalid','token-waiter-integrated','credential-waiter-integrated','Mario','Sala','812','MS-812'),
    ($3::uuid,'admin','admin-integrated@example.invalid','token-admin-integrated','credential-admin-integrated','Alba','Dirección','813','AD-813'),
    ($4::uuid,'kitchen','expiring-integrated@example.invalid','token-expiring-integrated','credential-expiring-integrated','Eva','Cocina','814','EC-814'),
    ($5::uuid,'waiter','waiter2-integrated@example.invalid','token-waiter2-integrated','credential-waiter2-integrated','Lucía','Sala','815','LS-815')
   ) source(user_id,role,email,token,credential,given_name,family_name,code,display_id)`,
  [kitchenId, waiterId, adminId, expiringId, secondWaiterId]);
  await admin.query(`UPDATE sabora.staff_employee_code_pool pool SET
    enrollment_id=enrollment.id,reserved_at=clock_timestamp()
   FROM sabora.staff_enrollments enrollment WHERE enrollment.employee_code=pool.code
    AND enrollment.auth_user_id=ANY($1::uuid[])`,
  [[kitchenId, waiterId, adminId, expiringId, secondWaiterId]]);

  staffPool = poolFor(staffRole, staffPassword, 2);
  operationsPool = poolFor(operationsRole, operationsPassword, 8);
  h6CustomerPool = poolFor(h6CustomerRole, integrationPasswords.customer, 4);
  h6ProviderPool = poolFor(h6ProviderRole, integrationPasswords.provider, 4);
  h6OperationsPool = poolFor(h6OperationsRole, integrationPasswords.operations, 8);
  h6NotifierPool = poolFor(h6NotifierRole, integrationPasswords.notifier, 2);
  customerFlowPool = poolFor(customerFlowRole, integrationPasswords.flow, 4);
  customerSessionPool = poolFor(customerSessionRole, integrationPasswords.session, 2);
  issueTransitionCapability = createOrderOperationCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
  });
  issueReadCapability = createOrderOperationReadCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
  });
  const flowTx = createRoleScopedPostgresTransaction({pool: customerFlowPool,
    role: 'sabora_customer_flow_runtime', allowedSql: new Set([
      AUTHORIZE_VISIT_SQL, PREPARE_QUOTE_SQL, INSERT_QUOTE_SQL,
      LOOKUP_ATTEMPT_SQL, PREPARE_CONFIRMATION_SQL,
    ])});
  const h6CustomerTx = createRoleScopedPostgresTransaction({pool: h6CustomerPool,
    role: 'sabora_h6_customer_runtime', allowedSql: new Set([
      READ_H6_PAYMENT_POLICY_SQL, READ_H6_ROUND_SQL, PERSIST_H6_ORDER_SQL,
    ])});
  const customerFlow = createCustomerProductionFlow({withTransaction: flowTx,
    withH6Transaction: h6CustomerTx,
    secretKey: 'h4-h6-integrated-customer-basket-key-at-least-32-bytes'});
  const sessionQuery = createCustomerSessionQueryBoundary({pool: customerSessionPool});
  const cookieAuth = createCustomerCookieAuth({allowedOrigin: 'https://ci.h4-h6.sabora.invalid',
    verifyCustomerSession: createCustomerSessionVerifier({query: sessionQuery}),
    revokeCustomerSession: createCustomerSessionRevoker({query: sessionQuery})});
  const stripe = createH6StripeAdapter({
    credential: 'sk_test_h4h6_integrated_candidate',
    request: async () => { throw Error('unexpected_integrated_stripe_call'); },
  });
  const issueStaffCapability = createH6StaffCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: h6OperationsRole,
  });
  app = await createH4H6IntegratedCandidate({
    h4: {staffPool, operationsPool, staffRole, operationsRole,
      issuer: authIssuer, getTrustedKeys: async () => [authJwk],
      issueTransitionCapability, issueReadCapability},
    h6: {cookieAuth, customerFlow, stripe,
      customerPool: h6CustomerPool, providerPool: h6ProviderPool,
      operationsPool: h6OperationsPool, notifierPool: h6NotifierPool,
      expectedCustomerLogin: h6CustomerRole, expectedProviderLogin: h6ProviderRole,
      expectedOperationsLogin: h6OperationsRole, issueStaffCapability,
      eventHeartbeatMs: 5000},
  });
  for (const [method, url] of [
    ['GET', '/api/v1/operations/order-lines'],
    ['POST', '/api/v1/operations/order-lines/:lineId/transitions'],
    ['GET', '/api/v1/operations/orders/:orderId/history'],
    ['POST', '/api/v1/operations/order-lines/:lineId/pickup-claim'],
    ['POST', '/api/v1/operations/order-lines/:lineId/pickup-claim/cancel'],
    ['POST', '/api/v1/operations/order-lines/:lineId/ready-correction'],
    ['GET', '/api/v1/operations/events'],
  ]) {
    assert.equal(app.hasRoute({method, url}), true,
      'candidate must mount all three protected routes after SQL preflight');
  }
});

test.after(async () => {
  await app?.close();
  await admin.query(`UPDATE sabora.staff_employee_code_pool SET enrollment_id=NULL,reserved_at=NULL
    WHERE enrollment_id IN (SELECT id FROM sabora.staff_enrollments
      WHERE auth_user_id=ANY($1::uuid[]))`,
  [[kitchenId, waiterId, adminId, expiringId, secondWaiterId]]);
  await admin.query('DELETE FROM sabora.staff_enrollments WHERE auth_user_id=ANY($1::uuid[])',
    [[kitchenId, waiterId, adminId, expiringId, secondWaiterId]]);
  await Promise.allSettled([staffPool?.end(), operationsPool?.end(), h6CustomerPool?.end(),
    h6ProviderPool?.end(), h6OperationsPool?.end(), h6NotifierPool?.end(),
    customerFlowPool?.end(), customerSessionPool?.end()]);
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


test('Chromium + real JWT + one Fastify listener closes H4 ready, H6 pickup and durable SSE',
  {timeout: 180000}, async () => {
  const {pathToFileURL, fileURLToPath} = await import('node:url');
  const {chromium} = await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  const managementRequire = createRequire(new URL('../../apps/management/package.json', import.meta.url));
  const viteEntry = managementRequire.resolve('vite');
  const {createServer} = await import(pathToFileURL(viteEntry).href);
  const item = await integratedFixture(405, 'Mesa navegador H4 H6');
  const concurrentItem = await integratedFixture(406, 'Mesa concurrencia H4 H6');
  let vite;
  let browser;
  let context;
  let apiClosed = false;
  const browserErrors = [];
  const browserRequests = [];
  try {
    await app.listen({host: '127.0.0.1', port: 0});
    const apiAddress = app.server.address();
    assert.ok(apiAddress && typeof apiAddress === 'object' && apiAddress.port > 0);
    const apiOrigin = `http://127.0.0.1:${apiAddress.port}`;
    vite = await createServer({
      root: fileURLToPath(new URL('../../apps/management/', import.meta.url)),
      logLevel: 'error',
      server: {host: '127.0.0.1', port: 0, strictPort: false,
        proxy: {'/api': {target: apiOrigin, changeOrigin: false}}},
    });
    await vite.listen();
    const uiAddress = vite.httpServer?.address();
    assert.ok(uiAddress && typeof uiAddress === 'object' && uiAddress.port > 0);
    const origin = `http://127.0.0.1:${uiAddress.port}`;

    const api = async (path, {token, body, method = body ? 'POST' : 'GET', headers: extra = {}} = {}) => {
      const response = await fetch(apiOrigin + path, {method, headers: {
        accept: 'application/json', ...(body ? {'content-type': 'application/json'} : {}),
        ...(token ? {authorization: `Bearer ${token}`} : {}), ...extra,
      }, ...(body ? {body: JSON.stringify(body)} : {})});
      let payload = null;
      if (String(response.headers.get('content-type') ?? '').startsWith('application/json')) {
        payload = await response.json();
      }
      return {status: response.status, body: payload, headers: response.headers};
    };

    // The same listener enforces signed JWTs and roles before any H6 pickup SQL.
    const pickupPath = `/api/v1/operations/order-lines/${concurrentItem.lineId}/pickup-claim`;
    assert.equal((await api(pickupPath, {body: {expectedVersion: 1,
      correlationId: 'integrated_missing_jwt_406'}})).status, 401);
    assert.equal((await api(pickupPath, {token: 'invalid.jwt.value', body: {expectedVersion: 1,
      correlationId: 'integrated_invalid_jwt_406'}})).status, 401);
    assert.equal((await api(pickupPath, {token: bearer(waiterId, {iat: 1, exp: 2}),
      body: {expectedVersion: 1, correlationId: 'integrated_expired_jwt_406'}})).status, 401);
    assert.equal((await api(pickupPath, {token: bearer(customerId), body: {expectedVersion: 1,
      correlationId: 'integrated_nonstaff_jwt_406'}})).status, 403);
    assert.equal((await api(pickupPath, {token: bearer(kitchenId), body: {expectedVersion: 1,
      correlationId: 'integrated_wrong_role_406'}})).status, 403);

    browser = await chromium.launch({headless: true});
    context = await browser.newContext({viewport: {width: 1440, height: 1000},
      reducedMotion: 'reduce'});
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(`pageerror:${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
    });
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/operations/')) {
        browserRequests.push({method: request.method(), url: request.url(),
          authorization: request.headers().authorization});
      }
    });
    await page.goto(origin + '/#comandas');

    const mount = async (actor, {dropFirstSse = false} = {}) => page.evaluate(async ({token, drop}) => {
      if (typeof window.__ciDispose === 'function') window.__ciDispose();
      window.__ciSseRequests ??= [];
      const fetchImpl = async (input, init = {}) => {
        const raw = input instanceof Request ? input.url : String(input);
        const target = new URL(raw, window.location.origin);
        const isSse = target.pathname === '/api/v1/operations/events';
        if (isSse) {
          const requestHeaders = new Headers(init.headers);
          window.__ciSseRequests.push({lastEventId: requestHeaders.get('last-event-id')});
        }
        const response = await fetch(input, init);
        if (!isSse || !drop || window.__ciDroppedSse || !response.ok || !response.body) return response;
        window.__ciDroppedSse = true;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let observed = '';
        const stream = new ReadableStream({
          async pull(controller) {
            const part = await reader.read();
            if (part.done) { controller.close(); return; }
            controller.enqueue(part.value);
            observed += decoder.decode(part.value, {stream: true});
            if (observed.replaceAll('\r\n', '\n').includes('\n\n')) {
              controller.close();
              await reader.cancel().catch(() => {});
            }
          },
          cancel() { return reader.cancel().catch(() => {}); },
        });
        return new Response(stream, {status: response.status, statusText: response.statusText,
          headers: response.headers});
      };
      const {mountAuthenticatedManagementApp} = await import('/src/main.tsx');
      window.__ciDispose = mountAuthenticatedManagementApp({
        element: document.getElementById('root'), getAccessToken: async () => token, fetchImpl,
      });
    }, {token: bearer(actor), drop: dropFirstSse});

    await mount(kitchenId, {dropFirstSse: true});
    const kitchenCard = page.locator('.order-card').filter({hasText: 'Mesa navegador H4 H6'});
    await kitchenCard.getByText('Plato H4').waitFor({timeout: 15000});
    await kitchenCard.getByRole('button', {name: 'Iniciar preparación'}).click();
    await kitchenCard.getByRole('button', {name: 'Marcar lista'}).waitFor();
    await kitchenCard.getByRole('button', {name: 'Marcar lista'}).click();
    await kitchenCard.getByRole('button', {name: 'Corregir: Preparando'}).waitFor({timeout: 15000});
    const ready = (await admin.query(`SELECT l.status,t.state,t.version
      FROM sabora.order_lines l JOIN sabora.pickup_tasks t ON t.order_line_id=l.id
      WHERE l.id=$1`, [item.lineId])).rows[0];
    assert.deepEqual(ready, {status: 'ready', state: 'ready', version: '1'});
    await page.waitForFunction(() => window.__ciSseRequests?.some(value => value.lastEventId !== null),
      null, {timeout: 15000});
    const sseRequests = await page.evaluate(() => window.__ciSseRequests);
    assert.equal(sseRequests[0].lastEventId, null);
    assert.ok(sseRequests.some(value => /^[1-9][0-9]*$/.test(value.lastEventId ?? '')),
      'gateway reconnect must resume with Last-Event-ID after a real SSE transport interruption');

    await mount(waiterId);
    const waiterCard = page.locator('.order-card').filter({hasText: 'Mesa navegador H4 H6'});
    await waiterCard.getByRole('button', {name: 'Voy a recoger'}).waitFor({timeout: 15000});
    assert.equal(await page.getByRole('button', {name: 'Marcar lista'}).count(), 0);
    assert.equal((await api(`/api/v1/operations/order-lines/${item.lineId}/ready-correction`, {
      token: bearer(waiterId), body: {expectedVersion: 1,
        correlationId: 'integrated_waiter_cannot_correct_405'}})).status, 403);

    // An external waiter claims through the same HTTP listener. Chromium must
    // update from the durable SSE event without a manual refresh or polling.
    const externalClaim = await api(`/api/v1/operations/order-lines/${item.lineId}/pickup-claim`, {
      token: bearer(secondWaiterId), body: {expectedVersion: 1,
        correlationId: 'integrated_external_claim_405'}});
    assert.equal(externalClaim.status, 200);
    assert.equal(Object.hasOwn(externalClaim.body, 'claimedBy'), false,
      'pickup mutation response must not expose an auth UUID');
    assert.equal((await admin.query(`SELECT claimed_display_id FROM sabora.pickup_tasks
      WHERE order_line_id=$1`, [item.lineId])).rows[0].claimed_display_id, 'LS-815');
    await waiterCard.getByText('En recogida · responsable LS-815').waitFor({timeout: 15000});
    const cancelButton = waiterCard.getByRole('button', {name: 'Cancelo'});
    await cancelButton.focus();
    assert.equal(await cancelButton.evaluate(element => element === document.activeElement), true);
    await cancelButton.press('Enter');
    await waiterCard.getByRole('button', {name: 'Voy a recoger'}).waitFor({timeout: 15000});
    const claimButton = waiterCard.getByRole('button', {name: 'Voy a recoger'});
    const claimBox = await claimButton.boundingBox();
    assert.ok(claimBox && claimBox.height >= 44 && claimBox.width >= 44);
    await claimButton.click();
    await waiterCard.getByText('En recogida · responsable MS-812').waitFor({timeout: 15000});
    const reassigned = (await admin.query(`SELECT state,version,claimed_by,claimed_display_id
      FROM sabora.pickup_tasks WHERE order_line_id=$1`, [item.lineId])).rows[0];
    assert.deepEqual(reassigned, {state: 'claimed', version: '4',
      claimed_by: waiterId, claimed_display_id: 'MS-812'});
    assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM sabora.pickup_task_events
      WHERE order_line_id=$1`, [item.lineId])).rows[0].n, 4);
    assert.equal((await admin.query(`SELECT status FROM sabora.order_lines WHERE id=$1`,
      [item.lineId])).rows[0].status, 'ready',
    'pickup task acceptance must not synthesize picked_up or delivered');

    // A second complete H4→H6 line proves atomic exclusivity and replay over
    // the actual JWT-protected HTTP composition, not an injected repository.
    const transitionPath = `/api/v1/operations/order-lines/${concurrentItem.lineId}/transitions`;
    assert.equal((await api(transitionPath, {token: bearer(kitchenId),
      body: {targetStatus: 'preparing', correlationId: 'integrated_prepare_406'}})).status, 201);
    assert.equal((await api(transitionPath, {token: bearer(kitchenId),
      body: {targetStatus: 'ready', correlationId: 'integrated_ready_406'}})).status, 201);
    const first = {token: bearer(waiterId), body: {expectedVersion: 1,
      correlationId: 'integrated_claim_waiter_one_406'}};
    const second = {token: bearer(secondWaiterId), body: {expectedVersion: 1,
      correlationId: 'integrated_claim_waiter_two_406'}};
    const claims = await Promise.all([api(pickupPath, first), api(pickupPath, second)]);
    assert.deepEqual(claims.map(value => value.status).sort(), [200, 409]);
    const winnerIndex = claims.findIndex(value => value.status === 200);
    const winner = winnerIndex === 0 ? first : second;
    const replay = await api(pickupPath, winner);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.repeated, true);
    const beforeConflict = (await admin.query(`SELECT state,version,claimed_by FROM sabora.pickup_tasks
      WHERE order_line_id=$1`, [concurrentItem.lineId])).rows[0];
    const idempotencyConflict = await api(pickupPath, {token: winner.token,
      body: {expectedVersion: 2, correlationId: winner.body.correlationId}});
    assert.equal(idempotencyConflict.status, 409);
    assert.equal(idempotencyConflict.body.error, 'h6_operation_conflict');
    const stale = await api(pickupPath, {token: bearer(winnerIndex === 0 ? secondWaiterId : waiterId),
      body: {expectedVersion: 1, correlationId: 'integrated_stale_claim_406'}});
    assert.equal(stale.status, 409);
    assert.equal(stale.body.pickup.taskVersion, 2);
    assert.deepEqual((await admin.query(`SELECT state,version,claimed_by FROM sabora.pickup_tasks
      WHERE order_line_id=$1`, [concurrentItem.lineId])).rows[0], beforeConflict);
    assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM sabora.pickup_task_events
      WHERE order_line_id=$1 AND action='claimed'`, [concurrentItem.lineId])).rows[0].n, 1);

    // Exercise the real gateway resync callback against a retained-cursor gap.
    const kitchenMinimum = Number((await admin.query(`SELECT min(id)::bigint AS id
      FROM sabora.event_outbox WHERE staff_role='kitchen' AND expires_at>clock_timestamp()`)).rows[0].id);
    assert.ok(kitchenMinimum > 1, 'waiter-first dual emission must leave a real stale kitchen cursor');
    const resynced = await page.evaluate(async ({token, staleCursor}) => {
      const {createAuthenticatedOrderOperationsGateway} =
        await import('/src/order-operations-authenticated-gateway.js');
      const gateway = createAuthenticatedOrderOperationsGateway({getAccessToken: async () => token,
        fetchImpl: (input, init = {}) => {
          const headers = new Headers(init.headers);headers.set('Last-Event-ID', String(staleCursor));
          return fetch(input, {...init, headers});
        }});
      return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        const timeout = setTimeout(() => {unsubscribe();reject(Error('integrated_resync_timeout'));}, 10000);
        unsubscribe = gateway.subscribeEvents({onEvent: () => {}, onUnavailable: () => {},
          onResync: () => {clearTimeout(timeout);unsubscribe();resolve(true);}});
      });
    }, {token: bearer(kitchenId), staleCursor: kitchenMinimum - 1});
    assert.equal(resynced, true);

    // Durable state survives a browser reload and the approved desktop/mobile
    // shell remains keyboard reachable without horizontal overflow.
    await page.reload();
    await mount(waiterId);
    await page.locator('.order-card').filter({hasText: 'Mesa navegador H4 H6'})
      .getByText('En recogida · responsable MS-812').waitFor({timeout: 15000});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(browserErrors, [],
      'the complete authorized journey must not emit browser console or page errors');
    browserErrors.length = 0;

    // Suspension invalidates ordinary HTTP immediately and an already-open,
    // otherwise idle SSE stream on its next bounded authorization heartbeat.
    await admin.query("UPDATE sabora.staff_members SET state='suspended' WHERE user_id=$1", [waiterId]);
    try {
      assert.equal((await api('/api/v1/operations/order-lines?limit=10',
        {token: bearer(waiterId)})).status, 403);
      await page.getByText('Reconectando eventos').first().waitFor({timeout: 12000});
    } finally {
      await admin.query("UPDATE sabora.staff_members SET state='active' WHERE user_id=$1", [waiterId]);
    }
    await page.evaluate(() => window.__ciDispose());
    await page.getByText('Canal operativo sin conectar').first().waitFor({timeout: 10000});

    assert.ok(browserRequests.some(call => call.method === 'POST'));
    assert.ok(browserRequests.some(call => new URL(call.url).pathname.endsWith('/events')));
    assert.ok(browserRequests.every(call => call.authorization?.startsWith('Bearer ')));
    assert.ok(browserErrors.every(error =>
      error === 'console:Failed to load resource: the server responded with a status of 403 (Forbidden)'),
    `revocation may emit only its expected denied-resource diagnostic: ${browserErrors.join('; ')}`);
    await context.close();context = null;
    await browser.close();browser = null;
    await vite.close();vite = null;
    await app.close();apiClosed = true;
    const notifierClient = await h6NotifierPool.connect();
    try {
      const channels = await notifierClient.query('SELECT * FROM pg_listening_channels()');
      assert.deepEqual(channels.rows, [], 'Fastify close must UNLISTEN before releasing notifier');
    } finally { notifierClient.release(); }
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await vite?.close().catch(() => {});
    if (!apiClosed) await app.close().catch(() => {});
  }
});

test('PG17 H6/B2 candidate accepts real scoped staff HMAC and keeps unmigrated pending lines hidden',async()=>{
 await admin.query(`GRANT EXECUTE ON FUNCTION sabora.read_order_operations_delivery_pickup_board_h6_candidate(text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text) TO ${operationsRole}`);
 const item=await directFixture(972);
 const capability=issueReadCapability({
  actorId:kitchenId,role:'kitchen',operation:'board',
  status:'confirmed',limit:25,cursor:null,
 });
 const sql=`SELECT * FROM sabora.read_order_operations_delivery_pickup_board_h6_candidate(
  $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::uuid,
  $8::integer,$9::integer,$10::bigint,$11::bigint,$12::text)`;
 const args=[capability.keyId,capability.databaseRole,kitchenId,'kitchen',
  'confirmed',null,null,null,25,capability.issuedAtMs,
  capability.expiresAtMs,capability.signatureHex];
 const valid=await operationsPool.query(sql,args);
 assert.equal(valid.rows.some(row=>row.line_id===item.lineId),false,
  'a legacy pending line without a destination must not appear in H6 delivery board');
 for(const name of ['pickup_task_id','pickup_state','pickup_version',
  'pickup_claimed_display_id','delivery_table_id','delivery_session_id',
  'delivery_visit_key','delivery_version'])
  assert.ok(valid.fields.some(field=>field.name===name),name);
 await assert.rejects(operationsPool.query(sql,[...args.slice(0,3),'waiter','ready',...args.slice(5)]),
  /invalid_order_operation_read_capability/);
});

test('PG17 H6/B2 delivery projection follows A-to-B destination without changing historical order or account',async()=>{
 const item=await integratedFixture(975,'Cliente cambio de mesa H6');
 const destinationTable='a2000000-0000-4000-8000-000000000976';
 await admin.query(`INSERT INTO sabora.dining_tables
  (id,number,capacity,qr_token_hash,ordering_state)
  VALUES($1,970976,4,decode(repeat('a2',32),'hex'),'open')`,[destinationTable]);
 const destSession=(await admin.query('SELECT session_id FROM sabora.dining_tables WHERE id=$1',
  [destinationTable])).rows[0].session_id;
 const visit='delivery_visit_975_abcdefgh';
 await admin.query(`INSERT INTO sabora.order_line_delivery_destinations
  (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
  VALUES($1,$2,$3,$4,$5,$6,$7)`,[
  item.lineId,item.roundId,item.accountId,item.orderId,item.tableId,item.sessionId,
  'delivery_visit_975_source'
 ]);
 const cap=issueReadCapability({actorId:kitchenId,role:'kitchen',
  operation:'board',status:'confirmed',limit:100,cursor:null});
 const sql=`SELECT * FROM sabora.read_order_operations_delivery_pickup_board_h6_candidate(
  $1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::uuid,
  $8::integer,$9::integer,$10::bigint,$11::bigint,$12::text)`;
 const args=[cap.keyId,cap.databaseRole,kitchenId,'kitchen','confirmed',
  null,null,null,100,cap.issuedAtMs,cap.expiresAtMs,cap.signatureHex];
 const before=(await operationsPool.query(sql,args)).rows.find(row=>row.line_id===item.lineId);
 assert.ok(before);
 assert.equal(before.table_number,970975);
 assert.equal(before.delivery_table_id,item.tableId);
 assert.equal(before.delivery_version,'1');
 await admin.query(`UPDATE sabora.order_line_delivery_destinations
  SET table_id=$2,session_id=$3,visit_key=$4,destination_version=2,
  changed_at=clock_timestamp() WHERE order_line_id=$1`,[
  item.lineId,destinationTable,destSession,visit
 ]);
 const after=(await operationsPool.query(sql,args)).rows.find(row=>row.line_id===item.lineId);
 assert.ok(after);
 assert.equal(after.table_number,970976);
 assert.equal(after.delivery_table_id,destinationTable);
 assert.equal(after.delivery_session_id,destSession);
 assert.equal(after.delivery_visit_key,visit);
 assert.equal(after.delivery_version,'2');
 assert.equal(after.pickup_task_id,null);
 const historic=(await admin.query(`SELECT o.table_id,o.session_id,a.table_id AS account_table,
  a.session_id AS account_session FROM sabora.orders o
  JOIN sabora.order_rounds r ON r.order_id=o.id
  JOIN sabora.customer_accounts a ON a.id=r.account_id WHERE o.id=$1`,[item.orderId])).rows[0];
 assert.equal(historic.table_id,item.tableId);
 assert.equal(historic.session_id,item.sessionId);
 assert.equal(historic.account_table,item.tableId);
 assert.equal(historic.account_session,item.sessionId);
});

test('PG17 H6/B2 repository opt-in maps signed A-to-B destination and rejects malformed delivery',async()=>{
 const item=await integratedFixture(977,'Cliente lector H6 B2');
 await admin.query(`INSERT INTO sabora.order_line_delivery_destinations
  (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
  VALUES($1,$2,$3,$4,$5,$6,$7)`,[
  item.lineId,item.roundId,item.accountId,item.orderId,item.tableId,item.sessionId,
  'delivery_visit_977_source'
 ]);
 const capability=issueReadCapability({actorId:kitchenId,role:'kitchen',
  operation:'board',status:'confirmed',limit:100,cursor:null});
 const args={actorId:kitchenId,role:'kitchen',status:'confirmed',
  limit:100,cursor:null,capability};
 const repo=createOrderOperationsRepository({deliveryBoardCandidate:true});
 const query=(sql,params)=>operationsPool.query(sql,params);
 const original=await repo.listBoard(query,args);
 const line=original.items.find(value=>value.lineId===item.lineId);
 assert.ok(line);
 assert.equal(line.tableNumber,970977);
 assert.deepEqual(line.delivery,{
  tableId:item.tableId,sessionId:item.sessionId,
  visitKey:'delivery_visit_977_source',version:1
 });
 assert.equal(line.pickup,null);
 const target='a2000000-0000-4000-8000-000000000978';
 await admin.query(`INSERT INTO sabora.dining_tables
  (id,number,capacity,qr_token_hash,ordering_state)
  VALUES($1,970978,4,decode(repeat('a2',32),'hex'),'open')`,[target]);
 const targetSession=(await admin.query(
  'SELECT session_id FROM sabora.dining_tables WHERE id=$1',[target])).rows[0].session_id;
 await admin.query(`UPDATE sabora.order_line_delivery_destinations
  SET table_id=$2,session_id=$3,visit_key='delivery_visit_977_target',
  destination_version=2,changed_at=clock_timestamp()
  WHERE order_line_id=$1`,[item.lineId,target,targetSession]);
 const moved=(await repo.listBoard(query,args)).items.find(value=>value.lineId===item.lineId);
 assert.equal(moved.tableNumber,970978);
 assert.deepEqual(moved.delivery,{
  tableId:target,sessionId:targetSession,
  visitKey:'delivery_visit_977_target',version:2
 });
 assert.equal((await admin.query('SELECT table_id FROM sabora.orders WHERE id=$1',
  [item.orderId])).rows[0].table_id,item.tableId);
 const corrupt=async(sql,params)=>{
  const result=await query(sql,params);
  return {...result,rows:result.rows.map(row=>row.line_id===item.lineId
   ? {...row,delivery_version:'0'} : row)};
 };
 await assert.rejects(repo.listBoard(corrupt,args),/invalid_order_operations_sql_result/);
 assert.throws(()=>createOrderOperationsRepository({deliveryBoardCandidate:'true'}),
  /invalid_order_operations_repository_config/);
});

test('PG17 H6/B2 runtime preflight rejects ungranted board and accepts only exact candidate privilege',async()=>{
 const routine=`sabora.read_order_operations_delivery_pickup_board_h6_candidate(
 text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text)`;
 // The earlier positive SQL tests grant this permission in the disposable
 // database. The legacy H4 gate must now reject the additional function.
 await assert.rejects(
  preflightOrderOperationsRuntimeIdentity({pool:operationsPool,role:operationsRole}),
  /order_operations_sql_identity_rejected/
 );
 const verified=await preflightOrderOperationsH6DeliveryIdentity({
  pool:operationsPool,role:operationsRole});
 assert.equal(verified.role,operationsRole);
 await admin.query(`REVOKE EXECUTE ON FUNCTION ${routine} FROM ${operationsRole}`);
 try {
  await assert.rejects(preflightOrderOperationsH6DeliveryIdentity({
   pool:operationsPool,role:operationsRole}),/order_operations_sql_identity_rejected/);
  const legacy=await preflightOrderOperationsRuntimeIdentity({
   pool:operationsPool,role:operationsRole});
  assert.equal(legacy.role,operationsRole);
 } finally {
  await admin.query(`GRANT EXECUTE ON FUNCTION ${routine} TO ${operationsRole}`);
 }
});

test('PG17 H6/B2 authenticated Fastify board reflects A-to-B and enforces JWT and role isolation',async()=>{
 const item=await integratedFixture(979,'Mesa HTTP H6 B2');
 const targetId='a2000000-0000-4000-8000-000000000980';
 await admin.query(`INSERT INTO sabora.dining_tables
 (id,number,capacity,qr_token_hash,ordering_state)
 VALUES($1,970980,4,decode(repeat('a2',32),'hex'),'open')`,[targetId]);
 const targetSession=(await admin.query(
  'SELECT session_id FROM sabora.dining_tables WHERE id=$1',[targetId])).rows[0].session_id;
 await admin.query(`INSERT INTO sabora.order_line_delivery_destinations
 (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
 VALUES($1,$2,$3,$4,$5,$6,$7)`,[
  item.lineId,item.roundId,item.accountId,item.orderId,item.tableId,item.sessionId,
  'delivery_visit_979_source'
 ]);
 const h6App=Fastify({logger:false});
 const config={
  staffPool,operationsPool,staffRole,operationsRole,
  issuer:authIssuer,getTrustedKeys:async()=>[authJwk],
  issueTransitionCapability,issueReadCapability,
 };
 try {
  await registerVerifiedH6DeliveryOrderOperationsFromPools(h6App,config);
  await h6App.ready();
  const path='/api/v1/operations/order-lines?status=confirmed&limit=100';
  const request=async(userId,route=path)=>h6App.inject({
   method:'GET',url:route,headers:userId?headers(userId):{},
  });
  const anonymous=await request(null);
  assert.equal(anonymous.statusCode,401);
  const forbidden=await request(waiterId);
  assert.equal(forbidden.statusCode,403);
  const before=await request(kitchenId);
  assert.equal(before.statusCode,200);
  const original=before.json().items.find(line=>line.lineId===item.lineId);
  assert.ok(original);
  assert.equal(original.tableNumber,970979);
  assert.equal(original.delivery.tableId,item.tableId);
  assert.equal(original.delivery.version,1);
  await admin.query(`UPDATE sabora.order_line_delivery_destinations
   SET table_id=$2,session_id=$3,visit_key='delivery_visit_979_target',
   destination_version=2,changed_at=clock_timestamp()
   WHERE order_line_id=$1`,[item.lineId,targetId,targetSession]);
  const after=await request(kitchenId);
  assert.equal(after.statusCode,200);
  const moved=after.json().items.find(line=>line.lineId===item.lineId);
  assert.ok(moved);
  assert.equal(moved.tableNumber,970980);
  assert.deepEqual(moved.delivery,{
   tableId:targetId,sessionId:targetSession,
   visitKey:'delivery_visit_979_target',version:2,
  });
  const historic=(await admin.query(`SELECT table_id,session_id FROM sabora.orders
   WHERE id=$1`,[item.orderId])).rows[0];
  assert.equal(historic.table_id,item.tableId);
  assert.equal(historic.session_id,item.sessionId);
  const transition=async(userId,targetStatus,correlationId)=>h6App.inject({
   method:'POST',
   url:`/api/v1/operations/order-lines/${item.lineId}/transitions`,
   headers:{...headers(userId),'content-type':'application/json'},
   payload:{targetStatus,correlationId},
  });
  const waiterDenied=await transition(waiterId,'preparing','h6_delivery_forbidden_979');
  assert.equal(waiterDenied.statusCode,403);
  const preparing=await transition(kitchenId,'preparing','h6_delivery_prepare_979');
  assert.equal(preparing.statusCode,201);
  const ready=await transition(kitchenId,'ready','h6_delivery_ready_979');
  assert.equal(ready.statusCode,201);
  const waiterBoard=await request(waiterId,
   '/api/v1/operations/order-lines?status=ready&limit=100');
  assert.equal(waiterBoard.statusCode,200);
  const readyLine=waiterBoard.json().items.find(line=>line.lineId===item.lineId);
  assert.ok(readyLine);
  assert.equal(readyLine.tableNumber,970980);
  assert.equal(readyLine.delivery.tableId,targetId);
  const kitchenDenied=await transition(kitchenId,'picked_up','h6_delivery_forbidden_980');
  assert.equal(kitchenDenied.statusCode,403);
  const picked=await transition(waiterId,'picked_up','h6_delivery_picked_979');
  assert.equal(picked.statusCode,201);
  const replay=await transition(waiterId,'picked_up','h6_delivery_picked_979');
  assert.equal(replay.statusCode,200);
  assert.equal(replay.json().repeated,true);
  const history=await h6App.inject({
   method:'GET',url:`/api/v1/operations/orders/${item.orderId}/history`,
   headers:headers(waiterId),
  });
  assert.equal(history.statusCode,200);
  assert.deepEqual(history.json().events.map(event=>event.toStatus),
   ['preparing','ready','picked_up']);
  const unauthorized=await h6App.inject({method:'GET',url:path,headers:{
   authorization:'Bearer invalid.token.value'}});
  assert.equal(unauthorized.statusCode,401);
  const invalidQuery=await request(kitchenId,
   '/api/v1/operations/order-lines?status=confirmed&limit=101');
  assert.equal(invalidQuery.statusCode,400);
 } finally {
  await h6App.close();
 }
});
