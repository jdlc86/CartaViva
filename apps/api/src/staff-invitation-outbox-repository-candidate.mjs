// Candidate-only SQL adapter for a future isolated PostgreSQL 17 outbox.
// This module deliberately does not provision schema, grants or credentials.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATES = new Set(['invited', 'accepted', 'registered', 'active', 'suspended', 'revoked']);

function parseCandidate(jobId, rows) {
  if (!Array.isArray(rows) || rows.length > 1) {
    throw Error('invalid_staff_delivery_sql_result');
  }
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row || typeof row !== 'object' ||
      !UUID.test(row.enrollment_id) ||
      !Number.isSafeInteger(row.invite_version) || row.invite_version < 1 ||
      !Number.isSafeInteger(row.current_invite_version) ||
      row.current_invite_version < 1 ||
      !HASH.test(row.invite_token_hash_hex) ||
      !HASH.test(row.current_invite_token_hash_hex) ||
      !STATES.has(row.enrollment_state) ||
      row.job_id?.toLowerCase() !== jobId.toLowerCase()) {
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
