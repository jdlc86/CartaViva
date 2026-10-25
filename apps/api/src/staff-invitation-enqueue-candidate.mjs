// Candidate-only transactional enqueue. Not connected to runtime routes or providers.
// Caller must use the SAME PostgreSQL transaction for lifecycle and outbox.
// This draft persists a token hash only: it cannot deliver an invitation.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

export const STAFF_INVITATION_ENQUEUE_SQL = `INSERT INTO sabora.staff_invitation_outbox
  (id, enrollment_id, invite_version, invite_token_hash)
  SELECT $1::uuid, e.id, e.invite_version, e.invite_token_hash
  FROM sabora.staff_enrollments e
  WHERE e.id = $2::uuid AND e.state = 'invited'
    AND e.invite_version = $3::integer
    AND encode(e.invite_token_hash, 'hex') = $4::text
  ON CONFLICT (enrollment_id, invite_version) DO NOTHING
  RETURNING id`;

export function createStaffInvitationEnqueueCandidate({withTransaction, lifecycleRepository, uuid} = {}) {
  if (typeof withTransaction !== 'function' ||
      typeof lifecycleRepository?.transition !== 'function' ||
      typeof uuid !== 'function') throw Error('invalid_staff_enqueue_config');

  return Object.freeze({
    async transitionAndEnqueue(capability) {
      if (!capability || !['invite', 'resend'].includes(capability.action) ||
          !UUID.test(capability.enrollmentId ?? '') ||
          !HASH.test(capability.inviteTokenHashHex ?? '')) {
        throw Error('invalid_staff_enqueue_input');
      }
      return withTransaction(async (query) => {
        if (typeof query !== 'function') throw Error('invalid_staff_enqueue_transaction');
        const transition = await lifecycleRepository.transition(query, capability);
        if (!transition || transition.enrollmentId?.toLowerCase() !== capability.enrollmentId.toLowerCase() ||
            !Number.isSafeInteger(transition.inviteVersion) || transition.inviteVersion < 1 ||
            transition.currentState !== 'invited' || typeof transition.repeated !== 'boolean') {
          throw Error('invalid_staff_enqueue_transition');
        }
        if (transition.repeated) return Object.freeze({transition, enqueued: false, repeated: true});
        const jobId = uuid();
        if (!UUID.test(jobId)) throw Error('invalid_staff_enqueue_job_id');
        const result = await query(STAFF_INVITATION_ENQUEUE_SQL, [
          jobId.toLowerCase(), transition.enrollmentId.toLowerCase(),
          transition.inviteVersion, capability.inviteTokenHashHex,
        ]);
        if (!Array.isArray(result?.rows) || result.rows.length !== 1 ||
            result.rows[0]?.id !== jobId.toLowerCase()) {
          // Failing closed rolls back the lifecycle transition as well.
          throw Error('staff_enqueue_atomicity_violation');
        }
        return Object.freeze({transition, enqueued: true, repeated: false});
      });
    },
  });
}
