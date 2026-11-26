import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes,generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {sealStaffInvitationToken,openStaffInvitationToken} from '../../apps/api/src/staff-invitation-envelope-candidate.mjs';
import {createStaffInvitationCustodyCoordinatorCandidate} from '../../apps/api/src/staff-invitation-custody-coordinator-candidate.mjs';
import {createStaffDispatchEnvelopeReaderCandidate} from '../../apps/api/src/staff-invitation-dispatch-envelope-reader-candidate.mjs';
import {createStaffCustodyNonceConsumerCandidate} from '../../apps/api/src/staff-custody-nonce-consumer-candidate.mjs';
import {createStaffCustodyApprovalAuthorityCandidate} from '../../apps/api/src/staff-custody-approval-authority-candidate.mjs';
import {createStaffCustodyMaintenanceCandidate} from '../../apps/api/src/staff-custody-maintenance-candidate.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffLifecycleCapabilityIssuer,createStaffLifecycleDirectoryCapabilityIssuer,createStaffInviteeEmailHasher} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {createStaffLifecycleRepository} from '../../apps/api/src/staff-lifecycle-repository.mjs';
import {createStaffLifecycleCoordinator,STAFF_INVITATION_DELIVERY_TOKEN} from '../../apps/api/src/staff-lifecycle-coordinator.mjs';
import {createPostgresTransaction} from '../../apps/api/src/postgres-transaction.mjs';
import {createDurableStaffLifecycleRepositoryCandidate,createStaffDirectoryDispatchReaderCandidate,DIRECTORY_OUTBOX_SQL} from '../../apps/api/src/staff-invitation-durable-lifecycle-candidate.mjs';
import {createStaffInvitationResendSender} from '../../apps/api/src/staff-invitation-resend.mjs';
import {createStaffVerifiedEnrollmentCandidate,STAFF_ENROLLMENT_LOGIN,VERIFIED_ACCEPT_SQL} from '../../apps/api/src/staff-verified-enrollment-candidate.mjs';
import {createStaffPasskeyBrowserFixture} from './staff-passkey-browser-fixture.mjs';
import {createStaffPasskeySession} from '../../apps/api/src/staff-passkey-session.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {createStaffDirectoryCapabilityIssuer} from '../../apps/api/src/staff-directory-capability.mjs';
import {createVerifiedStaffDirectoryFromPool} from '../../apps/api/src/staff-directory-composition.mjs';
import {registerStaffDirectoryHttpCandidate} from '../../apps/api/src/staff-directory-http-candidate.mjs';
import {createOwnershipCapabilityIssuer,createOwnershipGovernanceRepository,registerOwnershipGovernanceHttp,assertOwnershipRuntimeIdentity,OWNERSHIP_ROLE,OWNERSHIP_SQL} from '../../apps/api/src/ownership-governance-candidate.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {STAFF_ADMIN_SUBJECT_SQL} from '../../apps/api/src/staff-admin-subject-candidate.mjs';
import {createVerifiedDurableStaffAdminCandidate} from '../../apps/api/src/staff-durable-admin-composition.mjs';
import {registerStaffEnrollmentHttpCandidate} from '../../apps/api/src/staff-enrollment-http-candidate.mjs';
import {pathToFileURL} from 'node:url';
import {startPublishedManagementPwa} from './published-client-pwa-fixture.mjs';
import {preflightStaffInvitationEnqueueIdentity} from '../../apps/api/src/staff-invitation-enqueue-identity-preflight.mjs';
import {claimCurrentStaffInvitation} from '../../apps/api/src/staff-invitation-claim-candidate.mjs';
import {authorizeStaffInvitationDispatch,dispatchStaffInvitation} from '../../apps/api/src/staff-invitation-dispatch-guard.mjs';
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
const issueLifecycleRaw = createStaffLifecycleCapabilityIssuer({
  keyId: lifecycleKeyId, secret: lifecycleSecret, databaseRole: 'postgres',
});
const issueIntegratedLifecycleRaw = createStaffLifecycleCapabilityIssuer({
  keyId: lifecycleKeyId, secret: lifecycleSecret,
  databaseRole: runtimeCredentials.role,
});
const withIdentityNames=(issuer,input)=>issuer({...input,
  givenName:input.action==='invite'?(input.givenName??'Persona'):null,
  familyName:input.action==='invite'?(input.familyName??`Prueba ${input.correlationId}`):null,
});
const issueLifecycle=input=>withIdentityNames(issueLifecycleRaw,input);
const issueIntegratedLifecycle=input=>withIdentityNames(issueIntegratedLifecycleRaw,input);
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
    capability.expiresAtMs, capability.givenName, capability.familyName,
    capability.signatureHex,
  ];
}
function legacyLifecycleArgs(capability) {
  return lifecycleArgs(capability).filter((_,index)=>index!==14&&index!==15);
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
      text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text
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
      sabora.transition_staff_lifecycle_with_identity_candidate(
        $1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::text,
        $8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint,
        $14::bigint,$15::text,$16::text,$17::text
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

  const replayEnrollmentId = uuid('f');
  const replayTokenHash = digest(`regenerated-${replayEnrollmentId}`);
  const replayCapability = integratedCapability({
    action: 'invite', enrollmentId: replayEnrollmentId,
    requestedRole: invitation.capability.requestedRole,
    inviteeEmailHashHex: invitation.capability.inviteeEmailHashHex,
    inviteTokenHashHex: replayTokenHash,
    correlationId: invitation.capability.correlationId,
  });
  const replay = await integratedEnqueue().transitionAndEnqueue(replayCapability);
  assert.equal(replay.jobId, invitation.result.jobId);
  assert.equal(replay.transition.enrollmentId, invitation.enrollmentId);
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
  assert.equal((await admin.query(
    'SELECT count(*)::integer AS n FROM sabora.staff_enrollments WHERE id=$1',
    [replayEnrollmentId]
  )).rows[0].n, 0);
});

test('PG17 concurrent durable invitation retries with regenerated material produce one job', async () => {
  const firstEnrollmentId = uuid('f');
  const secondEnrollmentId = uuid('f');
  const correlationId = `integrated_concurrent_${String(sequence).padStart(8, '0')}`;
  const inviteeEmailHashHex = digest(`concurrent-${firstEnrollmentId}@example.invalid`);
  const firstCapability = integratedCapability({
    action: 'invite', enrollmentId: firstEnrollmentId, requestedRole: 'kitchen',
    inviteeEmailHashHex,
    inviteTokenHashHex: digest(`concurrent-integrated-${firstEnrollmentId}`),
    correlationId,
  });
  const secondCapability = integratedCapability({
    action: 'invite', enrollmentId: secondEnrollmentId, requestedRole: 'kitchen',
    inviteeEmailHashHex,
    inviteTokenHashHex: digest(`concurrent-integrated-${secondEnrollmentId}`),
    correlationId,
  });
  const [first, second] = await Promise.all([
    integratedEnqueue(runtime).transitionAndEnqueue(firstCapability),
    integratedEnqueue(runtimeB).transitionAndEnqueue(secondCapability),
  ]);
  assert.deepEqual([first.enqueued, second.enqueued].sort(), [false, true]);
  assert.equal(first.jobId, second.jobId);
  assert.equal(first.transition.enrollmentId, second.transition.enrollmentId);
  assert.ok([firstEnrollmentId, secondEnrollmentId].includes(first.transition.enrollmentId));
  const enrollmentId = first.transition.enrollmentId;
  const counts = await admin.query(`SELECT
      (SELECT count(*)::integer FROM sabora.staff_enrollments
        WHERE id=ANY($1::uuid[])) AS enrollments,
      (SELECT count(*)::integer FROM sabora.staff_invitation_outbox
        WHERE enrollment_id=$2) AS jobs,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_requests
        WHERE enrollment_id=$2) AS requests,
      (SELECT count(*)::integer FROM sabora.staff_lifecycle_audit
        WHERE enrollment_id=$2) AS audit`,
  [[firstEnrollmentId, secondEnrollmentId], enrollmentId]);
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

  const replay = await integratedEnqueue().transitionAndEnqueue(integratedCapability({
    action: 'resend', enrollmentId: invitation.enrollmentId,
    inviteTokenHashHex: digest(`regenerated-resend-${invitation.enrollmentId}`),
    correlationId: resend.correlationId,
  }));
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
        'sabora.transition_staff_lifecycle_with_outbox_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text)','EXECUTE') AS can_transition`);
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
  const replayToken='D'.repeat(48);
  const repeated=await coordinator.transitionAndStore({
    capability:issueLifecycle({
      actorId:ownerId,action:'invite',enrollmentId:uuid('b'),
      subjectUserId:null,requestedRole:'waiter',
      inviteeEmailHashHex:capability.inviteeEmailHashHex,
      inviteTokenHashHex:digest(replayToken),credentialEvidenceHashHex:null,
      reason:null,correlationId:capability.correlationId,
    }),
    token:replayToken,
  });
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
  const replayToken='Y'.repeat(48);
  const replay=await coordinator.transitionAndStore({
    capability:integratedCapability({
      action:'invite',enrollmentId:uuid('d'),requestedRole:'waiter',
      inviteeEmailHashHex:capability.inviteeEmailHashHex,
      inviteTokenHashHex:digest(replayToken),
      correlationId:capability.correlationId,
    }),
    token:replayToken,
  });
  assert.equal(replay.stored,false);
  assert.equal(replay.repeated,true);
  await assert.rejects(runtime.query(`SELECT sabora.store_staff_invitation_custody_candidate(
    $1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::text,$7::text,$8::text)`,
  [result.jobId,enrollmentId,1,digest(token),'candidate_key_001',
    'a'.repeat(16),'b'.repeat(48),'c'.repeat(22)]),error=>error?.code==='42501');
});

test('PG17 fenced dispatch emits canonical envelopes for boundary and long tokens',async()=>{
  const sql=await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_dispatch_envelope_pg17.sql',
    import.meta.url),'utf8');
  await admin.query(sql);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.read_staff_invitation_dispatch_envelope_candidate(uuid,uuid)
    TO ${runtimeCredentials.role}`);
  const privileges=await runtime.query(`SELECT
    has_table_privilege(current_user,'sabora.staff_invitation_custody_candidate','SELECT') AS custody,
    has_table_privilege(current_user,'sabora.staff_invitation_outbox','SELECT') AS outbox,
    has_table_privilege(current_user,'sabora.staff_enrollments','SELECT') AS enrollment`);
  assert.deepEqual(privileges.rows,[{custody:false,outbox:false,enrollment:false}]);
  await assert.rejects(runtime.query('SELECT * FROM sabora.staff_invitation_custody_candidate'),
    error=>error?.code==='42501');
  const key=randomBytes(32);
  const reader=createStaffDispatchEnvelopeReaderCandidate({
    query:(...args)=>runtime.query(...args),
    resolveKey:async id=>id==='candidate_key_001'?key:null,
  });
  for(const [index,length] of [32,48,57,58,64,128,512].entries()){
    const token=String.fromCharCode(65+index).repeat(length);
    const hash=digest(token);
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
    const wrongFence=uuid('e');
    assert.deepEqual(await reader.read({jobId,fence:wrongFence}),{authorized:false});
    const claim=await claimCurrentStaffInvitation({withTransaction,repository,jobId});
    assert.equal(claim.claimed,true);
    assert.deepEqual(await reader.read({jobId,fence:claim.fence}),{authorized:false});
    assert.deepEqual(await authorizeStaffInvitationDispatch({
      withTransaction,repository,jobId,fence:claim.fence}),{authorized:true});
    assert.deepEqual(await reader.read({jobId,fence:wrongFence}),{authorized:false});
    const serialized=await runtime.query(`SELECT * FROM
      sabora.read_staff_invitation_dispatch_envelope_candidate($1::uuid,$2::uuid)`,
    [jobId,claim.fence]);
    assert.equal(serialized.rows.length,1);
    assert.equal(serialized.rows[0].result_nonce,envelope.nonce);
    assert.equal(serialized.rows[0].result_ciphertext,envelope.ciphertext);
    assert.equal(serialized.rows[0].result_tag,envelope.tag);
    for(const field of ['result_nonce','result_ciphertext','result_tag']){
      assert.match(serialized.rows[0][field],/^[A-Za-z0-9_-]+$/);
      assert.doesNotMatch(serialized.rows[0][field],/\r|\n/);
    }
    const opened=await reader.read({jobId,fence:claim.fence});
    assert.equal(opened.authorized,true);
    assert.equal(opened.token,token);
    assert.equal(opened.inviteVersion,enrollment.version);
    if(length===64){
      await admin.query(`UPDATE sabora.staff_enrollments
        SET invite_token_hash=decode($2,'hex') WHERE id=$1`,
      [enrollment.enrollmentId,digest('superseded-token')]);
      assert.deepEqual(await reader.read({jobId,fence:claim.fence}),{authorized:false});
    }
    if(length===128){
      await admin.query(`UPDATE sabora.staff_enrollments
        SET state='revoked',invite_token_hash=sha256(invite_token_hash),
          revoked_at=clock_timestamp(),revocation_reason='dispatch reader regression'
        WHERE id=$1`,
      [enrollment.enrollmentId]);
      assert.deepEqual(await reader.read({jobId,fence:claim.fence}),{authorized:false});
    }
  }
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

test('PG17 signed maintenance grant is consumed once and purges only terminal ciphertext',async()=>{
  const now=new Date();
  const cutoff=new Date(now.getTime()-3600000).toISOString();
  const token='G'.repeat(48),tokenHash=digest(token),key=randomBytes(32);
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
  await admin.query(`UPDATE sabora.staff_invitation_outbox
    SET state='cancelled',updated_at=clock_timestamp()-interval '2 days',
    created_at=clock_timestamp()-interval '3 days' WHERE id=$1`,[jobId]);
  await admin.query(`UPDATE sabora.staff_invitation_custody_candidate
    SET created_at=clock_timestamp()-interval '2 days' WHERE job_id=$1`,[jobId]);
  await admin.query(`GRANT EXECUTE ON FUNCTION
    sabora.purge_terminal_staff_invitation_custody_candidate(timestamptz,integer)
    TO ${runtimeCredentials.role}`);
  const consumer=createStaffCustodyNonceConsumerCandidate({
    query:(...args)=>runtime.query(...args),
  });
  const authority=createStaffCustodyApprovalAuthorityCandidate({
    secret:randomBytes(32),allowedActors:['staff_root_001'],
    consumeNonce:consumer,
  });
  const maintenance=createStaffCustodyMaintenanceCandidate({
    query:(...args)=>runtimeB.query(...args),approvalAuthority:authority,
  });
  const grant=authority.issue({
    actorId:'staff_root_001',cutoff,maxRows:1,maxBatches:2,
  });
  const options={cutoff,maxRows:1,maxBatches:2,authorization:grant};
  assert.deepEqual(await maintenance.run(options),
    {executed:false,removed:0,batches:0});
  const before=await admin.query(`SELECT count(*)::integer AS n FROM
    sabora.staff_custody_approval_nonce_candidate WHERE nonce=$1`,[grant.nonce]);
  assert.equal(before.rows[0].n,0);
  const result=await maintenance.run({...options,dryRun:false});
  assert.deepEqual(result,{executed:true,removed:1,batches:2});
  await assert.rejects(maintenance.run({...options,dryRun:false}),
    /staff_custody_approval_replayed/);
  const custody=await admin.query(`SELECT count(*)::integer AS n FROM
    sabora.staff_invitation_custody_candidate WHERE job_id=$1`,[jobId]);
  assert.equal(custody.rows[0].n,0);
  const outbox=await admin.query(`SELECT count(*)::integer AS n FROM
    sabora.staff_invitation_outbox WHERE id=$1`,[jobId]);
  assert.equal(outbox.rows[0].n,1);
  authority.close();
});

test('PG17 + Fastify + Chromium: durable invitation, verified acceptance and passkey registration, activation, suspension and revocation', {timeout:180_000},async()=>{
 const overlay=await readFile(new URL('../../docs/security/sql-candidates/staff_invitation_directory_outbox_pg17.sql',import.meta.url),'utf8');
 await admin.query(overlay);
 const role='sabora_ci_directory_durable',dispatchRole='sabora_ci_directory_dispatch';
 const directoryRole='sabora_ci_durable_directory_read',staffRole='sabora_ci_durable_staff_read',ownershipRole='sabora_ci_durable_ownership';
 const password='sabora_ci_directory_durable_ephemeral';
 for(const login of [role,dispatchRole,STAFF_ENROLLMENT_LOGIN,directoryRole,staffRole,ownershipRole]){
  await admin.query(`CREATE ROLE ${login} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'; GRANT USAGE ON SCHEMA sabora TO ${login}`);
 }
 await admin.query(`GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_outbox_candidate(
 text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text) TO ${role};
 GRANT EXECUTE ON FUNCTION sabora.store_staff_invitation_custody_restricted_candidate(uuid,uuid,integer,text,text,text,text,text) TO ${role};
 GRANT EXECUTE ON FUNCTION sabora.resolve_staff_admin_subject_candidate(text,uuid,uuid,text,text,bigint,bigint,text) TO ${role};
 GRANT EXECUTE ON FUNCTION sabora.read_staff_invitation_directory_dispatch_candidate(uuid,uuid) TO ${dispatchRole};
 GRANT EXECUTE ON FUNCTION sabora.read_staff_directory_authorized_candidate(text,text,uuid,text,text,uuid,text,integer,integer,bigint,bigint,text) TO ${directoryRole};
 GRANT SELECT(user_id,role,state) ON sabora.staff_members TO ${staffRole};
 CREATE POLICY ci_durable_staff_membership ON sabora.staff_members FOR SELECT TO ${staffRole} USING(true);
 GRANT ${OWNERSHIP_ROLE} TO ${ownershipRole} WITH SET TRUE,INHERIT FALSE;
 GRANT EXECUTE ON FUNCTION sabora.accept_staff_invitation_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,text) TO ${STAFF_ENROLLMENT_LOGIN};
 GRANT EXECUTE ON FUNCTION sabora.check_staff_registration_candidate(text,uuid,uuid,uuid,text,bigint,text),
 sabora.register_staff_passkey_verified_candidate(text,uuid,uuid,text,text,bigint,bigint,text,text,uuid,uuid,uuid,text) TO ${STAFF_ENROLLMENT_LOGIN}`);
 const writer=new Pool({connectionString:connectionString({role,value:password}),max:4});
 const deliveryPool=new Pool({connectionString:connectionString({role:dispatchRole,value:password})});
 const enrollmentPool=new Pool({connectionString:connectionString({role:STAFF_ENROLLMENT_LOGIN,value:password})});
 const directoryPool=new Pool({connectionString:connectionString({role:directoryRole,value:password})});
 const staffPool=new Pool({connectionString:connectionString({role:staffRole,value:password})});
 const ownershipPool=new Pool({connectionString:connectionString({role:ownershipRole,value:password})});
 const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');
 const http=Fastify({logger:false});
 let preview,browser;
 try{
 const key=randomBytes(32),keyId='directory_durable_custody_001',keyring={
  active:()=>({keyId,key}),resolveKey:id=>id===keyId?key:null};
 const issue=createStaffLifecycleDirectoryCapabilityIssuer({keyId:lifecycleKeyId,secret:lifecycleSecret,databaseRole:role});
 const emailHashSecret=randomBytes(32),hashInviteeEmail=createStaffInviteeEmailHasher({secret:emailHashSecret});
 const durable=createDurableStaffLifecycleRepositoryCandidate({keyring});
 const verified={verifiedIdentity:{userId:ownerId},verifiedStaff:{userId:ownerId,role:'admin'}};
 const config={withTransaction:createPostgresTransaction({pool:writer}),repository:durable,
  issueCapability:issue,issueInvitationToken:()=>randomBytes(32).toString('base64url'),
  hashInviteeEmail:digest,verifyCredentialRegistration:async()=>{throw Error('fixture_registration_unused');},
  uuid:()=>uuid('d')};
 // Use the real protected-route hook with an isolated Auth provider which
 // cryptographically verifies the management browser's virtual assertion.
 const readerId=randomUUID(),invitedUser=randomUUID(),otherUser=randomUUID(),sessionId=randomUUID();
 await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES ($1,'admin','active')",[readerId]);
 const configAdmin={pool:writer,role,keyId:lifecycleKeyId,secret:lifecycleSecret,emailHashSecret,keyring};
 const durableAdmin=await createVerifiedDurableStaffAdminCandidate(configAdmin);
 await admin.query('GRANT EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text) TO '+role);
 try{
  await assert.rejects(durableAdmin.readiness(),/staff_durable_admin_sql_identity_rejected/);
  await assert.rejects(createVerifiedDurableStaffAdminCandidate(configAdmin),/staff_durable_admin_sql_identity_rejected/);
 }finally{
  await admin.query('REVOKE EXECUTE ON FUNCTION sabora.transition_staff_lifecycle_with_directory_candidate(text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,text,text,text,text) FROM '+role);
 }
 await durableAdmin.readiness();
 // Register all routes before the first inject/listen. The enrollment
 // fixture is populated only after the actual invitation is dispatched.
 const origin='https://localhost:4188';
 let verifiedEnrollment,exchangeFixture;
 registerStaffEnrollmentHttpCandidate(http,{origin,secret:randomBytes(32),
  enrollment:{accept:input=>verifiedEnrollment.accept(input),
   registrationOptions:input=>verifiedEnrollment.registrationOptions(input),
   register:input=>verifiedEnrollment.register(input)},
  exchangeInvitation:input=>exchangeFixture(input)});
 const staffIssuer='https://durable-staff-ci.test/auth/v1';
 const auth=createStaffPasskeyBrowserFixture({origin,issuer:staffIssuer,kid:lifecycleKeyId,userIds:[ownerId,readerId,invitedUser]});
 const passkey=createStaffPasskeySession({origin,issuer:staffIssuer,secret:randomBytes(32),provider:auth.provider,getTrustedKeys:auth.getTrustedKeys});
 const forRoles=createStaffProtectedHooksFromPool({pool:staffPool,issuer:staffIssuer,getTrustedKeys:auth.getTrustedKeys,authenticate:passkey.authenticate});
 const directory=await createVerifiedStaffDirectoryFromPool({pool:directoryPool,role:directoryRole,
  issueCapability:createStaffDirectoryCapabilityIssuer({keyId:lifecycleKeyId,secret:lifecycleSecret,databaseRole:directoryRole})});
 await admin.query("INSERT INTO sabora.order_operation_signing_keys(key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')",['durable_staff_ownership_ci',lifecycleSecret]);
 await assertOwnershipRuntimeIdentity({pool:ownershipPool,expectedLogin:ownershipRole});
 const ownership=createOwnershipGovernanceRepository({
  withTransaction:createRoleScopedPostgresTransaction({pool:ownershipPool,role:OWNERSHIP_ROLE,allowedSql:new Set([OWNERSHIP_SQL])}),
  issueCapability:createOwnershipCapabilityIssuer({keyId:'durable_staff_ownership_ci',secret:lifecycleSecret,databaseRole:ownershipRole})});
 registerStaffDirectoryHttpCandidate(http,{forRoles,directory});
 registerOwnershipGovernanceHttp(http,{forRoles,repository:ownership});
 durableAdmin.register(http,{forRoles});
 passkey.register(http,{forRoles,features:{tableChange:false,waiterCalls:false,management:false,
  ownership:true,staffDirectory:true,staffLifecycle:true}});
 let manager,nonOwner,ownerHeaders,readerHeaders;
 const adminPost=(payload,actor=ownerId)=>http.inject({method:'POST',url:'/api/v1/staff/lifecycle',
  headers:actor===ownerId?ownerHeaders:readerHeaders,payload});
 async function loginAs(userId){
  const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  const page=await context.newPage();
  await page.goto(origin+'/#equipo');
  await auth.registerDevice(context,page,userId);
  await page.getByRole('button',{name:'Entrar con passkey'}).click();
  await page.getByRole('button',{name:'Cerrar sesión'}).waitFor();
  const session=await page.evaluate(async()=>fetch('/api/v1/staff/auth/session').then(r=>r.json()));
  const cookies=await context.cookies(origin);
  return {page,headers:{host:new URL(origin).host,origin,cookie:cookies.map(c=>c.name+'='+c.value).join('; '),
   'x-sabora-staff-session':session.sessionId}};
 }
 async function selectMember(page){
  await page.getByPlaceholder('Nombre, correo o código').fill('durable-directory@example.invalid');
  await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await page.getByRole('button',{name:/Equipo Durable/}).click();
  await page.getByRole('heading',{name:'Equipo Durable',exact:true}).waitFor();
 }
 const actionResponse=page=>page.waitForResponse(r=>r.url().endsWith('/api/v1/staff/lifecycle')&&r.request().method()==='POST');
 const request={action:'invite',email:'durable-directory@example.invalid',givenName:'Equipo',familyName:'Durable',
  requestedRole:'waiter',correlationId:'directory_durable_001'};
  const apiOrigin=await http.listen({host:'127.0.0.1',port:0});
  preview=await startPublishedManagementPwa({apiOrigin,port:4188,tls:true});
  const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  browser=await chromium.launch({headless:true});
  const owner=await loginAs(ownerId),reader=await loginAs(readerId);
  manager=owner.page;ownerHeaders=owner.headers;nonOwner=reader.page;readerHeaders=reader.headers;
  const deniedId=uuid('d'),token=randomBytes(32).toString('base64url');
  const capability=issue({actorId:ownerId,action:'invite',enrollmentId:deniedId,subjectUserId:null,
   requestedRole:'waiter',inviteeEmailHashHex:digest('missing-envelope@example.invalid'),
   inviteTokenHashHex:digest(token),credentialEvidenceHashHex:null,reason:null,
   givenName:'Prueba',familyName:'Rollback',inviteeEmail:'missing-envelope@example.invalid',
   correlationId:'directory_missing_custody_001'});
  await assert.rejects(createStaffLifecycleRepository().transition(
    (_sql,args)=>writer.query(DIRECTORY_OUTBOX_SQL,args),capability),
    e=>e.code==='23514'&&/staff_invitation_custody_required/.test(e.message));
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_enrollments WHERE id=$1',[deniedId])).rows[0].n,0);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_lifecycle_audit WHERE enrollment_id=$1',[deniedId])).rows[0].n,0);
  const bad=createStaffLifecycleCoordinator({...config,repository:createDurableStaffLifecycleRepositoryCandidate({
    keyring:{active:()=>{throw Error('fixture_key_unavailable');}}})});
  await assert.rejects(bad.transition(verified,request),/fixture_key_unavailable/);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_directory_contacts WHERE email=$1',[request.email])).rows[0].n,0);
  assert.equal((await adminPost(request,readerId)).statusCode,403);
  const anonymous=await http.inject({method:'POST',url:'/api/v1/staff/lifecycle',
   headers:{host:new URL(origin).host,origin},payload:request});
  assert.ok([401,403].includes(anonymous.statusCode));
  assert.equal((await adminPost({...request,actorUserId:ownerId})).statusCode,400);
  await manager.getByLabel('Nombre',{exact:true}).fill(request.givenName);
  await manager.getByLabel('Apellidos',{exact:true}).fill(request.familyName);
  await manager.getByLabel('Correo de invitación',{exact:true}).fill(request.email);
  const createResponse=actionResponse(manager);
  await manager.getByRole('button',{name:'Invitar y reservar código'}).click();
  const created=await createResponse;
  assert.equal(created.status(),201,await created.text());
  const initial=await created.json(),id=initial.enrollmentId;
  assert.equal(initial.repeated,false);
  await manager.getByText('Invitación en cola. Entrega no confirmada.',{exact:true}).waitFor();
  const replayRequest=created.request().postDataJSON();
  const responses=await Promise.all([adminPost(replayRequest),adminPost(replayRequest)]);
  assert.deepEqual(responses.map(r=>r.statusCode),[200,200]);
  assert.ok(responses.every(r=>r.json().repeated&&r.json().enrollmentId===id));
  await selectMember(nonOwner);
  assert.equal(await nonOwner.getByRole('button',{name:'Reenviar invitación'}).count(),0);
  assert.equal(await nonOwner.getByRole('button',{name:'Revocar acceso'}).count(),0);
  for(const response of responses){
   assert.equal(response.headers['cache-control'],'no-store');
   assert.deepEqual(Object.keys(response.json()).sort(),['enrollmentId','state','repeated','givenName','familyName',
    'employeeCode','operationalDisplayId','currentState'].sort());
  }
  const rows=(await admin.query(`SELECT o.id,c.email,e.requested_role,o.state,
   (s.job_id IS NOT NULL) AS has_custody FROM sabora.staff_invitation_outbox o
   JOIN sabora.staff_enrollments e ON e.id=o.enrollment_id
   JOIN sabora.staff_directory_contacts c ON c.enrollment_id=e.id
   LEFT JOIN sabora.staff_invitation_custody_candidate s ON s.job_id=o.id
   WHERE e.id=$1`,[id])).rows;
  assert.equal(rows.length,1);
  assert.deepEqual({...rows[0],id:undefined},{id:undefined,email:request.email,requested_role:'waiter',state:'pending',has_custody:true});
  const oldJob=rows[0].id;
  await assert.rejects(writer.query('SELECT * FROM sabora.staff_invitation_custody_candidate'),e=>e.code==='42501');
  await assert.rejects(deliveryPool.query('SELECT * FROM sabora.staff_directory_contacts'),e=>e.code==='42501');
  const oldClaim=await claimCurrentStaffInvitation({withTransaction,repository,jobId:oldJob});
  await selectMember(manager);
  const resendResponse=actionResponse(manager);
  await manager.getByRole('button',{name:'Reenviar invitación'}).click();
  const resend=await resendResponse;
  assert.equal(resend.status(),200,await resend.text());
  assert.deepEqual(await resend.json(),{enrollmentId:id,state:'invited',repeated:false});
  await manager.getByText('Reenvío en cola. Entrega no confirmada.',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT state FROM sabora.staff_invitation_outbox WHERE id=$1',[oldJob])).rows[0].state,'cancelled');
  assert.equal((await authorizeStaffInvitationDispatch({withTransaction,repository,jobId:oldJob,fence:oldClaim.fence})).authorized,false);
  const jobId=(await admin.query('SELECT id FROM sabora.staff_invitation_outbox WHERE enrollment_id=$1 AND invite_version=2',[id])).rows[0].id;
  const claim=await claimCurrentStaffInvitation({withTransaction,repository,jobId});
  const providerId='dbec97f1-e3ad-464c-aacf-2c4cddd9b272';
  const authProof=randomBytes(32).toString('base64url');
  let receivedToken,deliveredUrl;
  const readDelivery=createStaffDirectoryDispatchReaderCandidate({query:(...args)=>deliveryPool.query(...args),keyring,
   // Explicit test link, not an Auth provider implementation.
   createEnrollmentUrl:async({token,enrollmentId,recipient})=>{
    assert.equal(recipient,request.email);assert.equal(enrollmentId,id);
    receivedToken=token;
    return origin+'/#enrolamiento?'+new URLSearchParams({enrollmentId,token,proof:authProof});
   }});
  assert.deepEqual(await readDelivery({jobId,fence:claim.fence}),{authorized:false});
  let sends=0;
  const send=createStaffInvitationResendSender({managementOrigin:origin,from:'sab@example.test',
   apiKey:'re_only_isolated_fixture',fetchImpl:async(url,options)=>{
    sends++;assert.equal(url,'https://api.resend.com/emails');
    const body=JSON.parse(options.body);
    assert.equal(body.to[0],request.email);
    deliveredUrl=body.text.split('\n\n').at(-1);
    assert.equal(options.headers['Idempotency-Key'],'sabora-staff-invitation/'+jobId);
    return Response.json({id:providerId});
   }});
  const dispatch={withTransaction,repository,jobId,fence:claim.fence,readDelivery,send,
   recordOutcome:input=>recordStaffInvitationDeliveryOutcome({withTransaction,repository,...input})};
  assert.deepEqual(await dispatchStaffInvitation(dispatch),{recorded:true,state:'delivered',retryable:false,ambiguous:false});
  assert.equal((await dispatchStaffInvitation(dispatch)).authorized,false);
  assert.equal(sends,1);
  const result=(await admin.query('SELECT provider_message_id,provider_outcome,state FROM sabora.staff_invitation_outbox WHERE id=$1',[jobId])).rows[0];
  assert.deepEqual(result,{provider_message_id:providerId,provider_outcome:'accepted',state:'delivered'});
  assert.equal((await admin.query('SELECT state FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0].state,'invited');

  // Extend the very same delivered invitation into verified acceptance.
  // Provider fixture supplies a real signed JWT and a live user projection;
  // no hosted Auth exchange or actual passkey ceremony is claimed.
  const authIssuer='https://enrollment-ci.example.test/auth/v1';
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'enrollment-ci'};
  const premature=await adminPost({action:'activate',enrollmentId:id,subjectUserId:null,
   correlationId:'directory_premature_activate_001'});
  assert.ok(premature.statusCode>=400);
  assert.equal((await admin.query('SELECT state FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0].state,'invited');
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members WHERE user_id=$1',[invitedUser])).rows[0].n,0);
  const jwt=(user,anonymous=false,expires=300)=>{
   const now=Math.floor(Date.now()/1000);
   const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
   const data=enc({alg:'RS256',typ:'JWT',kid:jwk.kid})+'.'+enc({
    iss:authIssuer,aud:'authenticated',sub:user,role:'authenticated',iat:now,
    exp:now+expires,is_anonymous:anonymous,session_id:sessionId,
    amr:[{method:'otp',timestamp:now}]});
   return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
  };
  const acceptedJwt=jwt(invitedUser),wrongJwt=jwt(otherUser);
  const users=new Map([[acceptedJwt,{id:invitedUser,email:request.email,is_anonymous:false,
   email_confirmed_at:new Date(Date.now()-1000).toISOString()}],
   [wrongJwt,{id:otherUser,email:'different-recipient@example.invalid',is_anonymous:false,
   email_confirmed_at:new Date(Date.now()-1000).toISOString()}]]);
  const registrationChallenge=randomUUID(),registrationNonce=randomBytes(32).toString('base64url'),
   registeredCredential=randomUUID();let providerRegistrations=0;
  const accept=createStaffVerifiedEnrollmentCandidate({pool:enrollmentPool,issuer:authIssuer,managementOrigin:origin,
   getTrustedKeys:async()=>[jwk],provider:{user:async token=>users.get(token),
    registrationOptions:async token=>{
     assert.equal(token,acceptedJwt);
     return {challenge_id:registrationChallenge,expires_at:Math.floor(Date.now()/1000)+60,
      options:{rp:{id:new URL(origin).hostname,name:'Sabora CI'},challenge:registrationNonce,
       user:{id:Buffer.from(invitedUser).toString('base64url'),name:request.email,displayName:'Equipo Durable'},
       pubKeyCredParams:[{type:'public-key',alg:-7}],timeout:60000,attestation:'none',
       authenticatorSelection:{userVerification:'required',residentKey:'required'}}};
    },
    verifyRegistration:async(token,challenge,credential)=>{
     assert.equal(token,acceptedJwt);assert.equal(challenge,registrationChallenge);
     assert.equal(credential.type,'public-key');
     const client=JSON.parse(Buffer.from(credential.response.clientDataJSON,'base64url').toString('utf8'));
     assert.equal(client.type,'webauthn.create');assert.equal(client.origin,origin);assert.equal(client.challenge,registrationNonce);
     assert.ok(Buffer.from(credential.response.attestationObject,'base64url').length>40);
     providerRegistrations++;
     return {id:registeredCredential};
    }},
   keyId:lifecycleKeyId,secret:lifecycleSecret,hashInviteeEmail});
  let input={accessToken:acceptedJwt,enrollmentId:id,inviteToken:receivedToken,
   correlationId:'directory_verified_accept_001'};
  await assert.rejects(accept.accept({...input,accessToken:wrongJwt}),e=>e.code==='42501');
  const correctUser=users.get(acceptedJwt);
  users.set(acceptedJwt,{...correctUser,email_confirmed_at:null});
  await assert.rejects(accept.accept(input),e=>e.code==='42501');
  users.set(acceptedJwt,{...correctUser,id:otherUser});
  await assert.rejects(accept.accept(input),e=>e.code==='42501');
  users.set(acceptedJwt,correctUser);
  await assert.rejects(accept.accept({...input,accessToken:jwt(invitedUser,true)}),e=>e.code==='42501');
  await assert.rejects(accept.accept({...input,accessToken:jwt(invitedUser,false,-1)}),e=>e.code==='42501');
  await assert.rejects(accept.accept({...input,inviteToken:randomBytes(32).toString('base64url')}),e=>e.code==='42501');
  const forged=issue({actorId:invitedUser,action:'accept',enrollmentId:id,subjectUserId:invitedUser,
   requestedRole:null,inviteeEmailHashHex:null,inviteTokenHashHex:digest(receivedToken),
   credentialEvidenceHashHex:null,reason:null,givenName:null,familyName:null,inviteeEmail:null,
   correlationId:'directory_accept_bypass_001'});
  await assert.rejects(createStaffLifecycleRepository().transition(
   (_sql,args)=>writer.query(DIRECTORY_OUTBOX_SQL,args),forged),e=>e.code==='42501');
  await assert.rejects(createStaffLifecycleRepository().transition(
   (_sql,args)=>enrollmentPool.query(DIRECTORY_OUTBOX_SQL,args),forged),e=>e.code==='42501');
  await assert.rejects(enrollmentPool.query('SELECT * FROM sabora.staff_enrollments'),e=>e.code==='42501');
  await assert.rejects(enrollmentPool.query(VERIFIED_ACCEPT_SQL,[lifecycleKeyId,invitedUser,id,
   digest(receivedToken),'directory_forged_accept_001',Date.now(),Date.now()+10000,'0'.repeat(64),
   digest(request.email),sessionId,'0'.repeat(64)]),e=>e.code==='42501');
  assert.equal((await admin.query('SELECT state FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0].state,'invited');
  await assert.rejects(accept.registrationOptions({accessToken:acceptedJwt,enrollmentId:id}),e=>e.code==='42501');
  let exchanges=0;
  verifiedEnrollment=accept;
  exchangeFixture=async supplied=>{
    exchanges++;assert.deepEqual(supplied,{enrollmentId:id,authProof});
    return {accessToken:acceptedJwt};
  };
  const baseHeaders={host:new URL(origin).host,origin};
  const post=(action,payload,headers=baseHeaders)=>http.inject({method:'POST',url:'/api/v1/staff/enrollment/'+action,headers,payload});
  const acceptBody={enrollmentId:id,inviteToken:receivedToken,authProof,correlationId:input.correlationId};
  assert.equal((await post('accept',acceptBody,{...baseHeaders,origin:'https://other.example.test'})).statusCode,403);
  assert.equal((await post('accept',{...acceptBody,accessToken:acceptedJwt})).statusCode,400);
  assert.equal(exchanges,0);
  assert.equal((await post('options',{})).statusCode,403);
  const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
  const page=await context.newPage();
  await page.goto(deliveredUrl);
  await page.getByRole('heading',{name:'Alta de personal en Sabora Gestión'}).waitFor();
  assert.equal(new URL(page.url()).hash,'#enrolamiento');
  assert.ok(!page.url().includes(receivedToken));
  const acceptResponse=page.waitForResponse(response=>response.url().endsWith('/api/v1/staff/enrollment/accept'));
  await page.getByRole('button',{name:'Aceptar invitación'}).click();
  const accepted=await acceptResponse;
  assert.equal(accepted.status(),200,await accepted.text());
  assert.deepEqual(await accepted.json(),{enrollmentId:id,state:'accepted'});
  assert.equal(await accepted.headerValue('cache-control'),'no-store');
  input={...input,correlationId:accepted.request().postDataJSON().correlationId};
  await page.getByRole('button',{name:'Registrar passkey'}).waitFor();
  const header=await accepted.headerValue('set-cookie');
  assert.match(header,/^__Host-sabora-enrollment=/);
  assert.match(header,/Secure; HttpOnly; SameSite=Strict/);
  assert.ok(!header.includes(acceptedJwt));
  assert.ok(!(await accepted.text()).includes(receivedToken));
  assert.equal(exchanges,1);
  const sessionCookie=header.split(';')[0],enrollmentHeaders={...baseHeaders,cookie:sessionCookie};
  const tamperedCookie=sessionCookie.slice(0,-2)+(sessionCookie.at(-2)==='A'?'B':'A')+sessionCookie.at(-1);
  assert.equal((await post('options',{}, {...baseHeaders,cookie:tamperedCookie})).statusCode,403);
  assert.deepEqual(await accept.accept(input),{enrollmentId:id,state:'accepted',repeated:true});
  const acceptedRow=(await admin.query('SELECT auth_user_id,state FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0];
  assert.deepEqual(acceptedRow,{auth_user_id:invitedUser,state:'accepted'});
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members WHERE user_id=$1',[invitedUser])).rows[0].n,0);
  const optionsResponse=await post('options',{},enrollmentHeaders);
  assert.equal(optionsResponse.statusCode,200,optionsResponse.body);
  const registration=optionsResponse.json();
  const rawId=randomBytes(32).toString('base64url');
  const encodeClient=challenge=>Buffer.from(JSON.stringify({type:'webauthn.create',origin,challenge})).toString('base64url');
  // Explicit mock attestation: the external verification fixture does NOT
  // establish real cryptographic WebAuthn verification.
  const credential={type:'public-key',id:rawId,rawId,response:{clientDataJSON:encodeClient(registrationNonce),
   attestationObject:Buffer.from('provider-fixture-only').toString('base64url')}};
  const regInput={accessToken:acceptedJwt,enrollmentId:id,ticket:registration.ticket,credential,
   correlationId:'directory_verified_register_001'};
  await assert.rejects(accept.register({...regInput,ticket:registration.ticket.slice(0,-1)+(registration.ticket.endsWith('0')?'1':'0')}),e=>e.code==='42501');
  await assert.rejects(accept.register({...regInput,credential:{...credential,
   response:{...credential.response,clientDataJSON:encodeClient('wrong')}}}),e=>e.code==='42501');
  assert.equal(providerRegistrations,0);
  const cdp=await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
   protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,
   isUserVerified:true,automaticPresenceSimulation:true}});
  const registerResponse=page.waitForResponse(response=>response.url().endsWith('/api/v1/staff/enrollment/register'));
  await page.getByRole('button',{name:'Registrar passkey'}).click();
  const registrationResponse=await registerResponse;
  assert.equal(registrationResponse.status(),200,await registrationResponse.text());
  assert.deepEqual(await registrationResponse.json(),{enrollmentId:id,state:'registered'});
  assert.match(await registrationResponse.headerValue('set-cookie'),/Max-Age=0/);
  await page.getByText('Passkey registrada. Tu cuenta está pendiente de activación administrativa.',{exact:true}).waitFor();
  const {credentials}=await cdp.send('WebAuthn.getCredentials',{authenticatorId});
  assert.equal(credentials.length,1);
  assert.equal((await context.cookies(origin)).some(cookie=>cookie.name==='__Host-sabora-enrollment'),false);
  assert.equal((await post('options',{},enrollmentHeaders)).statusCode,403);
  assert.equal(providerRegistrations,1);
  const receipt=(await admin.query('SELECT auth_user_id,auth_session_id,challenge_id,provider_credential_id FROM sabora.staff_registration_receipts_candidate WHERE enrollment_id=$1',[id])).rows[0];
  assert.deepEqual(receipt,{auth_user_id:invitedUser,auth_session_id:sessionId,
   challenge_id:registrationChallenge,provider_credential_id:registeredCredential});
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.staff_members WHERE user_id=$1',[invitedUser])).rows[0].n,0);
  await assert.rejects(accept.register(regInput),e=>e.code==='42501');
  assert.equal(providerRegistrations,1);
  const activate={action:'activate',enrollmentId:id,subjectUserId:null,correlationId:'directory_durable_activate_001'};
  assert.equal((await adminPost(activate,readerId)).statusCode,403);
  assert.equal((await adminPost({...activate,subjectUserId:invitedUser})).statusCode,400);
  assert.ok((await adminPost({...activate,subjectUserId:otherUser,correlationId:'directory_wrong_subject_001'})).statusCode>=400);
  assert.equal((await admin.query('SELECT state FROM sabora.staff_enrollments WHERE id=$1',[id])).rows[0].state,'registered');
  await assert.rejects(writer.query(STAFF_ADMIN_SUBJECT_SQL,[lifecycleKeyId,ownerId,id,'activate','directory_unsigned_subject',Date.now(),Date.now()+10000,null]),e=>e.code==='42501');
  for(const [key,correlation,signature] of [
   ['bad key', 'directory_bad_subject_key', '0'.repeat(64)],
   [lifecycleKeyId,'bad correlation','0'.repeat(64)],
   [lifecycleKeyId,'directory_bad_subject_signature','f'.repeat(63)]
  ])await assert.rejects(writer.query(STAFF_ADMIN_SUBJECT_SQL,[key,ownerId,id,'activate',correlation,Date.now(),Date.now()+10000,signature]),e=>e.code==='42501');
  await selectMember(manager);
  const activationResponse=actionResponse(manager);
  await manager.getByRole('button',{name:'Activar acceso'}).click();
  const activation=await activationResponse;
  assert.equal(activation.status(),200,await activation.text());
  assert.deepEqual(await activation.json(),{enrollmentId:id,state:'active',repeated:false});
  const activatedRequest=activation.request().postDataJSON();
  assert.equal(activatedRequest.subjectUserId,null);
  assert.equal((await adminPost(activatedRequest)).json().repeated,true);
  await manager.getByText('Acceso activado.',{exact:true}).waitFor();
  const staff=await loginAs(invitedUser);
  assert.equal(await staff.page.evaluate(async()=>(await fetch('/api/v1/staff/auth/session')).status),200);
  assert.equal((await admin.query('SELECT state FROM sabora.staff_members WHERE user_id=$1',[invitedUser])).rows[0].state,'active');
  const suspend={action:'suspend',enrollmentId:id,subjectUserId:null,reason:'Suspensión de prueba',
   correlationId:'directory_durable_suspend_001'};
  assert.equal((await adminPost(suspend,readerId)).statusCode,403);
  await selectMember(manager);
  await manager.getByLabel('Motivo de suspensión').fill(suspend.reason);
  const suspensionResponse=actionResponse(manager);
  await manager.getByRole('button',{name:'Suspender acceso'}).click();
  const suspension=await suspensionResponse;
  assert.equal(suspension.status(),200,await suspension.text());
  assert.deepEqual(await suspension.json(),{enrollmentId:id,state:'suspended',repeated:false});
  await manager.getByText('Acceso suspendido.',{exact:true}).waitFor();
  assert.equal(await staff.page.evaluate(async()=>(await fetch('/api/v1/staff/auth/session')).status),403);
  assert.equal((await admin.query('SELECT state FROM sabora.staff_members WHERE user_id=$1',[invitedUser])).rows[0].state,'suspended');
  await selectMember(manager);
  await manager.getByLabel('Motivo de revocación').fill('Revocación de prueba');
  const revocationResponse=actionResponse(manager);
  await manager.getByRole('button',{name:'Revocar acceso'}).click();
  const revocation=await revocationResponse;
  assert.equal(revocation.status(),200,await revocation.text());
  assert.deepEqual(await revocation.json(),{enrollmentId:id,state:'revoked',repeated:false});
  await manager.getByText('Acceso revocado.',{exact:true}).waitFor();
  assert.equal((await admin.query('SELECT state FROM sabora.staff_members WHERE user_id=$1',[invitedUser])).rows[0].state,'revoked');
  assert.notEqual((await adminPost(activatedRequest)).statusCode,200);
  assert.equal((await readDelivery({jobId,fence:claim.fence})).authorized,false);
  await assert.rejects(accept.accept(input),e=>e.code==='42501');
 }finally{await browser?.close();await preview?.close();await Promise.all([writer.end(),deliveryPool.end(),enrollmentPool.end(),directoryPool.end(),staffPool.end(),ownershipPool.end(),http.close()]);}
});
