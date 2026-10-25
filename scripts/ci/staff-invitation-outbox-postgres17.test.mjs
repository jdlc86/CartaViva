import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffLifecycleCapabilityIssuer} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {preflightStaffInvitationEnqueueIdentity} from '../../apps/api/src/staff-invitation-enqueue-identity-preflight.mjs';
import {claimCurrentStaffInvitation} from '../../apps/api/src/staff-invitation-claim-candidate.mjs';
import {authorizeStaffInvitationDispatch} from '../../apps/api/src/staff-invitation-dispatch-guard.mjs';
import {recordStaffInvitationDeliveryOutcome} from '../../apps/api/src/staff-invitation-delivery-outcome-candidate.mjs';
import {reconcileStaffInvitationJob} from '../../apps/api/src/staff-invitation-reconciliation-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';
import {createStaffInvitationClaimRecoveryCandidate} from '../../apps/api/src/staff-invitation-claim-recovery-candidate.mjs';
import {createRestrictedStaffClaimRecoveryCandidate} from '../../apps/api/src/staff-invitation-claim-recovery-restricted-candidate.mjs';
import {
  createStaffInvitationEnqueueCandidate,
  STAFF_INVITATION_ENQUEUE_SQL,
} from '../../apps/api/src/staff-invitation-enqueue-candidate.mjs';

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
const admin = new Pool({connectionString: url, max: 12});
const connectionString = password =>
  `postgresql://${password.role}:${password.value}@127.0.0.1:${parsed.port}/postgres`;
const deniedCredentials = {role: 'sabora_ci_outbox_denied', value: 'sabora_ci_outbox_denied_ephemeral'};
const runtimeCredentials = {
  role: 'sabora_ci_staff_invitation_runtime',
  value: 'sabora_ci_staff_invitation_runtime_ephemeral',
};
const denied = new Pool({connectionString: connectionString(deniedCredentials), max: 1});
const runtime = new Pool({
  connectionString: connectionString(runtimeCredentials), max: 4,
  application_name: 'sabora_outbox_runtime_a',
});
const runtimeB = new Pool({
  connectionString: connectionString(runtimeCredentials), max: 2,
  application_name: 'sabora_outbox_runtime_b',
});
const workerB = new Pool({
  connectionString: url, max: 2, application_name: 'sabora_outbox_worker_b',
});
const revoker = new Pool({
  connectionString: url, max: 1, application_name: 'sabora_outbox_revoker',
});
const resender = new Pool({
  connectionString: url, max: 1, application_name: 'sabora_outbox_resender',
});
const repository = createStaffInvitationOutboxRepository();
const ownerId = 'a2000000-0000-4000-8000-000000000001';
const lifecycleKeyId = 'outbox_ci_key_001';
const lifecycleSecret = randomBytes(32);
const issueLifecycle = createStaffLifecycleCapabilityIssuer({
  keyId: lifecycleKeyId, secret: lifecycleSecret, databaseRole: 'postgres',
});
const issueIntegratedLifecycle = createStaffLifecycleCapabilityIssuer({
  keyId: lifecycleKeyId, secret: lifecycleSecret,
  databaseRole: runtimeCredentials.role,
});
let sequence = 0;

function uuid(prefix = 'b') {
  sequence++;
  return `${prefix}2000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function withTransaction(callback, pool = admin) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(statement => client.query(statement));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function seedEnrollment({version = 1, tokenHash = null} = {}) {
  const enrollmentId = uuid('b');
  const selectedHash = tokenHash ?? digest(`outbox-token-${enrollmentId}`);
  await admin.query(`INSERT INTO sabora.staff_enrollments(
      id,invitee_email_hash,requested_role,state,invite_token_hash,
      invite_version,created_by
    ) VALUES ($1,decode($2,'hex'),'waiter','invited',decode($3,'hex'),$4,$5)`,
  [enrollmentId, digest(`outbox-${enrollmentId}@example.invalid`),
    selectedHash, version, ownerId]);
  return {enrollmentId, tokenHash: selectedHash, version};
}

async function seedJob(enrollment, overrides = {}) {
  const jobId = overrides.jobId ?? uuid('c');
  await admin.query(`INSERT INTO sabora.staff_invitation_outbox(
      id,enrollment_id,invite_version,invite_token_hash,state,
      fence,claimed_at,dispatch_authorized_at,provider_outcome,
      delivered_at,attempts,created_at,updated_at
    ) VALUES (
      $1,$2,$3,decode($4,'hex'),$5,$6,$7,$8,$9,$10,$11,
      coalesce($12,clock_timestamp()),coalesce($13,clock_timestamp())
    )`, [
    jobId, enrollment.enrollmentId,
    overrides.inviteVersion ?? enrollment.version,
    overrides.tokenHash ?? enrollment.tokenHash,
    overrides.state ?? 'pending', overrides.fence ?? null,
    overrides.claimedAt ?? null, overrides.dispatchAuthorizedAt ?? null,
    overrides.providerOutcome ?? null, overrides.deliveredAt ?? null,
    overrides.attempts ?? 0, overrides.createdAt ?? null,
    overrides.updatedAt ?? null,
  ]);
  return jobId;
}

async function waitForLock(applicationName) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await admin.query(`SELECT 1 FROM pg_catalog.pg_stat_activity
      WHERE application_name=$1 AND wait_event_type='Lock' AND state='active'`,
    [applicationName]);
    if (result.rowCount > 0) return;
    await delay(20);
  }
  throw Error(`expected_lock_wait_not_observed:${applicationName}`);
}

async function expectCheckViolation(callback) {
  await assert.rejects(callback, error => error?.code === '23514');
}

function lifecycleArgs(capability) {
  return [
    capability.keyId, capability.databaseRole, capability.actorId,
    capability.action, capability.enrollmentId, capability.subjectUserId,
    capability.requestedRole, capability.inviteeEmailHashHex,
    capability.inviteTokenHashHex, capability.credentialEvidenceHashHex,
    capability.reason, capability.correlationId, capability.issuedAtMs,
    capability.expiresAtMs, capability.signatureHex,
  ];
}

function integratedCapability({
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
  return issueIntegratedLifecycle({
    actorId, action, enrollmentId, subjectUserId, requestedRole,
    inviteeEmailHashHex, inviteTokenHashHex, credentialEvidenceHashHex,
    reason, correlationId,
  });
}

function integratedEnqueue(pool = runtime) {
  return createStaffInvitationEnqueueCandidate({
    query: (...args) => pool.query(...args),
  });
}

async function runIntegratedLifecycle(capability, pool = runtime) {
  const result = await pool.query(STAFF_INVITATION_ENQUEUE_SQL, lifecycleArgs(capability));
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

test.before(async () => {
  const schema = await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql',
    import.meta.url,
  ), 'utf8');
  await admin.query(schema);
  await admin.query(`CREATE ROLE ${deniedCredentials.role} LOGIN
    PASSWORD '${deniedCredentials.value}' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`CREATE ROLE ${runtimeCredentials.role} LOGIN
    PASSWORD '${runtimeCredentials.value}' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA sabora
    TO ${deniedCredentials.role},${runtimeCredentials.role}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.transition_staff_lifecycle_with_outbox_candidate(
      text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text
    ) TO ${runtimeCredentials.role}`);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
    VALUES ($1,'admin','active')`, [ownerId]);
  await admin.query(`UPDATE sabora.admin_write_ownership
    SET owner_user_id=$1,assigned_at=clock_timestamp()
    WHERE singleton=true`, [ownerId]);
  await admin.query(`INSERT INTO sabora.staff_lifecycle_signing_keys(
      key_id,hmac_key,not_before,expires_at
    ) VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 hour')`,
  [lifecycleKeyId, lifecycleSecret.toString('hex')]);
});

test.after(async () => {
  await Promise.all([
    denied.end(), runtime.end(), runtimeB.end(), workerB.end(), revoker.end(),
    resender.end(), admin.end(),
  ]);
});

test('PG17 candidate has FORCE RLS, scoped owner policies and zero runtime grants', async () => {
  const version = await admin.query('SHOW server_version');
  assert.match(version.rows[0].server_version, /^17\./);
  const boundary = await admin.query(`SELECT
      class.relrowsecurity AS rls_enabled,
      class.relforcerowsecurity AS rls_forced,
      (SELECT count(*)::integer FROM pg_catalog.pg_policies
        WHERE schemaname='sabora' AND tablename='staff_invitation_outbox') AS policies,
      (SELECT count(*)::integer FROM pg_catalog.pg_policies
        WHERE schemaname='sabora' AND tablename='staff_invitation_outbox'
          AND roles <> ARRAY['sabora_staff_invitation_enqueue_fn_owner']::name[]
      ) AS unexpected_policies,
      has_table_privilege($1,'sabora.staff_invitation_outbox','SELECT') AS can_select,
      has_table_privilege($1,'sabora.staff_invitation_outbox','INSERT') AS can_insert,
      has_table_privilege($1,'sabora.staff_invitation_outbox','UPDATE') AS can_update,
      has_table_privilege($1,'sabora.staff_invitation_outbox','DELETE') AS can_delete
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='sabora' AND class.relname='staff_invitation_outbox'`,
  [deniedCredentials.role]);
  assert.deepEqual(boundary.rows, [{
    rls_enabled: true, rls_forced: true, policies: 3, unexpected_policies: 0,
    can_select: false, can_insert: false, can_update: false, can_delete: false,
  }]);
  await assert.rejects(denied.query('SELECT * FROM sabora.staff_invitation_outbox'),
    error => error?.code === '42501');
});

test('PG17 constraints reject malformed shapes, attempts and timestamp inversions', async () => {
  const malformedHash = await seedEnrollment();
  await expectCheckViolation(() => admin.query(`INSERT INTO sabora.staff_invitation_outbox(
      id,enrollment_id,invite_version,invite_token_hash
    ) VALUES ($1,$2,1,decode('aa','hex'))`, [uuid('c'), malformedHash.enrollmentId]));

  const pendingAttempt = await seedEnrollment();
  await expectCheckViolation(() => seedJob(pendingAttempt, {attempts: 1}));

  const partialFence = await seedEnrollment();
  await expectCheckViolation(() => seedJob(partialFence, {
    state: 'cancelled', fence: uuid('d'),
  }));

  const inverted = await seedEnrollment();
  await expectCheckViolation(() => seedJob(inverted, {
    state: 'claimed', fence: uuid('d'),
    claimedAt: new Date(Date.now() + 60_000),
    updatedAt: new Date(),
  }));

  const zeroAttemptDispatch = await seedEnrollment();
  const now = new Date();
  await expectCheckViolation(() => seedJob(zeroAttemptDispatch, {
    state: 'dispatching', fence: uuid('d'), claimedAt: now,
    dispatchAuthorizedAt: now, attempts: 0,
  }));

  const nullOutcome = await seedEnrollment();
  await expectCheckViolation(() => seedJob(nullOutcome, {
    state: 'failed', fence: uuid('d'), claimedAt: now,
    dispatchAuthorizedAt: now, attempts: 1,
  }));
});

test('PG17 executes the legal pending to claimed to dispatching to delivered path', async () => {
  const enrollment = await seedEnrollment();
  const jobId = await seedJob(enrollment);
  const claim = await claimCurrentStaffInvitation({
    withTransaction, repository, jobId,
  });
  assert.equal(claim.claimed, true);
  assert.match(claim.fence, /^[0-9a-f-]{36}$/);
  let row = (await admin.query(`SELECT state,fence::text,attempts,
      claimed_at IS NOT NULL AS claimed,updated_at >= claimed_at AS updated
    FROM sabora.staff_invitation_outbox WHERE id=$1`, [jobId])).rows[0];
  assert.deepEqual(row, {
    state: 'claimed', fence: claim.fence, attempts: 0,
    claimed: true, updated: true,
  });

  const staleFence = uuid('d');
  assert.deepEqual(await authorizeStaffInvitationDispatch({
    withTransaction, repository, jobId, fence: staleFence,
  }), {authorized: false, reason: 'claim_not_found'});
  row = (await admin.query(`SELECT state,fence::text,attempts
    FROM sabora.staff_invitation_outbox WHERE id=$1`, [jobId])).rows[0];
  assert.deepEqual(row, {state: 'claimed', fence: claim.fence, attempts: 0});

  assert.deepEqual(await authorizeStaffInvitationDispatch({
    withTransaction, repository, jobId, fence: claim.fence,
  }), {authorized: true});
  row = (await admin.query(`SELECT state,attempts,
      dispatch_authorized_at IS NOT NULL AS authorized,
      updated_at >= dispatch_authorized_at AS updated
    FROM sabora.staff_invitation_outbox WHERE id=$1`, [jobId])).rows[0];
  assert.deepEqual(row, {
    state: 'dispatching', attempts: 1, authorized: true, updated: true,
  });

  assert.deepEqual(await recordStaffInvitationDeliveryOutcome({
    withTransaction, repository, jobId, fence: claim.fence, outcome: 'accepted',
  }), {recorded: true, state: 'delivered', retryable: false, ambiguous: false});
  assert.deepEqual(await recordStaffInvitationDeliveryOutcome({
    withTransaction, repository, jobId, fence: staleFence, outcome: 'accepted',
  }), {recorded: false, reason: 'not_dispatching'});
  row = (await admin.query(`SELECT state,provider_outcome,attempts,
      delivered_at IS NOT NULL AS delivered,
      dispatch_authorized_at IS NOT NULL AS authorized
    FROM sabora.staff_invitation_outbox WHERE id=$1`, [jobId])).rows[0];
  assert.deepEqual(row, {
    state: 'delivered', provider_outcome: 'accepted', attempts: 1,
    delivered: true, authorized: true,
  });
  const enrollmentState = await admin.query(
    'SELECT state FROM sabora.staff_enrollments WHERE id=$1', [enrollment.enrollmentId]);
  assert.equal(enrollmentState.rows[0].state, 'invited');
});

test('PG17 serializes two claimers and preserves one immutable fence', async () => {
  const enrollment = await seedEnrollment();
  const jobId = await seedJob(enrollment);
  const first = await admin.connect();
  try {
    await first.query('BEGIN');
    const candidate = await repository.lockDeliveryCandidate(
      statement => first.query(statement), jobId,
    );
    assert.ok(candidate);
    const secondPromise = claimCurrentStaffInvitation({
      withTransaction: callback => withTransaction(callback, workerB),
      repository, jobId,
    });
    await waitForLock('sabora_outbox_worker_b');
    const firstClaim = await repository.markDeliveryClaimed(
      statement => first.query(statement), jobId,
    );
    await first.query('COMMIT');
    assert.equal(firstClaim.claimed, true);
    assert.deepEqual(await secondPromise, {claimed: false, reason: 'not_found'});
    const stored = await admin.query(`SELECT state,fence::text,attempts
      FROM sabora.staff_invitation_outbox WHERE id=$1`, [jobId]);
    assert.deepEqual(stored.rows[0], {
      state: 'claimed', fence: firstClaim.fence, attempts: 0,
    });
  } catch (error) {
    await first.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    first.release();
  }
});

test('PG17 revocation racing a claim fences dispatch and late acceptance', async () => {
  const enrollment = await seedEnrollment();
  const jobId = await seedJob(enrollment);
  const first = await admin.connect();
  const revokeClient = await revoker.connect();
  try {
    await first.query('BEGIN');
    const candidate = await repository.lockDeliveryCandidate(
      statement => first.query(statement), jobId,
    );
    assert.ok(candidate);
    await revokeClient.query('BEGIN');
    const revokePromise = revokeClient.query(`UPDATE sabora.staff_enrollments
      SET state='revoked',invite_token_hash=sha256(invite_token_hash),
        revoked_at=clock_timestamp(),revocation_reason='CI revocation race',
        updated_at=clock_timestamp()
      WHERE id=$1`, [enrollment.enrollmentId]);
    await waitForLock('sabora_outbox_revoker');
    const claim = await repository.markDeliveryClaimed(
      statement => first.query(statement), jobId,
    );
    assert.equal(claim.claimed, true);
    await first.query('COMMIT');
    await revokePromise;
    await revokeClient.query('COMMIT');

    assert.deepEqual(await authorizeStaffInvitationDispatch({
      withTransaction, repository, jobId, fence: claim.fence,
    }), {authorized: false, reason: 'revoked'});
    assert.deepEqual(await reconcileStaffInvitationJob({
      withTransaction, repository, jobId,
    }), {cancelled: true, reason: 'revoked'});
    const cancelled = await admin.query(`SELECT state,fence::text,
      claimed_at IS NOT NULL AS claimed FROM sabora.staff_invitation_outbox WHERE id=$1`,
    [jobId]);
    assert.deepEqual(cancelled.rows[0], {
      state: 'cancelled', fence: claim.fence, claimed: true,
    });

    const subjectId = uuid('e');
    const capability = issueLifecycle({
      actorId: subjectId, action: 'accept', enrollmentId: enrollment.enrollmentId,
      subjectUserId: subjectId, requestedRole: null,
      inviteeEmailHashHex: null, inviteTokenHashHex: enrollment.tokenHash,
      credentialEvidenceHashHex: null, reason: null,
      correlationId: `late_accept_${String(sequence).padStart(8, '0')}`,
    });
    await assert.rejects(admin.query(`SELECT * FROM
      sabora.transition_staff_lifecycle_authorized_candidate(
        $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,
        $8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint,
        $14::bigint,$15::text
      )`, lifecycleArgs(capability)),
    error => error?.code === '42501' && /staff_enrollment_revoked/.test(error.message));
  } catch (error) {
    await first.query('ROLLBACK').catch(() => {});
    await revokeClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    first.release();
    revokeClient.release();
  }
});

test('PG17 resend racing a claim supersedes old work and deduplicates new work', async () => {
  const enrollment = await seedEnrollment();
  const oldJobId = await seedJob(enrollment);
  const newHash = digest(`rotated-${enrollment.enrollmentId}`);
  const resendClient = await resender.connect();
  try {
    await resendClient.query('BEGIN');
    await resendClient.query(`UPDATE sabora.staff_enrollments
      SET invite_version=invite_version+1,invite_token_hash=decode($2,'hex'),
        last_invited_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=$1`, [enrollment.enrollmentId, newHash]);
    const claimPromise = claimCurrentStaffInvitation({
      withTransaction: callback => withTransaction(callback, workerB),
      repository, jobId: oldJobId,
    });
    await waitForLock('sabora_outbox_worker_b');
    await resendClient.query('COMMIT');
    assert.deepEqual(await claimPromise, {claimed: false, reason: 'superseded'});
    const oldJob = await admin.query(`SELECT state,fence FROM sabora.staff_invitation_outbox
      WHERE id=$1`, [oldJobId]);
    assert.deepEqual(oldJob.rows[0], {state: 'pending', fence: null});

    const current = {
      enrollmentId: enrollment.enrollmentId, version: 2, tokenHash: newHash,
    };
    const newJobId = await seedJob(current);
    await assert.rejects(seedJob(current), error => error?.code === '23505');
    const claimed = await claimCurrentStaffInvitation({
      withTransaction, repository, jobId: newJobId,
    });
    assert.equal(claimed.claimed, true);
    assert.deepEqual(await claimCurrentStaffInvitation({
      withTransaction, repository, jobId: newJobId,
    }), {claimed: false, reason: 'not_found'});
  } catch (error) {
    await resendClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    resendClient.release();
  }
});

test('PG17 records unknown provider outcome once and never retries it', async () => {
  const enrollment = await seedEnrollment();
  const jobId = await seedJob(enrollment);
  const claim = await claimCurrentStaffInvitation({withTransaction, repository, jobId});
  await authorizeStaffInvitationDispatch({
    withTransaction, repository, jobId, fence: claim.fence,
  });
  assert.deepEqual(await recordStaffInvitationDeliveryOutcome({
    withTransaction, repository, jobId, fence: claim.fence, outcome: 'unknown',
  }), {recorded: true, state: 'failed', retryable: false, ambiguous: true});
  assert.deepEqual(await recordStaffInvitationDeliveryOutcome({
    withTransaction, repository, jobId, fence: claim.fence, outcome: 'accepted',
  }), {recorded: false, reason: 'not_dispatching'});
  assert.deepEqual(await claimCurrentStaffInvitation({withTransaction, repository, jobId}),
    {claimed: false, reason: 'not_found'});
  const stored = await admin.query(`SELECT state,provider_outcome,attempts,
      dispatch_authorized_at IS NOT NULL AS authorized,delivered_at
    FROM sabora.staff_invitation_outbox WHERE id=$1`, [jobId]);
  assert.deepEqual(stored.rows[0], {
    state: 'failed', provider_outcome: 'unknown', attempts: 1,
    authorized: true, delivered_at: null,
  });
});

test('PG17 late provider acceptance after revocation never activates staff', async () => {
  const enrollment = await seedEnrollment();
  const jobId = await seedJob(enrollment);
  const claim = await claimCurrentStaffInvitation({withTransaction, repository, jobId});
  await authorizeStaffInvitationDispatch({
    withTransaction, repository, jobId, fence: claim.fence,
  });
  await admin.query(`UPDATE sabora.staff_enrollments
    SET state='revoked',invite_token_hash=sha256(invite_token_hash),
      revoked_at=clock_timestamp(),revocation_reason='provider in flight',
      updated_at=clock_timestamp()
    WHERE id=$1`, [enrollment.enrollmentId]);
  assert.deepEqual(await recordStaffInvitationDeliveryOutcome({
    withTransaction, repository, jobId, fence: claim.fence, outcome: 'accepted',
  }), {recorded: true, state: 'delivered', retryable: false, ambiguous: false});
  const state = await admin.query(`SELECT e.state AS enrollment_state,
      o.state AS outbox_state,o.provider_outcome
    FROM sabora.staff_enrollments e
    JOIN sabora.staff_invitation_outbox o ON o.enrollment_id=e.id
    WHERE o.id=$1`, [jobId]);
  assert.deepEqual(state.rows[0], {
    enrollment_state: 'revoked', outbox_state: 'delivered',
    provider_outcome: 'accepted',
  });
});

async function createIntegratedInvitation(pool = runtime) {
  const enrollmentId = uuid('f');
  const tokenHash = digest(`integrated-token-${enrollmentId}`);
  const capability = integratedCapability({
    action: 'invite', enrollmentId, requestedRole: 'waiter',
    inviteeEmailHashHex: digest(`integrated-${enrollmentId}@example.invalid`),
    inviteTokenHashHex: tokenHash,
    correlationId: `integrated_invite_${String(sequence).padStart(8, '0')}`,
  });
  const result = await integratedEnqueue(pool).transitionAndEnqueue(capability);
  return {enrollmentId, tokenHash, capability, result};
}

test('PG17 integrated runtime login has one wrapper and no direct or inherited authority', async () => {
  assert.deepEqual(await preflightStaffInvitationEnqueueIdentity({
    pool: runtime, role: runtimeCredentials.role,
  }), {role: runtimeCredentials.role});

  const enrollment = await seedEnrollment();
  for (const operation of [
    () => runtime.query('SELECT * FROM sabora.staff_invitation_outbox'),
    () => runtime.query(`INSERT INTO sabora.staff_invitation_outbox(
      id,enrollment_id,invite_version,invite_token_hash
    ) VALUES ($1,$2,1,decode($3,'hex'))`,
    [uuid('c'), enrollment.enrollmentId, enrollment.tokenHash]),
    () => runtime.query(`UPDATE sabora.staff_invitation_outbox
      SET state='cancelled' WHERE false`),
    () => runtime.query('SELECT * FROM sabora.staff_lifecycle_signing_keys'),
    () => runtime.query('CREATE TABLE sabora.forbidden_enqueue_escalation(id integer)'),
    () => runtime.query('SET ROLE sabora_staff_invitation_enqueue_fn_owner'),
  ]) await assert.rejects(operation(), error => error?.code === '42501');

  await assert.rejects(runtime.query(`SELECT * FROM
    sabora.transition_staff_lifecycle_authorized_candidate(
      NULL::text,NULL::text,NULL::uuid,NULL::text,NULL::uuid,NULL::uuid,
      NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
      NULL::bigint,NULL::bigint,NULL::text
    )`), error => error?.code === '42501');
});

test('PG17 restricted wrapper atomically commits invitation, ledger, audit and outbox', async () => {
  const invitation = await createIntegratedInvitation();
  assert.equal(invitation.result.enqueued, true);
  assert.equal(invitation.result.repeated, false);
  assert.equal(invitation.result.cancelledCount, 0);

  const stored = await admin.query(`SELECT e.state,e.invite_version,
      encode(e.invite_token_hash,'hex') AS enrollment_hash,
      o.id::text AS job_id,o.state AS job_state,o.invite_version AS job_version,
      encode(o.invite_token_hash,'hex') AS job_hash,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests r
        WHERE r.enrollment_id=e.id) AS requests,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit a
        WHERE a.enrollment_id=e.id) AS audit
    FROM sabora.staff_enrollments e
    JOIN sabora.staff_invitation_outbox o ON o.enrollment_id=e.id
    WHERE e.id=$1`, [invitation.enrollmentId]);
  assert.deepEqual(stored.rows, [{
    state: 'invited', invite_version: 1, enrollment_hash: invitation.tokenHash,
    job_id: invitation.result.jobId, job_state: 'pending', job_version: 1,
    job_hash: invitation.tokenHash, requests: 1, audit: 1,
  }]);

  const replay = await integratedEnqueue().transitionAndEnqueue(invitation.capability);
  assert.equal(replay.jobId, invitation.result.jobId);
  assert.equal(replay.enqueued, false);
  assert.equal(replay.repeated, true);
  assert.equal(replay.cancelledCount, 0);
  const counts = await admin.query(`SELECT
      (SELECT count(*)::integer FROM sabora.staff_invitation_outbox
        WHERE enrollment_id=$1) AS jobs,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests
        WHERE enrollment_id=$1) AS requests,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit
        WHERE enrollment_id=$1) AS audit`, [invitation.enrollmentId]);
  assert.deepEqual(counts.rows, [{jobs: 1, requests: 1, audit: 1}]);
});

test('PG17 concurrent identical invitation calls produce one job and one replay', async () => {
  const enrollmentId = uuid('f');
  const tokenHash = digest(`concurrent-integrated-${enrollmentId}`);
  const capability = integratedCapability({
    action: 'invite', enrollmentId, requestedRole: 'kitchen',
    inviteeEmailHashHex: digest(`concurrent-${enrollmentId}@example.invalid`),
    inviteTokenHashHex: tokenHash,
    correlationId: `integrated_concurrent_${String(sequence).padStart(8, '0')}`,
  });
  const [first, second] = await Promise.all([
    integratedEnqueue(runtime).transitionAndEnqueue(capability),
    integratedEnqueue(runtimeB).transitionAndEnqueue(capability),
  ]);
  assert.deepEqual([first.enqueued, second.enqueued].sort(), [false, true]);
  assert.equal(first.jobId, second.jobId);
  const counts = await admin.query(`SELECT
      (SELECT count(*)::integer FROM sabora.staff_enrollments WHERE id=$1) AS enrollments,
      (SELECT count(*)::integer FROM sabora.staff_invitation_outbox
        WHERE enrollment_id=$1) AS jobs,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests
        WHERE enrollment_id=$1) AS requests,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit
        WHERE enrollment_id=$1) AS audit`, [enrollmentId]);
  assert.deepEqual(counts.rows, [{enrollments: 1, jobs: 1, requests: 1, audit: 1}]);
});

test('PG17 restricted resend cancels claimed work and replay keeps one current job', async () => {
  const invitation = await createIntegratedInvitation();
  const claim = await claimCurrentStaffInvitation({
    withTransaction, repository, jobId: invitation.result.jobId,
  });
  assert.equal(claim.claimed, true);
  const nextHash = digest(`integrated-resend-${invitation.enrollmentId}`);
  const resend = integratedCapability({
    action: 'resend', enrollmentId: invitation.enrollmentId,
    inviteTokenHashHex: nextHash,
    correlationId: `integrated_resend_${String(sequence).padStart(8, '0')}`,
  });
  const result = await integratedEnqueue().transitionAndEnqueue(resend);
  assert.equal(result.enqueued, true);
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.transition.inviteVersion, 2);

  const replay = await integratedEnqueue().transitionAndEnqueue(resend);
  assert.equal(replay.enqueued, false);
  assert.equal(replay.jobId, result.jobId);
  assert.equal(replay.cancelledCount, 0);
  const jobs = await admin.query(`SELECT invite_version,state,
      fence IS NOT NULL AS fenced,encode(invite_token_hash,'hex') AS hash
    FROM sabora.staff_invitation_outbox WHERE enrollment_id=$1
    ORDER BY invite_version`, [invitation.enrollmentId]);
  assert.deepEqual(jobs.rows, [
    {invite_version: 1, state: 'cancelled', fenced: true, hash: invitation.tokenHash},
    {invite_version: 2, state: 'pending', fenced: false, hash: nextHash},
  ]);
});

test('PG17 enqueue conflict rolls back lifecycle, cancellation, ledger and audit', async () => {
  const invitation = await createIntegratedInvitation();
  const conflictingHash = digest(`conflicting-v2-${invitation.enrollmentId}`);
  const conflictingJob = await seedJob({
    enrollmentId: invitation.enrollmentId, version: 2, tokenHash: conflictingHash,
  });
  const nextHash = digest(`rollback-resend-${invitation.enrollmentId}`);
  const resend = integratedCapability({
    action: 'resend', enrollmentId: invitation.enrollmentId,
    inviteTokenHashHex: nextHash,
    correlationId: `integrated_rollback_${String(sequence).padStart(8, '0')}`,
  });
  await assert.rejects(integratedEnqueue().transitionAndEnqueue(resend),
    error => error?.code === '23505');

  const rolledBack = await admin.query(`SELECT e.state,e.invite_version,
      encode(e.invite_token_hash,'hex') AS hash,
      (SELECT state FROM sabora.staff_invitation_outbox
        WHERE enrollment_id=e.id AND invite_version=1) AS original_job_state,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests r
        WHERE r.enrollment_id=e.id) AS requests,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit a
        WHERE a.enrollment_id=e.id) AS audit
    FROM sabora.staff_enrollments e WHERE e.id=$1`, [invitation.enrollmentId]);
  assert.deepEqual(rolledBack.rows, [{
    state: 'invited', invite_version: 1, hash: invitation.tokenHash,
    original_job_state: 'pending', requests: 1, audit: 1,
  }]);

  await admin.query('DELETE FROM sabora.staff_invitation_outbox WHERE id=$1',
    [conflictingJob]);
  const retried = await integratedEnqueue().transitionAndEnqueue(resend);
  assert.equal(retried.enqueued, true);
  assert.equal(retried.cancelledCount, 1);
  const committed = await admin.query(`SELECT e.invite_version,
      encode(e.invite_token_hash,'hex') AS hash,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests r
        WHERE r.enrollment_id=e.id) AS requests,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit a
        WHERE a.enrollment_id=e.id) AS audit
    FROM sabora.staff_enrollments e WHERE e.id=$1`, [invitation.enrollmentId]);
  assert.deepEqual(committed.rows, [{
    invite_version: 2, hash: nextHash, requests: 2, audit: 2,
  }]);
});

test('PG17 acceptance through restricted wrapper cancels pending delivery atomically', async () => {
  const invitation = await createIntegratedInvitation();
  const subjectId = uuid('e');
  const accept = integratedCapability({
    actorId: subjectId, action: 'accept', enrollmentId: invitation.enrollmentId,
    subjectUserId: subjectId, inviteTokenHashHex: invitation.tokenHash,
    correlationId: `integrated_accept_${String(sequence).padStart(8, '0')}`,
  });
  const result = await runIntegratedLifecycle(accept);
  assert.equal(result.current_state, 'accepted');
  assert.equal(result.outbox_job_id, null);
  assert.equal(result.outbox_enqueued, false);
  assert.equal(result.outbox_cancelled_count, 1);
  const stored = await admin.query(`SELECT e.state AS enrollment_state,
      o.state AS job_state FROM sabora.staff_enrollments e
    JOIN sabora.staff_invitation_outbox o ON o.enrollment_id=e.id
    WHERE e.id=$1`, [invitation.enrollmentId]);
  assert.deepEqual(stored.rows, [{enrollment_state: 'accepted', job_state: 'cancelled'}]);
});

test('PG17 revoke wins a concurrent resend and leaves no deliverable job', async () => {
  const invitation = await createIntegratedInvitation();
  const revoke = integratedCapability({
    action: 'revoke', enrollmentId: invitation.enrollmentId,
    reason: 'CI integrated revoke race',
    correlationId: `integrated_revoke_${String(sequence).padStart(8, '0')}`,
  });
  const resend = integratedCapability({
    action: 'resend', enrollmentId: invitation.enrollmentId,
    inviteTokenHashHex: digest(`losing-resend-${invitation.enrollmentId}`),
    correlationId: `integrated_losing_${String(sequence).padStart(8, '0')}`,
  });
  const revocationClient = await runtime.connect();
  try {
    await revocationClient.query('BEGIN');
    const revoked = await revocationClient.query(
      STAFF_INVITATION_ENQUEUE_SQL, lifecycleArgs(revoke));
    assert.equal(revoked.rows[0].outbox_cancelled_count, 1);
    const resendPromise = integratedEnqueue(runtimeB).transitionAndEnqueue(resend);
    await waitForLock('sabora_outbox_runtime_b');
    await revocationClient.query('COMMIT');
    await assert.rejects(resendPromise,
      error => error?.code === '42501' && /staff_enrollment_revoked/.test(error.message));
  } catch (error) {
    await revocationClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    revocationClient.release();
  }

  const stored = await admin.query(`SELECT e.state AS enrollment_state,
      e.invite_version,o.state AS job_state,
      (SELECT count(*)::integer FROM sabora.staff_invitation_outbox current_job
        WHERE current_job.enrollment_id=e.id
          AND current_job.state IN ('pending','claimed')) AS deliverable_jobs
    FROM sabora.staff_enrollments e
    JOIN sabora.staff_invitation_outbox o ON o.enrollment_id=e.id
    WHERE e.id=$1`, [invitation.enrollmentId]);
  assert.deepEqual(stored.rows, [{
    enrollment_state: 'revoked', invite_version: 1,
    job_state: 'cancelled', deliverable_jobs: 0,
  }]);
});

test('PG17 expired claimed job receives new fence; stale worker cannot dispatch', async () => {
  const enrollment = await seedEnrollment();
  const jobId = await seedJob(enrollment);
  const first = await claimCurrentStaffInvitation({withTransaction, repository, jobId});
  assert.equal(first.claimed, true);
  await admin.query(`UPDATE sabora.staff_invitation_outbox
    SET created_at=clock_timestamp()-interval '3 minutes',
        claimed_at=clock_timestamp()-interval '2 minutes'
    WHERE id=$1`, [jobId]);
  const recovery = createStaffInvitationClaimRecoveryCandidate({withTransaction: callback =>
    withTransaction(query => callback((sql,values) => query({text:sql,values})))});
  const second = await recovery.reclaim({jobId, staleFence:first.fence, leaseSeconds:60});
  assert.equal(second.reclaimed, true);
  assert.notEqual(second.fence, first.fence);
  assert.deepEqual(await recovery.reclaim({jobId,staleFence:first.fence,leaseSeconds:60}),
    {reclaimed:false});
  assert.deepEqual(await authorizeStaffInvitationDispatch({
    withTransaction,repository,jobId,fence:first.fence,
  }), {authorized:false,reason:'claim_not_found'});
  assert.deepEqual(await authorizeStaffInvitationDispatch({
    withTransaction,repository,jobId,fence:second.fence,
  }), {authorized:true});
  assert.deepEqual(await recovery.reclaim({jobId,staleFence:second.fence,leaseSeconds:60}),
    {reclaimed:false});
});

test('PG17 unexpired claim cannot be reclaimed', async () => {
  const enrollment=await seedEnrollment();
  const jobId=await seedJob(enrollment);
  const claim=await claimCurrentStaffInvitation({withTransaction,repository,jobId});
  const recovery=createStaffInvitationClaimRecoveryCandidate({withTransaction: callback =>
    withTransaction(query => callback((sql,values) => query({text:sql,values})))});
  assert.deepEqual(await recovery.reclaim({jobId,staleFence:claim.fence,leaseSeconds:60}),
    {reclaimed:false});
});

test('PG17 restricted recovery login has only EXECUTE and rotates stale fence',async()=>{
  const overlay=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_claim_recovery_pg17.sql',
    import.meta.url),'utf8');
  await admin.query(overlay);
  const role='sabora_ci_staff_claim_recovery';
  const password='sabora_ci_staff_claim_recovery_ephemeral';
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'
    NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${role}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.reclaim_staff_invitation_claim_candidate(uuid,uuid,integer) TO ${role}`);
  const pool=new Pool({connectionString:connectionString({role,value:password}),max:2});
  try {
    const permissions=await pool.query(`SELECT
      session_user::text AS login,current_user::text AS effective,
      has_table_privilege(current_user,'sabora.staff_invitation_outbox','SELECT') AS can_read,
      has_table_privilege(current_user,'sabora.staff_invitation_outbox','UPDATE') AS can_update,
      has_function_privilege(current_user,
        'sabora.reclaim_staff_invitation_claim_candidate(uuid,uuid,integer)','EXECUTE') AS can_recover,
      has_function_privilege(current_user,
        'sabora.transition_staff_lifecycle_with_outbox_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text)','EXECUTE') AS can_transition`);
    assert.deepEqual(permissions.rows,[{
      login:role,effective:role,can_read:false,can_update:false,
      can_recover:true,can_transition:false,
    }]);
    await assert.rejects(pool.query('SELECT * FROM sabora.staff_invitation_outbox'),
      error=>error?.code==='42501');
    const enrollment=await seedEnrollment();
    const jobId=await seedJob(enrollment);
    const first=await claimCurrentStaffInvitation({withTransaction,repository,jobId});
    assert.equal(first.claimed,true);
    const restricted=createRestrictedStaffClaimRecoveryCandidate({query:(...args)=>pool.query(...args)});
    assert.deepEqual(await restricted.reclaim({jobId,staleFence:first.fence,leaseSeconds:60}),
      {reclaimed:false});
    await admin.query(`UPDATE sabora.staff_invitation_outbox
      SET created_at=clock_timestamp()-interval '3 minutes',
          claimed_at=clock_timestamp()-interval '2 minutes'
      WHERE id=$1`,[jobId]);
    const next=await restricted.reclaim({jobId,staleFence:first.fence,leaseSeconds:60});
    assert.equal(next.reclaimed,true);
    assert.notEqual(next.fence,first.fence);
    assert.deepEqual(await restricted.reclaim({jobId,staleFence:first.fence,leaseSeconds:60}),
      {reclaimed:false});
    assert.deepEqual(await authorizeStaffInvitationDispatch({
      withTransaction,repository,jobId,fence:first.fence,
    }),{authorized:false,reason:'claim_not_found'});
    assert.deepEqual(await authorizeStaffInvitationDispatch({
      withTransaction,repository,jobId,fence:next.fence,
    }),{authorized:true});
    assert.deepEqual(await restricted.reclaim({jobId,staleFence:next.fence,leaseSeconds:60}),
      {reclaimed:false});
    await assert.rejects(pool.query(`UPDATE sabora.staff_invitation_outbox
      SET state='pending' WHERE id=$1`,[jobId]),error=>error?.code==='42501');
  } finally {
    await pool.end();
  }
});
