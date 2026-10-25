import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffLifecycleCapabilityIssuer} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {preflightStaffLifecycleIdentity} from '../../apps/api/src/staff-lifecycle-identity-preflight.mjs';
import {createOrderOperationCapabilityIssuer} from '../../apps/api/src/order-operation-capability.mjs';

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
const admin = new Pool({connectionString: url, max: 6});
const lifecycleRole = 'sabora_ci_staff_lifecycle';
const operationsRole = 'sabora_ci_revoked_operations';
const lifecycleSecret = randomBytes(32);
const operationsSecret = randomBytes(32);
const lifecycleKey = 'staff_lifecycle_ci_key_001';
const operationsKey = 'revoked_ops_ci_key_001';
const ownerId = '91000000-0000-4000-8000-000000000001';
const rootId = '91000000-0000-4000-8000-000000000002';
const waiterActorId = '91000000-0000-4000-8000-000000000003';
let lifecyclePool;
let operationsPool;
let issueLifecycle;
let issueOperation;
let sequence = 0;

const lifecycleSql = `SELECT *
  FROM sabora.transition_staff_lifecycle_authorized_candidate(
    $1::text,$2::text,$3::uuid,$4::text,$5::uuid,
    $6::uuid,$7::text,$8::text,$9::text,$10::text,
    $11::text,$12::text,$13::bigint,$14::bigint,$15::text
  )`;
const operationSql = `SELECT *
  FROM sabora.transition_order_line_authorized_candidate(
    $1::text,$2::text,$3::uuid,$4::uuid,$5::text,
    $6::text,$7::bigint,$8::bigint,$9::text
  )`;

function uuid(prefix, value) {
  return `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function lifecycleCapability({
  actorId = ownerId,
  action,
  enrollmentId,
  subjectUserId = null,
  requestedRole = null,
  inviteeEmailHashHex = null,
  inviteTokenHashHex = null,
  credentialEvidenceHashHex = null,
  reason = null,
  correlationId,
}) {
  return issueLifecycle({
    actorId, action, enrollmentId, subjectUserId, requestedRole,
    inviteeEmailHashHex, inviteTokenHashHex, credentialEvidenceHashHex,
    reason, correlationId,
  });
}

function lifecycleArgs(value, overrides = {}) {
  const capability = {...value, ...overrides};
  return [
    capability.keyId, capability.databaseRole, capability.actorId,
    capability.action, capability.enrollmentId, capability.subjectUserId,
    capability.requestedRole, capability.inviteeEmailHashHex,
    capability.inviteTokenHashHex, capability.credentialEvidenceHashHex,
    capability.reason, capability.correlationId, capability.issuedAtMs,
    capability.expiresAtMs, capability.signatureHex,
  ];
}

async function runLifecycle(capability, pool = lifecyclePool) {
  const result = await pool.query(lifecycleSql, lifecycleArgs(capability));
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

async function createInvitation({role = 'waiter', token = null} = {}) {
  sequence++;
  const enrollmentId = uuid('a', sequence);
  const chosenToken = token ?? `token_${String(sequence).padStart(42, 'x')}`;
  const capability = lifecycleCapability({
    action: 'invite', enrollmentId, requestedRole: role,
    inviteeEmailHashHex: digest(`person-${sequence}@example.invalid`),
    inviteTokenHashHex: digest(chosenToken),
    correlationId: `invite_${String(sequence).padStart(8, '0')}`,
  });
  const row = await runLifecycle(capability);
  assert.equal(row.current_state, 'invited');
  return {enrollmentId, token: chosenToken, role, capability};
}

async function accept(invitation, subjectId, suffix = sequence) {
  return runLifecycle(lifecycleCapability({
    actorId: subjectId, action: 'accept', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId, inviteTokenHashHex: digest(invitation.token),
    correlationId: `accept_${String(suffix).padStart(8, '0')}`,
  }));
}

async function register(invitation, subjectId, suffix = sequence) {
  return runLifecycle(lifecycleCapability({
    actorId: subjectId, action: 'register', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId, credentialEvidenceHashHex: digest(`credential-${suffix}`),
    correlationId: `register_${String(suffix).padStart(8, '0')}`,
  }));
}

async function activate(invitation, subjectId, suffix = sequence) {
  return runLifecycle(lifecycleCapability({
    action: 'activate', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId,
    correlationId: `activate_${String(suffix).padStart(8, '0')}`,
  }));
}

async function revoke(invitation, subjectId, suffix = sequence, reason = 'Baja autorizada') {
  return runLifecycle(lifecycleCapability({
    action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId, reason,
    correlationId: `revoke_${String(suffix).padStart(8, '0')}`,
  }));
}

async function enrollmentState(enrollmentId) {
  const result = await admin.query(`SELECT state,auth_user_id,invite_version,
      accepted_at IS NOT NULL AS accepted,
      credential_registered_at IS NOT NULL AS registered,
      activated_at IS NOT NULL AS activated,
      suspended_at IS NOT NULL AS suspended,
      revoked_at IS NOT NULL AS revoked
    FROM sabora.staff_enrollments WHERE id=$1`, [enrollmentId]);
  return result.rows[0];
}

async function auditCounts(enrollmentId) {
  const result = await admin.query(`SELECT
    (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit WHERE enrollment_id=$1) AS audit,
    (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests WHERE enrollment_id=$1) AS requests`,
  [enrollmentId]);
  return result.rows[0];
}

test.before(async () => {
  await admin.query(`CREATE ROLE ${lifecycleRole} LOGIN
    PASSWORD 'sabora_ci_lifecycle_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`CREATE ROLE ${operationsRole} LOGIN
    PASSWORD 'sabora_ci_revoked_ops_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${lifecycleRole},${operationsRole}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.transition_staff_lifecycle_authorized_candidate(
      text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
    ) TO ${lifecycleRole}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.transition_order_line_authorized_candidate(
      text,text,uuid,uuid,text,text,bigint,bigint,text
    ) TO ${operationsRole}`);
  await admin.query(`INSERT INTO sabora.staff_lifecycle_signing_keys
    (key_id,hmac_key,not_before,expires_at)
    VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 hour')`,
  [lifecycleKey, lifecycleSecret.toString('hex')]);
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys
    (key_id,hmac_key,not_before,expires_at)
    VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 hour')`,
  [operationsKey, operationsSecret.toString('hex')]);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state) VALUES
    ($1,'admin','active'),($2,'root','active'),($3,'waiter','active')`,
  [ownerId, rootId, waiterActorId]);
  await admin.query(`UPDATE sabora.admin_write_ownership
    SET owner_user_id=$1,assigned_at=clock_timestamp() WHERE singleton=true`, [ownerId]);

  const makePool = (role, password, max = 6) => new Pool({
    connectionString: `postgresql://${role}:${password}@127.0.0.1:${parsed.port}/postgres`,
    max, connectionTimeoutMillis: 3000,
    options: '-c statement_timeout=15000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000',
  });
  lifecyclePool = makePool(lifecycleRole, 'sabora_ci_lifecycle_ephemeral');
  operationsPool = makePool(operationsRole, 'sabora_ci_revoked_ops_ephemeral');
  issueLifecycle = createStaffLifecycleCapabilityIssuer({
    keyId: lifecycleKey, secret: lifecycleSecret, databaseRole: lifecycleRole,
  });
  issueOperation = createOrderOperationCapabilityIssuer({
    keyId: operationsKey, secret: operationsSecret, databaseRole: operationsRole,
  });
});

test.after(async () => {
  await lifecyclePool?.end();
  await operationsPool?.end();
  await admin.end();
});

test('PG17 restricted lifecycle login exposes only the signed wrapper', async () => {
  assert.deepEqual(await preflightStaffLifecycleIdentity({
    pool: lifecyclePool, role: lifecycleRole,
  }), {role: lifecycleRole});
  const privileges = await admin.query(`SELECT
    has_function_privilege($1,
      'sabora.transition_staff_lifecycle_authorized_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text)',
      'EXECUTE') AS wrapper,
    has_table_privilege($1,'sabora.staff_enrollments','SELECT') AS enrollment_read,
    has_table_privilege($1,'sabora.staff_members','UPDATE') AS staff_update,
    has_table_privilege($1,'sabora.staff_lifecycle_signing_keys','SELECT') AS key_read,
    has_schema_privilege($1,'sabora','CREATE') AS schema_create,
    has_database_privilege($1,current_database(),'CREATE') AS database_create`,
  [lifecycleRole]);
  assert.deepEqual(privileges.rows, [{
    wrapper: true, enrollment_read: false, staff_update: false,
    key_read: false, schema_create: false, database_create: false,
  }]);
  for (const statement of [
    'SELECT * FROM sabora.staff_enrollments',
    `UPDATE sabora.staff_members SET state='active' WHERE false`,
    'DELETE FROM sabora.staff_lifecycle_audit WHERE false',
    'TRUNCATE sabora.staff_lifecycle_requests',
    'CREATE TABLE sabora.forbidden_staff_lifecycle(id integer)',
  ]) await assert.rejects(lifecyclePool.query(statement), /permission denied/);
});

test('PG17 revokes pending invitation and blocks late acceptance, resend and replay mutation', async () => {
  const invitation = await createInvitation();
  const subjectId = uuid('b', sequence);
  const revoked = await revoke(invitation, null, sequence);
  assert.equal(revoked.current_state, 'revoked');
  assert.deepEqual(await enrollmentState(invitation.enrollmentId), {
    state: 'revoked', auth_user_id: null, invite_version: 1,
    accepted: false, registered: false, activated: false, suspended: false, revoked: true,
  });
  await assert.rejects(accept(invitation, subjectId), /staff_enrollment_revoked/);
  await assert.rejects(runLifecycle(lifecycleCapability({
    action: 'resend', enrollmentId: invitation.enrollmentId,
    inviteTokenHashHex: digest('replacement-token-that-is-long-enough-0001'),
    correlationId: `resend_${String(sequence).padStart(8, '0')}`,
  })), /staff_enrollment_revoked/);
  await assert.rejects(runLifecycle(invitation.capability), /staff_enrollment_revoked/);
  assert.equal((await enrollmentState(invitation.enrollmentId)).state, 'revoked');
  assert.deepEqual(await auditCounts(invitation.enrollmentId), {audit: 2, requests: 2});
});

test('PG17 resend rotates the token and repeated correlation creates no duplicate effects', async () => {
  const invitation = await createInvitation();
  const subjectId = uuid('b', sequence);
  const newToken = `replacement_${String(sequence).padStart(36, 'z')}`;
  const resendCapability = lifecycleCapability({
    action: 'resend', enrollmentId: invitation.enrollmentId,
    inviteTokenHashHex: digest(newToken),
    correlationId: `resend_${String(sequence).padStart(8, '0')}`,
  });
  const first = await runLifecycle(resendCapability);
  const replay = await runLifecycle(resendCapability);
  assert.equal(first.result_invite_version, 2);
  assert.equal(replay.repeated, true);
  assert.equal(replay.event_id, first.event_id);
  await assert.rejects(accept(invitation, subjectId), /invalid_staff_invitation_token/);
  invitation.token = newToken;
  const accepted = await accept(invitation, subjectId);
  assert.equal(accepted.current_state, 'accepted');
  assert.deepEqual(await auditCounts(invitation.enrollmentId), {audit: 3, requests: 3});
});

test('PG17 revocation wins from accepted and registered states and blocks late completion', async () => {
  const acceptedInvitation = await createInvitation();
  const acceptedSubject = uuid('b', sequence);
  await accept(acceptedInvitation, acceptedSubject);
  await revoke(acceptedInvitation, acceptedSubject, sequence);
  await assert.rejects(register(acceptedInvitation, acceptedSubject), /staff_enrollment_revoked/);

  const registeredInvitation = await createInvitation({role: 'kitchen'});
  const registeredSubject = uuid('b', sequence);
  await accept(registeredInvitation, registeredSubject);
  await register(registeredInvitation, registeredSubject);
  await revoke(registeredInvitation, registeredSubject, sequence);
  await assert.rejects(activate(registeredInvitation, registeredSubject), /staff_enrollment_revoked/);
  const states = await admin.query(`SELECT id,state FROM sabora.staff_enrollments
    WHERE id=ANY($1::uuid[]) ORDER BY id`,
  [[acceptedInvitation.enrollmentId, registeredInvitation.enrollmentId]]);
  assert.ok(states.rows.every((row) => row.state === 'revoked'));
  const memberships = await admin.query(`SELECT count(*)::integer AS n
    FROM sabora.staff_members WHERE user_id=ANY($1::uuid[])`,
  [[acceptedSubject, registeredSubject]]);
  assert.equal(memberships.rows[0].n, 0);
});

test('PG17 active and suspended staff lose membership access immediately after revocation', async () => {
  const invitation = await createInvitation({role: 'kitchen'});
  const subjectId = uuid('b', sequence);
  await accept(invitation, subjectId);
  await register(invitation, subjectId);
  await activate(invitation, subjectId);

  sequence++;
  const tableId = uuid('c', sequence);
  const orderId = uuid('d', sequence);
  await admin.query(`INSERT INTO sabora.dining_tables
    (id,number,capacity,qr_token_hash,ordering_state)
    VALUES ($1,$2,4,decode(repeat('ab',32),'hex'),'open')`,
  [tableId, 970000 + sequence]);
  const session = await admin.query('SELECT session_id FROM sabora.dining_tables WHERE id=$1', [tableId]);
  await admin.query(`INSERT INTO sabora.orders(
    id,table_id,session_id,company,employee_number,confirmed_at,grouping,items
  ) VALUES ($1,$2,$3,'Revocation','1',clock_timestamp(),'first',
    '[{"category":"main","name":"Revocation","quantity":1}]'::jsonb)`,
  [orderId, tableId, session.rows[0].session_id]);
  const line = await admin.query('SELECT id FROM sabora.order_lines WHERE order_id=$1', [orderId]);
  const operationCapability = issueOperation({
    actorId: subjectId, lineId: line.rows[0].id, targetStatus: 'preparing',
    correlationId: `revoked_ops_${String(sequence).padStart(8, '0')}`,
  });
  await revoke(invitation, subjectId, sequence);
  await assert.rejects(operationsPool.query(operationSql, [
    operationCapability.keyId, operationCapability.databaseRole,
    operationCapability.actorId, operationCapability.lineId,
    operationCapability.targetStatus, operationCapability.correlationId,
    operationCapability.issuedAtMs, operationCapability.expiresAtMs,
    operationCapability.signatureHex,
  ]), /actor_not_authorized/);
  const membership = await admin.query('SELECT state FROM sabora.staff_members WHERE user_id=$1', [subjectId]);
  assert.deepEqual(membership.rows, [{state: 'revoked'}]);

  const suspendedInvitation = await createInvitation();
  const suspendedSubject = uuid('b', sequence);
  await accept(suspendedInvitation, suspendedSubject);
  await register(suspendedInvitation, suspendedSubject);
  await activate(suspendedInvitation, suspendedSubject);
  await runLifecycle(lifecycleCapability({
    action: 'suspend', enrollmentId: suspendedInvitation.enrollmentId,
    subjectUserId: suspendedSubject, reason: 'Suspensión preventiva',
    correlationId: `suspend_${String(sequence).padStart(8, '0')}`,
  }));
  await revoke(suspendedInvitation, suspendedSubject, sequence, 'Baja tras suspensión');
  assert.deepEqual(await enrollmentState(suspendedInvitation.enrollmentId), {
    state: 'revoked', auth_user_id: suspendedSubject, invite_version: 1,
    accepted: true, registered: true, activated: true, suspended: true, revoked: true,
  });
});

test('PG17 concurrent activation and revocation always finish revoked without orphan access', async () => {
  const invitation = await createInvitation({role: 'waiter'});
  const subjectId = uuid('b', sequence);
  await accept(invitation, subjectId);
  await register(invitation, subjectId);
  const activateCapability = lifecycleCapability({
    action: 'activate', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId,
    correlationId: `race_activate_${String(sequence).padStart(8, '0')}`,
  });
  const revokeCapability = lifecycleCapability({
    action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId, reason: 'Revocación concurrente',
    correlationId: `race_revoke_${String(sequence).padStart(8, '0')}`,
  });
  const [activation, revocation] = await Promise.allSettled([
    runLifecycle(activateCapability), runLifecycle(revokeCapability),
  ]);
  assert.equal(revocation.status, 'fulfilled');
  if (activation.status === 'rejected') {
    assert.match(activation.reason.message, /staff_enrollment_revoked/);
  }
  assert.equal((await enrollmentState(invitation.enrollmentId)).state, 'revoked');
  const membership = await admin.query('SELECT state FROM sabora.staff_members WHERE user_id=$1', [subjectId]);
  assert.ok(membership.rows.length === 0 || membership.rows[0].state === 'revoked');
});

test('PG17 double revocation is idempotent and fully audited without reactivation', async () => {
  const invitation = await createInvitation();
  const firstCapability = lifecycleCapability({
    action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: null, reason: 'Baja inicial',
    correlationId: `double_revoke_${String(sequence).padStart(8, '0')}`,
  });
  const first = await runLifecycle(firstCapability);
  const replay = await runLifecycle(firstCapability);
  const second = await revoke(invitation, null, sequence + 1000, 'Reintento confirmado');
  assert.equal(first.repeated, false);
  assert.equal(replay.repeated, true);
  assert.equal(second.repeated, true);
  assert.equal((await enrollmentState(invitation.enrollmentId)).state, 'revoked');
  assert.deepEqual(await auditCounts(invitation.enrollmentId), {audit: 3, requests: 3});
});

test('PG17 SQL impersonation, wrong role, GUC and SET ROLE cannot create authority', async () => {
  const invitation = await createInvitation();
  const forged = lifecycleCapability({
    action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: null, reason: 'Intento falsificado',
    correlationId: `forged_revoke_${String(sequence).padStart(8, '0')}`,
  });
  await lifecyclePool.query(`SELECT set_config('request.jwt.claims',$1,false)`,
    [JSON.stringify({sub: ownerId, role: 'admin'})]);
  await assert.rejects(lifecyclePool.query(lifecycleSql, lifecycleArgs(forged, {
    actorId: rootId,
  })), /invalid_staff_lifecycle_capability/);
  const rootCapability = lifecycleCapability({
    actorId: rootId, action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: null, reason: 'ROOT no ordinario',
    correlationId: `root_revoke_${String(sequence).padStart(8, '0')}`,
  });
  await assert.rejects(runLifecycle(rootCapability), /staff_lifecycle_admin_forbidden/);
  const waiterCapability = lifecycleCapability({
    actorId: waiterActorId, action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: null, reason: 'Rol equivocado',
    correlationId: `waiter_revoke_${String(sequence).padStart(8, '0')}`,
  });
  await assert.rejects(runLifecycle(waiterCapability), /staff_lifecycle_admin_forbidden/);
  await assert.rejects(lifecyclePool.query('SET ROLE sabora_staff_lifecycle_fn_owner'),
    /permission denied to set role/);
  assert.equal((await enrollmentState(invitation.enrollmentId)).state, 'invited');
  assert.deepEqual(await auditCounts(invitation.enrollmentId), {audit: 1, requests: 1});
});

test('PG17 altered correlation conflicts and failed transactions roll back every effect', async () => {
  const invitation = await createInvitation();
  const sameCorrelationDifferentPayload = lifecycleCapability({
    action: 'revoke', enrollmentId: invitation.enrollmentId,
    subjectUserId: null, reason: 'Payload distinto',
    correlationId: invitation.capability.correlationId,
  });
  await assert.rejects(runLifecycle(sameCorrelationDifferentPayload),
    /staff_lifecycle_idempotency_conflict/);
  assert.equal((await enrollmentState(invitation.enrollmentId)).state, 'invited');

  sequence++;
  const rolledBackId = uuid('a', sequence);
  const capability = lifecycleCapability({
    action: 'invite', enrollmentId: rolledBackId, requestedRole: 'waiter',
    inviteeEmailHashHex: digest(`rollback-${sequence}@example.invalid`),
    inviteTokenHashHex: digest(`rollback-token-${sequence}`),
    correlationId: `rollback_${String(sequence).padStart(8, '0')}`,
  });
  const client = await lifecyclePool.connect();
  try {
    await client.query('BEGIN');
    await client.query(lifecycleSql, lifecycleArgs(capability));
    await assert.rejects(client.query('SELECT 1/0'), /division by zero/);
    await client.query('ROLLBACK');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
  const rows = await admin.query(`SELECT
    (SELECT count(*)::integer FROM sabora.staff_enrollments WHERE id=$1) AS enrollment,
    (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit WHERE enrollment_id=$1) AS audit,
    (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests WHERE enrollment_id=$1) AS requests`,
  [rolledBackId]);
  assert.deepEqual(rows.rows, [{enrollment: 0, audit: 0, requests: 0}]);
});
