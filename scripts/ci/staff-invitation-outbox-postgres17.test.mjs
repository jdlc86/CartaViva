import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {sealStaffInvitationToken,openStaffInvitationToken} from '../../apps/api/src/staff-invitation-envelope-candidate.mjs';
import {createStaffInvitationCustodyCoordinatorCandidate} from '../../apps/api/src/staff-invitation-custody-coordinator-candidate.mjs';
import {createStaffDispatchEnvelopeReaderCandidate} from '../../apps/api/src/staff-invitation-dispatch-envelope-reader-candidate.mjs';
import {createStaffCustodyNonceConsumerCandidate} from '../../apps/api/src/staff-custody-nonce-consumer-candidate.mjs';
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

test('PG17 encrypted custody candidate is atomic with outbox transaction and rejects mismatches',async()=>{
  const sql=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_custody_pg17.sql',import.meta.url),'utf8');
  await admin.query(sql);
  const token='A'.repeat(48);
  const tokenHash=digest(token);
  const enrollment=await seedEnrollment({tokenHash});
  const jobId=uuid('c');
  const key=randomBytes(32);
  const envelope=sealStaffInvitationToken({
    token,enrollmentId:enrollment.enrollmentId,inviteVersion:enrollment.version,
    tokenHashHex:tokenHash,key,keyId:'candidate_key_001',
  });
  const write=async(query,id=jobId,hash=tokenHash,tag=envelope.tag)=>{
    await query({text:`SELECT sabora.store_staff_invitation_custody_candidate(
      $1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::text,$7::text,$8::text)`,
    values:[id,enrollment.enrollmentId,enrollment.version,hash,envelope.keyId,
      envelope.nonce,envelope.ciphertext,tag]});
  };
  await assert.rejects(withTransaction(async query=>{
    await query({text:`INSERT INTO sabora.staff_invitation_outbox
      (id,enrollment_id,invite_version,invite_token_hash)
      VALUES ($1,$2,$3,decode($4,'hex'))`,
    values:[jobId,enrollment.enrollmentId,enrollment.version,tokenHash]});
    await write(query,jobId,'f'.repeat(64));
  }),error=>error?.code==='23514');
  const rolledBack=await admin.query(`SELECT count(*)::integer AS n
    FROM sabora.staff_invitation_outbox WHERE id=$1`,[jobId]);
  assert.equal(rolledBack.rows[0].n,0);
  await withTransaction(async query=>{
    await query({text:`INSERT INTO sabora.staff_invitation_outbox
      (id,enrollment_id,invite_version,invite_token_hash)
      VALUES ($1,$2,$3,decode($4,'hex'))`,
    values:[jobId,enrollment.enrollmentId,enrollment.version,tokenHash]});
    await write(query);
  });
  const stored=await admin.query(`SELECT key_id,encode(nonce,'base64') AS nonce,
    encode(ciphertext,'base64') AS ciphertext,encode(tag,'base64') AS tag,
    encode(token_hash,'hex') AS token_hash
    FROM sabora.staff_invitation_custody_candidate WHERE job_id=$1`,[jobId]);
  assert.equal(stored.rows.length,1);
  assert.equal(stored.rows[0].token_hash,tokenHash);
  assert.equal(stored.rows[0].ciphertext.includes(token),false);
  assert.equal(openStaffInvitationToken({
    envelope,enrollmentId:enrollment.enrollmentId,
    inviteVersion:enrollment.version,tokenHashHex:tokenHash,key,
  }),token);
  await assert.rejects(withTransaction(query=>write(query)),error=>error?.code==='23505');
  const deniedRead=await admin.query(`SELECT has_table_privilege(
    $1,'sabora.staff_invitation_custody_candidate','SELECT') AS can_read`,
  [runtimeCredentials.role]);
  assert.equal(deniedRead.rows[0].can_read,false);
  await assert.rejects(runtime.query('SELECT * FROM sabora.staff_invitation_custody_candidate'),
    error=>error?.code==='42501');
});

test('PG17 lifecycle + outbox + encrypted custody commit or rollback as one unit',async()=>{
  const encryptionKey=randomBytes(32);
  const coordinator=createStaffInvitationCustodyCoordinatorCandidate({
    withTransaction,encryptionKey,keyId:'candidate_key_001',
  });
  const enrollmentId=uuid('b');
  const token='B'.repeat(48);
  const tokenHash=digest(token);
  const capability=issueLifecycle({
    actorId:ownerId,action:'invite',enrollmentId,
    subjectUserId:null,requestedRole:'waiter',
    inviteeEmailHashHex:digest('custody-atomic@example.invalid'),
    inviteTokenHashHex:tokenHash,credentialEvidenceHashHex:null,
    reason:null,correlationId:'custody_atomic_001',
  });
  await assert.rejects(coordinator.transitionAndStore({
    capability,token:'C'.repeat(48),
  }),/staff_delivery_token_hash_mismatch/);
  const absent=await admin.query(`SELECT
    (SELECT count(*)::integer FROM sabora.staff_enrollments WHERE id=$1) AS enrollment,
    (SELECT count(*)::integer FROM sabora.staff_invitation_outbox WHERE enrollment_id=$1) AS outbox,
    (SELECT count(*)::integer FROM sabora.staff_invitation_custody_candidate WHERE enrollment_id=$1) AS custody`,
  [enrollmentId]);
  assert.deepEqual(absent.rows,[{enrollment:0,outbox:0,custody:0}]);
  const committed=await coordinator.transitionAndStore({capability,token});
  assert.equal(committed.stored,true);
  assert.equal(committed.enqueued,true);
  const rows=await admin.query(`SELECT o.id AS job_id,
    o.invite_version,encode(o.invite_token_hash,'hex') AS token_hash,
    c.key_id,encode(c.nonce,'base64') AS nonce,
    encode(c.ciphertext,'base64') AS ciphertext,encode(c.tag,'base64') AS tag
    FROM sabora.staff_invitation_outbox o
    JOIN sabora.staff_invitation_custody_candidate c ON c.job_id=o.id
    WHERE o.enrollment_id=$1`,[enrollmentId]);
  assert.equal(rows.rows.length,1);
  assert.equal(rows.rows[0].job_id,committed.jobId);
  assert.equal(rows.rows[0].token_hash,tokenHash);
  assert.equal(rows.rows[0].ciphertext.includes(token),false);
  const repeated=await coordinator.transitionAndStore({capability,token});
  assert.equal(repeated.repeated,true);
  assert.equal(repeated.stored,false);
  assert.equal(repeated.jobId,committed.jobId);
  const count=await admin.query(`SELECT count(*)::integer AS n
    FROM sabora.staff_invitation_custody_candidate WHERE enrollment_id=$1`,
  [enrollmentId]);
  assert.equal(count.rows[0].n,1);
});

test('PG17 restricted custody owner commits atomic invite and denies direct access',async()=>{
  const overlay=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_custody_restricted_pg17.sql',
    import.meta.url),'utf8');
  await admin.query(overlay);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.store_staff_invitation_custody_restricted_candidate(
      uuid,uuid,integer,text,text,text,text,text) TO ${runtimeCredentials.role}`);
  const privileges=await runtime.query(`SELECT
    session_user::text AS login,current_user::text AS effective,
    has_table_privilege(current_user,'sabora.staff_invitation_custody_candidate','SELECT') AS can_read,
    has_table_privilege(current_user,'sabora.staff_invitation_custody_candidate','INSERT') AS can_insert,
    has_table_privilege(current_user,'sabora.staff_invitation_outbox','SELECT') AS can_read_outbox,
    has_function_privilege(current_user,
      'sabora.store_staff_invitation_custody_restricted_candidate(uuid,uuid,integer,text,text,text,text,text)',
      'EXECUTE') AS can_store`);
  assert.deepEqual(privileges.rows,[{
    login:runtimeCredentials.role,effective:runtimeCredentials.role,
    can_read:false,can_insert:false,can_read_outbox:false,can_store:true,
  }]);
  await assert.rejects(runtime.query('SELECT * FROM sabora.staff_invitation_custody_candidate'),
    error=>error?.code==='42501');
  await assert.rejects(runtime.query(`INSERT INTO sabora.staff_invitation_custody_candidate(
    job_id,enrollment_id,invite_version,token_hash,envelope_version,key_id,nonce,ciphertext,tag
  ) VALUES (gen_random_uuid(),gen_random_uuid(),1,decode($1,'hex'),1,
    'candidate_key_001',decode($2,'hex'),decode($3,'hex'),decode($4,'hex'))`,
  ['a'.repeat(64),'b'.repeat(24),'c'.repeat(64),'d'.repeat(32)]),
  error=>error?.code==='42501');
  const token='R'.repeat(48);
  const enrollmentId=uuid('d');
  const capability=integratedCapability({
    action:'invite',enrollmentId,requestedRole:'waiter',
    inviteeEmailHashHex:digest('restricted-custody@example.invalid'),
    inviteTokenHashHex:digest(token),correlationId:'restricted_custody_001',
  });
  const coordinator=createStaffInvitationCustodyCoordinatorCandidate({
    withTransaction:callback=>withTransaction(callback,runtime),
    encryptionKey:randomBytes(32),keyId:'candidate_key_001',restrictedCustody:true,
  });
  await assert.rejects(coordinator.transitionAndStore({capability,token:'X'.repeat(48)}),
    /staff_delivery_token_hash_mismatch/);
  const rolled=await admin.query(`SELECT count(*)::integer AS n FROM
    sabora.staff_enrollments WHERE id=$1`,[enrollmentId]);
  assert.equal(rolled.rows[0].n,0);
  const result=await coordinator.transitionAndStore({capability,token});
  assert.equal(result.stored,true);
  assert.equal(result.enqueued,true);
  const record=await admin.query(`SELECT c.job_id,
    encode(c.token_hash,'hex') AS token_hash,c.key_id
    FROM sabora.staff_invitation_custody_candidate c
    JOIN sabora.staff_invitation_outbox o ON o.id=c.job_id
    WHERE c.enrollment_id=$1 AND c.invite_version=o.invite_version`,[enrollmentId]);
  assert.equal(record.rows.length,1);
  assert.equal(record.rows[0].job_id,result.jobId);
  assert.equal(record.rows[0].token_hash,digest(token));
  const replay=await coordinator.transitionAndStore({capability,token});
  assert.equal(replay.stored,false);
  assert.equal(replay.repeated,true);
  await assert.rejects(runtime.query(`SELECT sabora.store_staff_invitation_custody_candidate(
    $1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::text,$7::text,$8::text)`,
  [result.jobId,enrollmentId,1,digest(token),'candidate_key_001',
    'a'.repeat(16),'b'.repeat(48),'c'.repeat(22)]),error=>error?.code==='42501');
});

test('PG17 fenced dispatch envelope read is restricted and current-version only',async()=>{
  const sql=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_dispatch_envelope_pg17.sql',
    import.meta.url),'utf8');
  await admin.query(sql);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.read_staff_invitation_dispatch_envelope_candidate(uuid,uuid)
    TO ${runtimeCredentials.role}`);
  const token='S'.repeat(48),hash=digest(token),key=randomBytes(32);
  const enrollment=await seedEnrollment({tokenHash:hash});
  const jobId=await seedJob(enrollment);
  const envelope=sealStaffInvitationToken({
    token,enrollmentId:enrollment.enrollmentId,inviteVersion:enrollment.version,
    tokenHashHex:hash,key,keyId:'candidate_key_001',
  });
  await admin.query(`SELECT sabora.store_staff_invitation_custody_candidate(
    $1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::text,$7::text,$8::text)`,
    [jobId,enrollment.enrollmentId,enrollment.version,hash,envelope.keyId,
      envelope.nonce,envelope.ciphertext,envelope.tag]);
  const reader=createStaffDispatchEnvelopeReaderCandidate({
    query:(...args)=>runtime.query(...args),
    resolveKey:async id=>id==='candidate_key_001'?key:null,
  });
  const privileges=await runtime.query(`SELECT
    has_table_privilege(current_user,'sabora.staff_invitation_custody_candidate','SELECT') AS custody,
    has_table_privilege(current_user,'sabora.staff_invitation_outbox','SELECT') AS outbox,
    has_table_privilege(current_user,'sabora.staff_enrollments','SELECT') AS enrollment`);
  assert.deepEqual(privileges.rows,[{custody:false,outbox:false,enrollment:false}]);
  await assert.rejects(runtime.query('SELECT * FROM sabora.staff_invitation_custody_candidate'),
    error=>error?.code==='42501');
  const wrongFence=uuid('e');
  assert.deepEqual(await reader.read({jobId,fence:wrongFence}),{authorized:false});
  const claim=await claimCurrentStaffInvitation({withTransaction,repository,jobId});
  assert.equal(claim.claimed,true);
  assert.deepEqual(await reader.read({jobId,fence:claim.fence}),{authorized:false});
  assert.deepEqual(await authorizeStaffInvitationDispatch({
    withTransaction,repository,jobId,fence:claim.fence}),{authorized:true});
  assert.deepEqual(await reader.read({jobId,fence:wrongFence}),{authorized:false});
  const opened=await reader.read({jobId,fence:claim.fence});
  assert.equal(opened.authorized,true);
  assert.equal(opened.token,token);
  assert.equal(opened.inviteVersion,enrollment.version);
  await admin.query(`UPDATE sabora.staff_enrollments
    SET invite_token_hash=decode($2,'hex') WHERE id=$1`,
    [enrollment.enrollmentId,digest('superseded-token')]);
  assert.deepEqual(await reader.read({jobId,fence:claim.fence}),{authorized:false});
});

test('PG17 terminal custody purge is bounded, privileged and idempotent',async()=>{
  const sql=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_custody_purge_pg17.sql',
    import.meta.url),'utf8');
  await admin.query(sql);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.purge_terminal_staff_invitation_custody_candidate(timestamptz,integer)
    TO ${runtimeCredentials.role}`);
  const key=randomBytes(32);
  const cases=[];
  for(const state of ['pending','cancelled','cancelled']){
    const token='P'.repeat(40)+String(cases.length).padStart(8,'0');
    const tokenHash=digest(token);
    const enrollment=await seedEnrollment({tokenHash});
    const jobId=await seedJob(enrollment);
    const envelope=sealStaffInvitationToken({
      token,enrollmentId:enrollment.enrollmentId,inviteVersion:enrollment.version,
      tokenHashHex:tokenHash,key,keyId:'candidate_key_001',
    });
    await admin.query(`SELECT sabora.store_staff_invitation_custody_candidate(
      $1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::text,$7::text,$8::text)`,
      [jobId,enrollment.enrollmentId,enrollment.version,tokenHash,
        envelope.keyId,envelope.nonce,envelope.ciphertext,envelope.tag]);
    if(state==='cancelled'){
      await admin.query(`UPDATE sabora.staff_invitation_outbox
        SET state='cancelled',updated_at=clock_timestamp()
        WHERE id=$1`,[jobId]);
    }
    await admin.query(`UPDATE sabora.staff_invitation_custody_candidate
      SET created_at=clock_timestamp()-interval '2 days' WHERE job_id=$1`,[jobId]);
    await admin.query(`UPDATE sabora.staff_invitation_outbox
      SET updated_at=clock_timestamp()-interval '2 days',
      created_at=clock_timestamp()-interval '3 days' WHERE id=$1`,[jobId]);
    cases.push({jobId,state});
  }
  const cutoff=new Date().toISOString();
  const purge=async(limit,date=cutoff)=>runtime.query(
    `SELECT sabora.purge_terminal_staff_invitation_custody_candidate(
      $1::timestamptz,$2::integer) AS removed`,[date,limit]);
  await assert.rejects(purge(0),e=>e?.code==='22023');
  await assert.rejects(purge(501),e=>e?.code==='22023');
  await assert.rejects(purge(1,new Date(Date.now()+86400000).toISOString()),
    e=>e?.code==='22023');
  await assert.rejects(runtime.query(
    'DELETE FROM sabora.staff_invitation_custody_candidate'),e=>e?.code==='42501');
  const first=await purge(1);
  assert.equal(first.rows[0].removed,1);
  const second=await purge(1);
  assert.equal(second.rows[0].removed,1);
  const third=await purge(1);
  assert.equal(third.rows[0].removed,0);
  const rows=await admin.query(`SELECT c.job_id
    FROM sabora.staff_invitation_custody_candidate c
    WHERE c.job_id=ANY($1::uuid[])`,[cases.map(x=>x.jobId)]);
  assert.deepEqual(rows.rows.map(x=>x.job_id),[cases[0].jobId]);
  const remaining=await admin.query(`SELECT count(*)::integer AS n
    FROM sabora.staff_invitation_outbox WHERE id=ANY($1::uuid[])`,
    [cases.map(x=>x.jobId)]);
  assert.equal(remaining.rows[0].n,3);
});

test('PG17 durable nonce consumption is atomic across concurrent runtime pools',async()=>{
  const sql=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_custody_approval_nonce_pg17.sql',
    import.meta.url),'utf8');
  await admin.query(sql);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.consume_staff_custody_approval_nonce_candidate(uuid,timestamptz,text)
    TO ${runtimeCredentials.role}`);
  const consumerA=createStaffCustodyNonceConsumerCandidate({
    query:(...args)=>runtime.query(...args),
  });
  const consumerB=createStaffCustodyNonceConsumerCandidate({
    query:(...args)=>runtimeB.query(...args),
  });
  const nonce=uuid('d'),expiry=new Date(Date.now()+120000).toISOString();
  const results=await Promise.all(Array.from({length:16},(_,i)=>
    (i%2===0?consumerA:consumerB)(nonce,expiry,'staff_root_001')));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(results.filter(x=>x===false).length,15);
  assert.equal(await consumerB(nonce,expiry,'staff_root_001'),false);
  const stored=await admin.query(`SELECT nonce,actor_id FROM
    sabora.staff_custody_approval_nonce_candidate WHERE nonce=$1`,[nonce]);
  assert.deepEqual(stored.rows,[{nonce,actor_id:'staff_root_001'}]);
  await assert.rejects(runtime.query(
    'SELECT * FROM sabora.staff_custody_approval_nonce_candidate'),
    error=>error?.code==='42501');
  await assert.rejects(runtime.query(
    'DELETE FROM sabora.staff_custody_approval_nonce_candidate'),
    error=>error?.code==='42501');
  assert.equal(await consumerA(uuid('e'),
    new Date(Date.now()-60000).toISOString(),'staff_root_001'),false);
});
