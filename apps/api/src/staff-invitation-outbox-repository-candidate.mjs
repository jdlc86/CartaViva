// Candidate-only SQL adapter for a future isolated PostgreSQL 17 outbox.
// This module deliberately does not provision schema, grants or credentials.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATES = new Set(['invited', 'accepted', 'registered', 'active', 'suspended', 'revoked']);
const OWN = Object.prototype.hasOwnProperty;

function parseCandidate(jobId, rows) {
  if (!Array.isArray(rows) || rows.length > 1) {
    throw Error('invalid_staff_delivery_sql_result');
  }
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw Error('invalid_staff_delivery_sql_result');
  }
  // SQL driver results must be plain data, not accessor-backed objects.
  for (const field of ['job_id', 'enrollment_id', 'invite_version',
    'invite_token_hash_hex', 'current_invite_version',
    'current_invite_token_hash_hex', 'enrollment_state']) {
    const descriptor = Object.getOwnPropertyDescriptor(row, field);
    if (!OWN.call(row, field) || !descriptor || !OWN.call(descriptor, 'value')) {
      throw Error('invalid_staff_delivery_sql_result');
    }
  }
  if (!row || typeof row !== 'object' ||
      !UUID.test(row.enrollment_id) ||
      !Number.isSafeInteger(row.invite_version) || row.invite_version < 1 ||
      !Number.isSafeInteger(row.current_invite_version) ||
      row.current_invite_version < 1 ||
      !HASH.test(row.invite_token_hash_hex) ||
      !HASH.test(row.current_invite_token_hash_hex) ||
      !STATES.has(row.enrollment_state) ||
      typeof row.job_id !== 'string' ||
      !UUID.test(row.job_id) ||
      row.job_id.toLowerCase() !== jobId.toLowerCase()) {
    throw Error('invalid_staff_delivery_sql_result');
  }
  return Object.freeze({
    job: Object.freeze({
      enrollmentId: row.enrollment_id,
      inviteVersion: row.invite_version,
      inviteTokenHashHex: row.invite_token_hash_hex,
    }),
    enrollment: Object.freeze({
      id: row.enrollment_id,
      inviteVersion: row.current_invite_version,
      inviteTokenHashHex: row.current_invite_token_hash_hex,
      state: row.enrollment_state,
    }),
  });
}

export function createStaffInvitationOutboxRepository() {
  return Object.freeze({
    async lockDeliveryCandidate(query, jobId) {
      if (typeof query !== 'function' || !UUID.test(jobId)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      // Locks enrollment and outbox together in one transaction. A future
      // migration must grant SELECT/UPDATE solely to an isolated worker role.
      const result = await query({
        text: `SELECT o.id AS job_id, o.enrollment_id,
          o.invite_version, encode(o.invite_token_hash, 'hex') AS invite_token_hash_hex,
          e.invite_version AS current_invite_version,
          encode(e.invite_token_hash, 'hex') AS current_invite_token_hash_hex,
          e.state AS enrollment_state
          FROM sabora.staff_invitation_outbox o
          JOIN sabora.staff_enrollments e ON e.id = o.enrollment_id
          WHERE o.id = $1::uuid AND o.state = 'pending'
          FOR UPDATE OF o, e`,
        values: [jobId.toLowerCase()],
      });
      return parseCandidate(jobId, result?.rows);
    },
    async lockDispatchingDelivery(query, jobId, fence) {
      if (typeof query !== 'function' || !UUID.test(jobId) || !UUID.test(fence)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      const result = await query({
        text: `SELECT id FROM sabora.staff_invitation_outbox
          WHERE id = $1::uuid AND fence = $2::uuid AND state = 'dispatching'
          FOR UPDATE`,
        values: [jobId.toLowerCase(), fence.toLowerCase()],
      });
      if (!Array.isArray(result?.rows) || result.rows.length > 1) {
        throw Error('invalid_staff_delivery_sql_result');
      }
      if (result.rows.length === 1 && result.rows[0]?.id !== jobId.toLowerCase()) {
        throw Error('invalid_staff_delivery_sql_result');
      }
      return result.rows.length === 1;
    },
    async finishDispatchingDelivery(query, jobId, fence, nextState) {
      if (typeof query !== 'function' || !UUID.test(jobId) || !UUID.test(fence) ||
          !['delivered', 'failed'].includes(nextState)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      const result = await query({
        text: `UPDATE sabora.staff_invitation_outbox
          SET state = $3::text,
            delivered_at = CASE WHEN $3::text = 'delivered'
              THEN clock_timestamp() ELSE NULL END,
            updated_at = clock_timestamp()
          WHERE id = $1::uuid AND fence = $2::uuid AND state = 'dispatching'
          RETURNING id`,
        values: [jobId.toLowerCase(), fence.toLowerCase(), nextState],
      });
      if (!Array.isArray(result?.rows) || result.rows.length > 1 ||
          (result.rows.length === 1 &&
           result.rows[0]?.id !== jobId.toLowerCase())) {
        throw Error('invalid_staff_delivery_sql_result');
      }
      return Object.freeze({finished: result.rows.length === 1});
    },
    async lockReconciliationCandidate(query, jobId) {
      if (typeof query !== 'function' || !UUID.test(jobId)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      // Lock both rows in the same order as the claim and dispatch paths.
      // Never cancel 'dispatching': an external delivery might be in flight.
      const result = await query({
        text: `SELECT o.id AS job_id, o.enrollment_id,
          o.invite_version, encode(o.invite_token_hash, 'hex') AS invite_token_hash_hex,
          e.invite_version AS current_invite_version,
          encode(e.invite_token_hash, 'hex') AS current_invite_token_hash_hex,
          e.state AS enrollment_state
          FROM sabora.staff_invitation_outbox o
          JOIN sabora.staff_enrollments e ON e.id = o.enrollment_id
          WHERE o.id = $1::uuid AND o.state IN ('pending', 'claimed')
          FOR UPDATE OF o, e`,
        values: [jobId.toLowerCase()],
      });
      return parseCandidate(jobId, result?.rows);
    },
    async cancelStaleDelivery(query, jobId) {
      if (typeof query !== 'function' || !UUID.test(jobId)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      // Caller MUST have locked and checked the enrollment in the same
      // transaction. Never expose this mutation as a standalone endpoint.
      const result = await query({
        text: `UPDATE sabora.staff_invitation_outbox
          SET state = 'cancelled', updated_at = clock_timestamp()
          WHERE id = $1::uuid AND state IN ('pending', 'claimed')
          RETURNING id`,
        values: [jobId.toLowerCase()],
      });
      if (!Array.isArray(result?.rows) || result.rows.length > 1) {
        throw Error('invalid_staff_delivery_sql_result');
      }
      return Object.freeze({cancelled: result.rows.length === 1});
    },
    async lockClaimedDelivery(query, jobId, fence) {
      if (typeof query !== 'function' || !UUID.test(jobId) || !UUID.test(fence)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      const result = await query({
        text: `SELECT o.id AS job_id, o.enrollment_id,
          o.invite_version, encode(o.invite_token_hash, 'hex') AS invite_token_hash_hex,
          e.invite_version AS current_invite_version,
          encode(e.invite_token_hash, 'hex') AS current_invite_token_hash_hex,
          e.state AS enrollment_state
          FROM sabora.staff_invitation_outbox o
          JOIN sabora.staff_enrollments e ON e.id = o.enrollment_id
          WHERE o.id = $1::uuid AND o.fence = $2::uuid AND o.state = 'claimed'
          FOR UPDATE OF o, e`,
        values: [jobId.toLowerCase(), fence.toLowerCase()],
      });
      return parseCandidate(jobId, result?.rows);
    },
    async authorizeDispatch(query, jobId, fence) {
      if (typeof query !== 'function' || !UUID.test(jobId) || !UUID.test(fence)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      const result = await query({
        text: `UPDATE sabora.staff_invitation_outbox
          SET state = 'dispatching', dispatch_authorized_at = clock_timestamp(),
            updated_at = clock_timestamp()
          WHERE id = $1::uuid AND fence = $2::uuid AND state = 'claimed'
          RETURNING id`,
        values: [jobId.toLowerCase(), fence.toLowerCase()],
      });
      if (!Array.isArray(result?.rows) || result.rows.length > 1) {
        throw Error('invalid_staff_delivery_sql_result');
      }
      return Object.freeze({authorized: result.rows.length === 1});
    },
    async markDeliveryClaimed(query, jobId) {
      if (typeof query !== 'function' || !UUID.test(jobId)) {
        throw Error('invalid_staff_delivery_sql_input');
      }
      // Fence is minted by PostgreSQL only when the conditional claim wins.
      const result = await query({
        text: `UPDATE sabora.staff_invitation_outbox
          SET state = 'claimed', fence = gen_random_uuid(),
            claimed_at = clock_timestamp()
          WHERE id = $1::uuid AND state = 'pending'
          RETURNING fence::text AS fence`,
        values: [jobId.toLowerCase()],
      });
      if (!Array.isArray(result?.rows) || result.rows.length > 1) {
        throw Error('invalid_staff_delivery_sql_result');
      }
      const fence = result.rows[0]?.fence;
      return Object.freeze({claimed: typeof fence === 'string' && UUID.test(fence), fence});
    },
  });
}
