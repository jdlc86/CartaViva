// Candidate-only adapter for the single PostgreSQL statement that joins the
// HMAC lifecycle wrapper and invitation outbox. It is not mounted at runtime.
import {createStaffLifecycleRepository} from './staff-lifecycle-repository.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

export const STAFF_INVITATION_ENQUEUE_SQL = `SELECT *
  FROM sabora.transition_staff_lifecycle_with_outbox_candidate(
    $1::text,$2::text,$3::uuid,$4::text,$5::uuid,
    $6::uuid,$7::text,$8::text,$9::text,$10::text,
    $11::text,$12::text,$13::bigint,$14::bigint,$15::text,$16::text,$17::text
  )`;

export function createStaffInvitationEnqueueCandidate({
  query,
  lifecycleRepository = createStaffLifecycleRepository({directory: false}),
} = {}) {
  if (typeof query !== 'function' ||
      typeof lifecycleRepository?.transition !== 'function') {
    throw Error('invalid_staff_enqueue_config');
  }

  return Object.freeze({
    async transitionAndEnqueue(capability) {
      if (!capability || !['invite', 'resend'].includes(capability.action) ||
          !UUID.test(capability.enrollmentId ?? '') ||
          !HASH.test(capability.inviteTokenHashHex ?? '')) {
        throw Error('invalid_staff_enqueue_input');
      }

      let combinedRow = null;
      const transition = await lifecycleRepository.transition(async (_sql, parameters) => {
        const result = await query(STAFF_INVITATION_ENQUEUE_SQL, parameters);
        if (Array.isArray(result?.rows) && result.rows.length === 1) {
          combinedRow = result.rows[0];
        }
        return result;
      }, capability);

      const expectedEnqueued = !transition.repeated;
      if (!combinedRow || !UUID.test(combinedRow.outbox_job_id ?? '') ||
          combinedRow.outbox_enqueued !== expectedEnqueued ||
          !Number.isSafeInteger(combinedRow.outbox_cancelled_count) ||
          combinedRow.outbox_cancelled_count < 0 ||
          (capability.action === 'invite' && combinedRow.outbox_cancelled_count !== 0) ||
          (transition.repeated && combinedRow.outbox_cancelled_count !== 0)) {
        throw Error('invalid_staff_enqueue_sql_result');
      }

      return Object.freeze({
        transition,
        jobId: combinedRow.outbox_job_id,
        enqueued: combinedRow.outbox_enqueued,
        repeated: transition.repeated,
        cancelledCount: combinedRow.outbox_cancelled_count,
      });
    },
  });
}
