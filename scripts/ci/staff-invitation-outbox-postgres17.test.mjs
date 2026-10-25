import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createStaffLifecycleCapabilityIssuer} from '../../apps/api/src/staff-lifecycle-capability.mjs';
import {claimCurrentStaffInvitation} from '../../apps/api/src/staff-invitation-claim-candidate.mjs';
import {authorizeStaffInvitationDispatch} from '../../apps/api/src/staff-invitation-dispatch-guard.mjs';
import {recordStaffInvitationDeliveryOutcome} from '../../apps/api/src/staff-invitation-delivery-outcome-candidate.mjs';
import {reconcileStaffInvitationJob} from '../../apps/api/src/staff-invitation-reconciliation-candidate.mjs';
import {createStaffInvitationOutboxRepository} from '../../apps/api/src/staff-invitation-outbox-repository-candidate.mjs';

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
const denied = new Pool({connectionString: connectionString(deniedCredentials), max: 1});
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

test.before(async () => {
  const schema = await readFile(new URL(
    '../../docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql',
    import.meta.url,
  ), 'utf8');
  await admin.query(schema);
  await admin.query(`CREATE ROLE ${deniedCredentials.role} LOGIN
    PASSWORD '${deniedCredentials.value}' NOSUPERUSER NOBYPASSRLS NOINHERIT
    NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await admin.query(`GRANT USAGE ON SCHEMA sabora TO ${deniedCredentials.role}`);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
    VALUES ($1,'admin','active')`, [ownerId]);
  await admin.query(`INSERT INTO sabora.staff_lifecycle_signing_keys(
      key_id,hmac_key,not_before,expires_at
    ) VALUES ($1,decode($2,'hex'),clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '1 hour')`,
  [lifecycleKeyId, lifecycleSecret.toString('hex')]);
});

test.after(async () => {
  await Promise.all([
    denied.end(), workerB.end(), revoker.end(), resender.end(), admin.end(),
  ]);
});

test('PG17 candidate is isolated by FORCE RLS and zero runtime grants', async () => {
  const version = await admin.query('SHOW server_version');
  assert.match(version.rows[0].server_version, /^17\./);
  const boundary = await admin.query(`SELECT
      class.relrowsecurity AS rls_enabled,
      class.relforcerowsecurity AS rls_forced,
      (SELECT count(*)::integer FROM pg_catalog.pg_policies
        WHERE schemaname='sabora' AND tablename='staff_invitation_outbox') AS policies,
      has_table_privilege($1,'sabora.staff_invitation_outbox','SELECT') AS can_select,
      has_table_privilege($1,'sabora.staff_invitation_outbox','INSERT') AS can_insert,
      has_table_privilege($1,'sabora.staff_invitation_outbox','UPDATE') AS can_update,
      has_table_privilege($1,'sabora.staff_invitation_outbox','DELETE') AS can_delete
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='sabora' AND class.relname='staff_invitation_outbox'`,
  [deniedCredentials.role]);
  assert.deepEqual(boundary.rows, [{
    rls_enabled: true, rls_forced: true, policies: 0,
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
