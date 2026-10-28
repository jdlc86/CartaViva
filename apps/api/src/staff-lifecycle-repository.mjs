const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const HEX_32 = /^[0-9a-f]{64}$/;
const STATES = new Set(['invited', 'accepted', 'registered', 'active', 'suspended', 'revoked']);
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const ACTIONS = new Set(['invite', 'accept', 'register', 'activate', 'resend', 'suspend', 'revoke']);

export const STAFF_LIFECYCLE_SQL = `SELECT *
  FROM sabora.transition_staff_lifecycle_with_directory_candidate(
    $1::text,$2::text,$3::uuid,$4::text,$5::uuid,
    $6::uuid,$7::text,$8::text,$9::text,$10::text,
    $11::text,$12::text,$13::bigint,$14::bigint,$15::text,$16::text,$17::text,$18::text
  )`;
export const STAFF_LIFECYCLE_IDENTITY_SQL = `SELECT *
  FROM sabora.transition_staff_lifecycle_with_identity_candidate(
    $1::text,$2::text,$3::uuid,$4::text,$5::uuid,
    $6::uuid,$7::text,$8::text,$9::text,$10::text,
    $11::text,$12::text,$13::bigint,$14::bigint,$15::text,$16::text,$17::text
  )`;

function exactCapability(value, directory) {
  const keys = [
    'keyId', 'databaseRole', 'actorId', 'action', 'enrollmentId',
    'subjectUserId', 'requestedRole', 'inviteeEmailHashHex',
    'inviteTokenHashHex', 'credentialEvidenceHashHex', 'reason',
    'givenName', 'familyName', ...(directory ? ['inviteeEmail'] : []), 'correlationId', 'issuedAtMs',
    'expiresAtMs', 'signatureHex',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

function validCapability(value, directory) {
  return exactCapability(value, directory) && KEY_ID.test(value.keyId) &&
    ROLE_NAME.test(value.databaseRole) && UUID.test(value.actorId) &&
    ACTIONS.has(value.action) && UUID.test(value.enrollmentId) &&
    (value.subjectUserId === null || UUID.test(value.subjectUserId)) &&
    (value.requestedRole === null || ROLES.has(value.requestedRole)) &&
    (value.inviteeEmailHashHex === null || HEX_32.test(value.inviteeEmailHashHex)) &&
    (value.inviteTokenHashHex === null || HEX_32.test(value.inviteTokenHashHex)) &&
    (value.credentialEvidenceHashHex === null || HEX_32.test(value.credentialEvidenceHashHex)) &&
    (value.givenName === null || (typeof value.givenName === 'string' && value.givenName.length >= 1 && value.givenName.length <= 80)) &&
    (value.familyName === null || (typeof value.familyName === 'string' && value.familyName.length >= 1 && value.familyName.length <= 160)) &&
    (!directory || value.inviteeEmail === null || (typeof value.inviteeEmail === 'string' &&
      value.inviteeEmail.length >= 3 && value.inviteeEmail.length <= 254)) &&
    (value.reason === null || (typeof value.reason === 'string' &&
      value.reason === value.reason.trim() && value.reason.length >= 1 &&
      value.reason.length <= 500)) && CORRELATION.test(value.correlationId) &&
    Number.isSafeInteger(value.issuedAtMs) && Number.isSafeInteger(value.expiresAtMs) &&
    value.expiresAtMs > value.issuedAtMs && value.expiresAtMs - value.issuedAtMs <= 30_000 &&
    HEX_32.test(value.signatureHex);
}

function validEdge(action, previous, current) {
  if (action === 'invite') return previous === null && current === 'invited';
  if (action === 'accept') return previous === 'invited' && current === 'accepted';
  if (action === 'register') return previous === 'accepted' && current === 'registered';
  if (action === 'activate') return previous === 'registered' && current === 'active';
  if (action === 'resend') return previous === 'invited' && current === 'invited';
  if (action === 'suspend') return previous === 'active' && current === 'suspended';
  return current === 'revoked' && STATES.has(previous);
}

function publicResult(row, capability) {
  const previous = row.previous_state ?? null;
  const durableInviteReplay = capability.action === 'invite' && row.repeated === true;
  if (!UUID.test(row.result_enrollment_id) ||
      (!durableInviteReplay &&
        row.result_enrollment_id.toLowerCase() !== capability.enrollmentId.toLowerCase()) ||
      (row.result_subject_user_id !== null && !UUID.test(row.result_subject_user_id)) ||
      !ROLES.has(row.result_requested_role) || !STATES.has(row.current_state) ||
      (previous !== null && !STATES.has(previous)) ||
      !validEdge(capability.action, previous, row.current_state) ||
      typeof row.repeated !== 'boolean' || !Number.isSafeInteger(row.result_invite_version) ||
      row.result_invite_version < 1 || !UUID.test(row.event_id)) {
    throw Error('invalid_staff_lifecycle_sql_result');
  }
  if (typeof row.result_given_name !== 'string' || typeof row.result_family_name !== 'string' ||
      !/^[0-9A-Z]{3}$/.test(row.result_employee_code ?? '') ||
      typeof row.result_operational_display_id !== 'string') {
    throw Error('invalid_staff_lifecycle_sql_result');
  }
  if (capability.subjectUserId !== null &&
      row.result_subject_user_id?.toLowerCase() !== capability.subjectUserId.toLowerCase()) {
    throw Error('invalid_staff_lifecycle_sql_result');
  }
  if (capability.requestedRole !== null &&
      row.result_requested_role !== capability.requestedRole) {
    throw Error('invalid_staff_lifecycle_sql_result');
  }
  return Object.freeze({
    enrollmentId: row.result_enrollment_id,
    subjectUserId: row.result_subject_user_id,
    requestedRole: row.result_requested_role,
    previousState: previous,
    currentState: row.current_state,
    repeated: row.repeated,
    inviteVersion: row.result_invite_version,
    eventId: row.event_id,
    givenName: row.result_given_name,
    familyName: row.result_family_name,
    employeeCode: row.result_employee_code,
    operationalDisplayId: row.result_operational_display_id,
  });
}

export function createStaffLifecycleRepository({directory = true} = {}) {
  if (typeof directory !== 'boolean') throw Error('invalid_staff_lifecycle_repository_config');
  return Object.freeze({
    async transition(query, capability) {
      if (typeof query !== 'function' || !validCapability(capability, directory)) {
        throw Error('invalid_staff_lifecycle_repository_input');
      }
      const result = await query(directory ? STAFF_LIFECYCLE_SQL : STAFF_LIFECYCLE_IDENTITY_SQL, [
        capability.keyId,
        capability.databaseRole,
        capability.actorId,
        capability.action,
        capability.enrollmentId,
        capability.subjectUserId,
        capability.requestedRole,
        capability.inviteeEmailHashHex,
        capability.inviteTokenHashHex,
        capability.credentialEvidenceHashHex,
        capability.reason,
        capability.correlationId,
        capability.issuedAtMs,
        capability.expiresAtMs,
        capability.givenName,
        capability.familyName,
        ...(directory ? [capability.inviteeEmail] : []),
        capability.signatureHex,
      ]);
      if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
        throw Error('invalid_staff_lifecycle_sql_result');
      }
      return publicResult(result.rows[0], capability);
    },
  });
}
