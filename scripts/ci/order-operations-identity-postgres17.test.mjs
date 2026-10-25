import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createOrderOperationCapabilityIssuer} from '../../apps/api/src/order-operation-capability.mjs';
import {createOrderOperationsCoordinator} from '../../apps/api/src/order-operations-coordinator.mjs';
import {createOrderOperationsRepository} from '../../apps/api/src/order-operations-repository.mjs';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';
import {registerOrderOperationsHttp} from '../../apps/api/src/order-operations-http.mjs';
import {
  preflightOrderOperationsIdentities,
  preflightOrderTransitionIdentity,
} from '../../apps/api/src/order-operations-identity-preflight.mjs';

// CI-only guard: this file refuses every non-loopback/non-ephemeral target.
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
const admin = new Pool({connectionString: url, max: 4});
const staffRole = 'sabora_ci_staff_identity';
const operationsRole = 'sabora_ci_operations_identity';
const keyId = 'ci_actor_binding_key_001';
const signingSecret = randomBytes(32);
const kitchenId = 'f1000000-0000-4000-8000-000000000001';
const waiterId = 'f1000000-0000-4000-8000-000000000002';
const adminId = 'f1000000-0000-4000-8000-000000000003';
const victimAdminId = 'f1000000-0000-4000-8000-000000000004';
const expiringActorId = 'f1000000-0000-4000-8000-000000000005';
let staffPool;
let operationsPool;
let issueCapability;
let operations;

const authorizedSql = `SELECT *
  FROM sabora.transition_order_line_authorized_candidate(
    $1::text,$2::text,$3::uuid,$4::uuid,$5::text,
    $6::text,$7::bigint,$8::bigint,$9::text
  )`;

function args(capability, overrides = {}) {
  const value = {...capability, ...overrides};
  return [
    value.keyId, value.databaseRole, value.actorId, value.lineId,
    value.targetStatus, value.correlationId, value.issuedAtMs,
    value.expiresAtMs, value.signatureHex,
  ];
}

function context(userId, role) {
  return {verifiedIdentity: {userId}, verifiedStaff: {userId, role}};
}

async function fixture(suffix) {
  const padded = String(suffix).padStart(12, '0');
  const tableId = `f2000000-0000-4000-8000-${padded}`;
  const orderId = `f3000000-0000-4000-8000-${padded}`;
  await admin.query(`INSERT INTO sabora.dining_tables
    (id, number, capacity, qr_token_hash, ordering_state)
    VALUES ($1, $2, 4, decode(repeat('f2',32),'hex'), 'open')`,
  [tableId, 960000 + Number(suffix)]);
  const session = await admin.query(
    'SELECT session_id FROM sabora.dining_tables WHERE id=$1', [tableId]);
  await admin.query(`INSERT INTO sabora.orders
    (id, table_id, session_id, company, employee_number,
     confirmed_at, grouping, items)
    VALUES ($1,$2,$3,'Actor binding','42',clock_timestamp(),'first',
      '[{"category":"main","name":"Plato de seguridad","quantity":1}]'::jsonb)`,
  [orderId, tableId, session.rows[0].session_id]);
  const lines = await admin.query(
    'SELECT id FROM sabora.order_lines WHERE order_id=$1', [orderId]);
  assert.equal(lines.rows.length, 1);
  return {orderId, lineId: lines.rows[0].id};
}

async function state(lineId) {
  const result = await admin.query(`SELECT line.status,
    (SELECT count(*)::integer FROM sabora.order_line_events event
      WHERE event.order_line_id=line.id) AS events,
    (SELECT count(*)::integer FROM sabora.order_line_transition_requests request
      WHERE request.order_line_id=line.id) AS requests,
    (SELECT count(*)::integer FROM sabora.pickup_notifications notification
      WHERE notification.order_line_id=line.id) AS notifications
    FROM sabora.order_lines line WHERE line.id=$1`, [lineId]);
  return result.rows[0];
}

test.before(async () => {
  await admin.query(`CREATE ROLE ${staffRole} LOGIN
    PASSWORD 'sabora_ci_staff_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`CREATE ROLE ${operationsRole} LOGIN
    PASSWORD 'sabora_ci_operations_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${staffRole}, ${operationsRole}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.transition_order_line_authorized_candidate(text,text,uuid,uuid,text,text,bigint,bigint,text)
    TO ${operationsRole}`);
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys
    (key_id, hmac_key, not_before, expires_at)
    VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
            clock_timestamp()+interval '1 hour')`,
  [keyId, signingSecret.toString('hex')]);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state) VALUES
    ($1,'kitchen','active'),($2,'waiter','active'),($3,'admin','active'),
    ($4,'admin','active'),($5,'kitchen','active')`,
  [kitchenId, waiterId, adminId, victimAdminId, expiringActorId]);

  const makePool = (role, password, max = 4) => new Pool({
    connectionString: `postgresql://${role}:${password}@127.0.0.1:${parsed.port}/postgres`,
    max,
    connectionTimeoutMillis: 3000,
    options: '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000',
  });
  staffPool = makePool(staffRole, 'sabora_ci_staff_ephemeral', 1);
  operationsPool = makePool(operationsRole, 'sabora_ci_operations_ephemeral', 8);
  issueCapability = createOrderOperationCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole,
  });
  operations = createOrderOperationsCoordinator({
    withTransaction: createPostgresTransaction({pool: operationsPool}),
    repository: createOrderOperationsRepository(),
    issueTransitionCapability: issueCapability,
  });
});

test.after(async () => {
  await staffPool?.end();
  await operationsPool?.end();
  await admin.end();
});

test('PG17 reproduces the old free-actor SQL impersonation, then removes every unsafe grant', async () => {
  const item = await fixture(201);
  const policies = [
    `CREATE POLICY ci_unsafe_staff ON sabora.staff_members FOR ALL TO ${operationsRole} USING (true) WITH CHECK (true)`,
    `CREATE POLICY ci_unsafe_lines ON sabora.order_lines FOR ALL TO ${operationsRole} USING (true) WITH CHECK (true)`,
    `CREATE POLICY ci_unsafe_notifications ON sabora.pickup_notifications FOR ALL TO ${operationsRole} USING (true) WITH CHECK (true)`,
    `CREATE POLICY ci_unsafe_events ON sabora.order_line_events FOR ALL TO ${operationsRole} USING (true) WITH CHECK (true)`,
    `CREATE POLICY ci_unsafe_requests ON sabora.order_line_transition_requests FOR ALL TO ${operationsRole} USING (true) WITH CHECK (true)`,
  ];
  const grants = [
    [`GRANT SELECT,UPDATE ON sabora.staff_members TO ${operationsRole}`,
      `REVOKE SELECT,UPDATE ON sabora.staff_members FROM ${operationsRole}`],
    [`GRANT SELECT,UPDATE ON sabora.order_lines TO ${operationsRole}`,
      `REVOKE SELECT,UPDATE ON sabora.order_lines FROM ${operationsRole}`],
    [`GRANT SELECT,INSERT,UPDATE ON sabora.pickup_notifications TO ${operationsRole}`,
      `REVOKE SELECT,INSERT,UPDATE ON sabora.pickup_notifications FROM ${operationsRole}`],
    [`GRANT SELECT,INSERT ON sabora.order_line_events TO ${operationsRole}`,
      `REVOKE SELECT,INSERT ON sabora.order_line_events FROM ${operationsRole}`],
    [`GRANT SELECT,INSERT,UPDATE ON sabora.order_line_transition_requests TO ${operationsRole}`,
      `REVOKE SELECT,INSERT,UPDATE ON sabora.order_line_transition_requests FROM ${operationsRole}`],
    [`GRANT EXECUTE ON FUNCTION sabora.require_active_staff_role(uuid) TO ${operationsRole}`,
      `REVOKE EXECUTE ON FUNCTION sabora.require_active_staff_role(uuid) FROM ${operationsRole}`],
    [`GRANT EXECUTE ON FUNCTION sabora.enforce_active_transition_actor() TO ${operationsRole}`,
      `REVOKE EXECUTE ON FUNCTION sabora.enforce_active_transition_actor() FROM ${operationsRole}`],
    [`GRANT EXECUTE ON FUNCTION sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text) TO ${operationsRole}`,
      `REVOKE EXECUTE ON FUNCTION sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text) FROM ${operationsRole}`],
  ];
  for (const statement of policies) await admin.query(statement);
  for (const [grant] of grants) await admin.query(grant);
  const client = await operationsPool.connect();
  try {
    await client.query('BEGIN');
    const forged = await client.query(
      `SELECT * FROM sabora.transition_order_line_idempotent_candidate($1,$2,$3,$4)`,
      [victimAdminId, item.lineId, 'preparing', 'unsafe_impersonation_201']
    );
    assert.equal(forged.rows[0].current_status, 'preparing');
    const attribution = await client.query(`SELECT actor_user_id
      FROM sabora.order_line_events WHERE order_line_id=$1`, [item.lineId]);
    assert.deepEqual(attribution.rows, [{actor_user_id: victimAdminId}],
      'old RPC did not reproduce free-actor attribution');
    await client.query('ROLLBACK');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    for (const [, revoke] of [...grants].reverse()) await admin.query(revoke);
    const policyTables = {
      ci_unsafe_staff: 'staff_members', ci_unsafe_lines: 'order_lines',
      ci_unsafe_notifications: 'pickup_notifications',
      ci_unsafe_events: 'order_line_events',
      ci_unsafe_requests: 'order_line_transition_requests',
    };
    for (const [name, tableName] of Object.entries(policyTables)) {
      await admin.query(`DROP POLICY ${name} ON sabora.${tableName}`);
    }
  }
  assert.deepEqual(await state(item.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
});

test('PG17 positive gate allows only the signed wrapper while route activation remains closed', async () => {
  assert.deepEqual(await preflightOrderTransitionIdentity({
    pool: operationsPool, role: operationsRole,
  }), {role: operationsRole});
  await assert.rejects(preflightOrderOperationsIdentities({
    staffPool, operationsPool, staffRole, operationsRole,
  }), /order_operations_sql_identity_rejected/,
  'full route gate must remain closed while board/history SQL is unapproved');

  const privileges = await admin.query(`SELECT
    has_function_privilege($1,
      'sabora.transition_order_line_authorized_candidate(text,text,uuid,uuid,text,text,bigint,bigint,text)',
      'EXECUTE') AS authorized_execute,
    has_function_privilege($1,
      'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)',
      'EXECUTE') AS unsafe_execute,
    has_table_privilege($1,'sabora.order_operation_signing_keys','SELECT') AS key_read,
    has_table_privilege($1,'sabora.order_lines','SELECT') AS line_read,
    has_table_privilege($1,'sabora.order_lines','UPDATE') AS line_update`, [operationsRole]);
  assert.deepEqual(privileges.rows, [{
    authorized_execute: true, unsafe_execute: false, key_read: false,
    line_read: false, line_update: false,
  }]);
  const unsafeRpcs = await admin.query(`SELECT routine::text AS routine,
    has_function_privilege($1,routine,'EXECUTE') AS can_execute
    FROM unnest(ARRAY[
      'sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)'::regprocedure,
      'sabora.transition_order_line(uuid,uuid,text)'::regprocedure,
      'sabora.transition_order_status(uuid,uuid,text,text)'::regprocedure,
      'sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz)'::regprocedure
    ]) routine ORDER BY routine::text`, [operationsRole]);
  assert.equal(unsafeRpcs.rows.length, 4);
  assert.ok(unsafeRpcs.rows.every((row) => row.can_execute === false));
});

test('PG17 signed-transition preflight rejects database CREATE privilege drift', async () => {
  await admin.query(`GRANT CREATE ON DATABASE postgres TO ${operationsRole}`);
  try {
    await assert.rejects(preflightOrderTransitionIdentity({
      pool: operationsPool, role: operationsRole,
    }), /order_operations_sql_identity_rejected/);
  } finally {
    await admin.query(`REVOKE CREATE ON DATABASE postgres FROM ${operationsRole}`);
    await admin.query('DROP SCHEMA IF EXISTS sabora_ci_forbidden_database_create');
  }
  assert.deepEqual(await preflightOrderTransitionIdentity({
    pool: operationsPool, role: operationsRole,
  }), {role: operationsRole});
});

test('PG17 legitimate kitchen, waiter and ADMIN transitions work through the minimal login', async () => {
  const cycle = await fixture(202);
  const preparing = await operations.transitionLine(context(kitchenId, 'kitchen'), {
    lineId: cycle.lineId, targetStatus: 'preparing', correlationId: 'signed_prepare_202',
  });
  const replay = await operations.transitionLine(context(kitchenId, 'kitchen'), {
    lineId: cycle.lineId, targetStatus: 'preparing', correlationId: 'signed_prepare_202',
  });
  assert.equal(preparing.repeated, false);
  assert.equal(replay.repeated, true);
  assert.equal(replay.eventId, preparing.eventId);
  await operations.transitionLine(context(kitchenId, 'kitchen'), {
    lineId: cycle.lineId, targetStatus: 'ready', correlationId: 'signed_ready_202',
  });
  await operations.transitionLine(context(waiterId, 'waiter'), {
    lineId: cycle.lineId, targetStatus: 'picked_up', correlationId: 'signed_pickup_202',
  });
  assert.deepEqual(await state(cycle.lineId), {
    status: 'picked_up', events: 3, requests: 3, notifications: 1,
  });

  const byAdmin = await fixture(203);
  const adminResult = await operations.transitionLine(context(adminId, 'admin'), {
    lineId: byAdmin.lineId, targetStatus: 'preparing', correlationId: 'signed_admin_203',
  });
  assert.equal(adminResult.currentStatus, 'preparing');
  const attribution = await admin.query(`SELECT actor_user_id FROM sabora.order_line_events
    WHERE order_line_id=$1`, [byAdmin.lineId]);
  assert.deepEqual(attribution.rows, [{actor_user_id: adminId}]);
});

test('PG17 technical SQL credential cannot forge another actor via UUID, GUC, role or old RPC', async () => {
  const item = await fixture(204);
  const legitimate = issueCapability({
    actorId: kitchenId, lineId: item.lineId, targetStatus: 'preparing',
    correlationId: 'signed_legitimate_204',
  });
  const client = await operationsPool.connect();
  try {
    await client.query(`SELECT set_config('request.jwt.claims',$1,false)`,
      [JSON.stringify({sub: victimAdminId, role: 'admin'})]);
    await assert.rejects(client.query(authorizedSql, args(legitimate, {
      actorId: victimAdminId,
    })), /invalid_order_operation_capability/);
    await assert.rejects(client.query(`SET ROLE sabora_order_operations_fn_owner`),
      /permission denied to set role/);
    await assert.rejects(client.query(
      `SELECT * FROM sabora.transition_order_line_idempotent_candidate($1,$2,$3,$4)`,
      [victimAdminId, item.lineId, 'preparing', 'unsafe_direct_retry_204']
    ), /permission denied/);
  } finally {
    client.release();
  }
  assert.deepEqual(await state(item.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
});

test('PG17 NULL target cannot bypass HMAC checks or disclose another actor replay', async () => {
  const item = await fixture(213);
  const correlationId = 'signed_victim_replay_213';
  const legitimate = await operations.transitionLine(context(victimAdminId, 'admin'), {
    lineId: item.lineId, targetStatus: 'preparing', correlationId,
  });
  assert.equal(legitimate.repeated, false);

  const knownFields = issueCapability({
    actorId: victimAdminId, lineId: item.lineId, targetStatus: 'preparing',
    correlationId,
  });
  await assert.rejects(operationsPool.query(authorizedSql, args(knownFields, {
    targetStatus: null,
    signatureHex: '0'.repeat(64),
  })), /invalid_order_operation_capability/);
  assert.deepEqual(await state(item.lineId), {
    status: 'preparing', events: 1, requests: 1, notifications: 0,
  });
});

test('PG17 rejects tampered, cross-operation, expired and unknown-key capabilities without effects', async () => {
  const item = await fixture(205);
  const other = await fixture(206);
  const valid = issueCapability({
    actorId: kitchenId, lineId: item.lineId, targetStatus: 'preparing',
    correlationId: 'signed_tamper_205',
  });
  const cases = [
    {lineId: other.lineId},
    {targetStatus: 'ready'},
    {correlationId: 'signed_tamper_206'},
    {databaseRole: staffRole},
    {signatureHex: '0'.repeat(64)},
    {keyId: 'unknown_key_001'},
    {issuedAtMs: valid.issuedAtMs - 60_000, expiresAtMs: valid.issuedAtMs - 30_000},
  ];
  for (const override of cases) {
    await assert.rejects(operationsPool.query(authorizedSql, args(valid, override)),
      /invalid_order_operation_capability/);
  }
  assert.deepEqual(await state(item.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
  assert.deepEqual(await state(other.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
});

test('PG17 expiration is rechecked after waiting for the membership lock', async () => {
  const item = await fixture(207);
  const shortIssuer = createOrderOperationCapabilityIssuer({
    keyId, secret: signingSecret, databaseRole: operationsRole, ttlMs: 150,
  });
  const capability = shortIssuer({
    actorId: expiringActorId, lineId: item.lineId, targetStatus: 'preparing',
    correlationId: 'signed_expires_wait_207',
  });
  const blocker = await admin.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(`UPDATE sabora.staff_members SET state=state WHERE user_id=$1`,
      [expiringActorId]);
    let settled = false;
    const attempt = operationsPool.query(authorizedSql, args(capability))
      .finally(() => { settled = true; });
    const rejectedAfterWait = assert.rejects(
      attempt, /invalid_order_operation_capability/
    );
    await new Promise((resolve) => setTimeout(resolve, 275));
    assert.equal(settled, false);
    await blocker.query('COMMIT');
    await rejectedAfterWait;
  } finally {
    await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
  }
  assert.deepEqual(await state(item.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
});

test('PG17 key disablement wins when it acquires the key lock first', async () => {
  const item = await fixture(212);
  const capability = issueCapability({
    actorId: kitchenId, lineId: item.lineId, targetStatus: 'preparing',
    correlationId: 'signed_key_disable_212',
  });
  const blocker = await admin.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(`UPDATE sabora.order_operation_signing_keys
      SET disabled_at=clock_timestamp() WHERE key_id=$1`, [keyId]);
    let settled = false;
    const attempt = operationsPool.query(authorizedSql, args(capability))
      .finally(() => { settled = true; });
    const rejectedAfterDisable = assert.rejects(
      attempt, /invalid_order_operation_capability/
    );
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(settled, false);
    await blocker.query('COMMIT');
    await rejectedAfterDisable;
  } finally {
    await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
    await admin.query(`UPDATE sabora.order_operation_signing_keys
      SET disabled_at=NULL WHERE key_id=$1`, [keyId]);
  }
  assert.deepEqual(await state(item.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
});

test('PG17 suspended or role-changed actors cannot mutate or recover signed replays', async () => {
  const item = await fixture(208);
  const first = issueCapability({
    actorId: expiringActorId, lineId: item.lineId, targetStatus: 'preparing',
    correlationId: 'signed_before_suspend_208',
  });
  await operationsPool.query(authorizedSql, args(first));
  await admin.query(`UPDATE sabora.staff_members SET state='suspended' WHERE user_id=$1`,
    [expiringActorId]);
  await assert.rejects(operationsPool.query(authorizedSql, args(first)),
    /actor_not_authorized/);
  await admin.query(`UPDATE sabora.staff_members SET state='active',role='waiter' WHERE user_id=$1`,
    [expiringActorId]);
  const changedRole = issueCapability({
    actorId: expiringActorId, lineId: item.lineId, targetStatus: 'ready',
    correlationId: 'signed_role_changed_208',
  });
  await assert.rejects(operationsPool.query(authorizedSql, args(changedRole)),
    /role_not_allowed_for_line_transition/);
  assert.deepEqual(await state(item.lineId), {
    status: 'preparing', events: 1, requests: 1, notifications: 0,
  });
});

test('PG17 concurrent signed retries serialize and transaction rollback is complete', async () => {
  const concurrent = await fixture(209);
  const input = {
    lineId: concurrent.lineId, targetStatus: 'preparing',
    correlationId: 'signed_concurrent_209',
  };
  const results = await Promise.all([
    operations.transitionLine(context(kitchenId, 'kitchen'), input),
    operations.transitionLine(context(kitchenId, 'kitchen'), input),
  ]);
  assert.deepEqual(results.map((value) => value.repeated).sort(), [false, true]);
  assert.equal(new Set(results.map((value) => value.eventId)).size, 1);

  const rollback = await fixture(210);
  const repository = createOrderOperationsRepository();
  const withTransaction = createPostgresTransaction({pool: operationsPool});
  const rollbackCapability = issueCapability({
    actorId: kitchenId, lineId: rollback.lineId, targetStatus: 'preparing',
    correlationId: 'signed_rollback_210',
  });
  await assert.rejects(withTransaction(async (query) => {
    await repository.transitionLine(query, {
      actorId: kitchenId, role: 'kitchen', lineId: rollback.lineId,
      targetStatus: 'preparing', correlationId: 'signed_rollback_210',
      capability: rollbackCapability,
    });
    throw Error('forced_after_transition');
  }), /forced_after_transition/);
  assert.deepEqual(await state(rollback.lineId), {
    status: 'confirmed', events: 0, requests: 0, notifications: 0,
  });
});

test('PG17 direct tables, keys, schema DDL and unauthorized principals remain denied', async () => {
  for (const statement of [
    'SELECT * FROM sabora.order_operation_signing_keys',
    'SELECT * FROM sabora.order_lines LIMIT 1',
    `UPDATE sabora.order_lines SET name='forged' WHERE false`,
    'DELETE FROM sabora.order_line_events WHERE false',
    'TRUNCATE sabora.order_line_transition_requests',
    'CREATE TABLE sabora.ci_forbidden_object(id integer)',
  ]) await assert.rejects(operationsPool.query(statement), /permission denied/);
  await admin.query('CREATE SEQUENCE sabora.ci_forbidden_sequence');
  try {
    await assert.rejects(operationsPool.query(
      `SELECT nextval('sabora.ci_forbidden_sequence')`
    ), /permission denied/);
  } finally {
    await admin.query('DROP SEQUENCE sabora.ci_forbidden_sequence');
  }

  const exposure = await admin.query(`SELECT role.rolname,
    has_function_privilege(role.oid,
      'sabora.transition_order_line_authorized_candidate(text,text,uuid,uuid,text,text,bigint,bigint,text)',
      'EXECUTE') AS can_execute
    FROM pg_catalog.pg_roles role
    WHERE role.rolname IN ('anon','authenticated',$1)
    ORDER BY role.rolname`, [staffRole]);
  assert.deepEqual(exposure.rows, [
    {rolname: 'anon', can_execute: false},
    {rolname: 'authenticated', can_execute: false},
    {rolname: staffRole, can_execute: false},
  ]);
});

test('Fastify transition rejects forged HTTP identity fields and uses the signed SQL boundary', async (t) => {
  const item = await fixture(211);
  const app = Fastify({logger: false});
  const forRoles = (roles) => [async (request, reply) => {
    if (!roles.includes('kitchen')) return reply.code(403).send({error: 'forbidden'});
    request.verifiedIdentity = {userId: kitchenId};
    request.verifiedStaff = {userId: kitchenId, role: 'kitchen'};
  }];
  registerOrderOperationsHttp(app, {forRoles, operations});
  await app.ready();
  t.after(() => app.close());
  const forged = await app.inject({
    method: 'POST', url: `/api/v1/operations/order-lines/${item.lineId}/transitions`,
    payload: {targetStatus: 'preparing', correlationId: 'signed_http_211',
      actorId: victimAdminId, role: 'admin'},
  });
  assert.equal(forged.statusCode, 400);
  const valid = await app.inject({
    method: 'POST', url: `/api/v1/operations/order-lines/${item.lineId}/transitions`,
    payload: {targetStatus: 'preparing', correlationId: 'signed_http_211'},
  });
  assert.equal(valid.statusCode, 201, valid.body);
  const attribution = await admin.query(`SELECT actor_user_id FROM sabora.order_line_events
    WHERE order_line_id=$1`, [item.lineId]);
  assert.deepEqual(attribution.rows, [{actor_user_id: kitchenId}]);
});

test('Fastify + restricted PG17 login: full signed kitchen-to-waiter mutation, replay and denied board',async t=>{
  const item=await fixture(214);
  const app=Fastify({logger:false});
  const forRoles=roles=>[async(request,reply)=>{
    // Test-only identity injector, never an operational auth implementation.
    const [scheme,userId,role]=String(request.headers.authorization??'').split(' ');
    if(scheme!=='Test'||!roles.includes(role))
      return reply.code(401).send({error:'unauthorized'});
    request.verifiedIdentity={userId};
    request.verifiedStaff={userId,role};
  }];
  registerOrderOperationsHttp(app,{forRoles,operations});
  await app.ready();
  t.after(()=>app.close());
  const kitchen={authorization:`Test ${kitchenId} kitchen`};
  const waiter={authorization:`Test ${waiterId} waiter`};
  const transition=(headers,targetStatus,correlationId)=>app.inject({
    method:'POST',
    url:`/api/v1/operations/order-lines/${item.lineId}/transitions`,
    headers,payload:{targetStatus,correlationId},
  });
  const unauthenticated=await transition({},'preparing','signed_http_unauth_214');
  assert.equal(unauthenticated.statusCode,401);
  assert.equal((await transition(waiter,'preparing','signed_http_denied_214')).statusCode,403);
  const prep=await transition(kitchen,'preparing','signed_http_prepare_214');
  assert.equal(prep.statusCode,201,prep.body);
  const prepReplay=await transition(kitchen,'preparing','signed_http_prepare_214');
  assert.equal(prepReplay.statusCode,200,prepReplay.body);
  assert.equal(prepReplay.json().eventId,prep.json().eventId);
  const ready=await transition(kitchen,'ready','signed_http_ready_214');
  assert.equal(ready.statusCode,201,ready.body);
  assert.ok(ready.json().notificationId);
  const pickup=await transition(waiter,'picked_up','signed_http_pickup_214');
  assert.equal(pickup.statusCode,201,pickup.body);
  assert.equal(pickup.json().notificationId,ready.json().notificationId);
  const pickupReplay=await transition(waiter,'picked_up','signed_http_pickup_214');
  assert.equal(pickupReplay.statusCode,200,pickupReplay.body);
  assert.equal(pickupReplay.json().eventId,pickup.json().eventId);
  assert.deepEqual(await state(item.lineId),{
    status:'picked_up',events:3,requests:3,notifications:1,
  });
  // The deliberately unapproved board/history SQL capability must remain closed.
  const board=await app.inject({method:'GET',
    url:'/api/v1/operations/order-lines',headers:waiter});
  assert.equal(board.statusCode,503,board.body);
  assert.deepEqual(board.json(),{error:'order_operations_unavailable'});
  const history=await app.inject({method:'GET',
    url:`/api/v1/operations/orders/${item.orderId}/history`,headers:waiter});
  assert.equal(history.statusCode,503,history.body);
  assert.deepEqual(history.json(),{error:'order_operations_unavailable'});
  // A direct SQL read is still denied even though the signed mutation succeeded.
  await assert.rejects(operationsPool.query(
    'SELECT * FROM sabora.order_lines LIMIT 1'),/permission denied/);
});
