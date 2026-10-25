// Candidate-only delivery planner. This module does not send messages or
// mutate PostgreSQL. It protects an outbox worker from delivering a token
// after revocation or after a newer resend has rotated the invitation.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATES = new Set(['invited', 'accepted', 'registered', 'active', 'suspended', 'revoked']);

export function decideStaffInvitationDelivery({job, enrollment} = {}) {
  if (!job || !enrollment || typeof job !== 'object' ||
      typeof enrollment !== 'object' || Array.isArray(job) ||
      Array.isArray(enrollment) ||
      !UUID.test(job.enrollmentId) || !UUID.test(enrollment.id) ||
      !Number.isSafeInteger(job.inviteVersion) || job.inviteVersion < 1 ||
      !Number.isSafeInteger(enrollment.inviteVersion) || enrollment.inviteVersion < 1 ||
      !HASH.test(job.inviteTokenHashHex) || !HASH.test(enrollment.inviteTokenHashHex) ||
      !STATES.has(enrollment.state)) {
    throw Error('invalid_staff_invitation_delivery_state');
  }
  if (job.enrollmentId.toLowerCase() !== enrollment.id.toLowerCase()) {
    throw Error('staff_invitation_delivery_enrollment_mismatch');
  }
  if (enrollment.state === 'revoked') {
    return Object.freeze({deliver: false, reason: 'revoked'});
  }
  if (enrollment.state !== 'invited') {
    return Object.freeze({deliver: false, reason: 'already_accepted'});
  }
  if (job.inviteVersion !== enrollment.inviteVersion ||
      job.inviteTokenHashHex !== enrollment.inviteTokenHashHex) {
    return Object.freeze({deliver: false, reason: 'superseded'});
  }
  return Object.freeze({deliver: true, reason: 'current_invitation'});
}
