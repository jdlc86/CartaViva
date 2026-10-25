import {hashStaffInvitationToken} from './staff-lifecycle-capability.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const ADMIN_ACTIONS = new Set(['invite', 'activate', 'resend', 'suspend', 'revoke']);

export const STAFF_INVITATION_DELIVERY_TOKEN = Symbol('staffInvitationDeliveryToken');

function exactDataRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length) return false;
  const allowed = new Set(keys);
  return ownKeys.every((key) => {
    if (typeof key !== 'string' || !allowed.has(key) ||
        !Object.prototype.propertyIsEnumerable.call(value, key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value');
  });
}

function verifiedActor(context, adminRequired) {
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      !context.verifiedIdentity || typeof context.verifiedIdentity !== 'object' ||
      Array.isArray(context.verifiedIdentity) ||
      !UUID.test(context.verifiedIdentity.userId)) {
    throw Error('staff_lifecycle_identity_forbidden');
  }
  const actorId = context.verifiedIdentity.userId.toLowerCase();
  if (!adminRequired) return actorId;
  const staff = context.verifiedStaff;
  if (!staff || typeof staff !== 'object' || Array.isArray(staff) ||
      staff.role !== 'admin' || !UUID.test(staff.userId) ||
      staff.userId.toLowerCase() !== actorId) {
    throw Error('staff_lifecycle_admin_forbidden');
  }
  return actorId;
}

function reason(value) {
  if (typeof value !== 'string') throw Error('invalid_staff_lifecycle_request');
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw Error('invalid_staff_lifecycle_request');
  }
  return normalized;
}

function deliveryResult(result, token) {
  if (token === null) return result;
  const output = {...result};
  Object.defineProperty(output, STAFF_INVITATION_DELIVERY_TOKEN, {
    value: token,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(output);
}

export function createStaffLifecycleCoordinator({
  withTransaction,
  repository,
  issueCapability,
  issueInvitationToken,
  hashInviteeEmail,
  verifyCredentialRegistration,
  uuid,
} = {}) {
  if (typeof withTransaction !== 'function' ||
      !repository || typeof repository.transition !== 'function' ||
      typeof issueCapability !== 'function' ||
      typeof issueInvitationToken !== 'function' ||
      typeof hashInviteeEmail !== 'function' ||
      typeof verifyCredentialRegistration !== 'function' ||
      typeof uuid !== 'function') {
    throw Error('invalid_staff_lifecycle_coordinator_config');
  }

  return Object.freeze({
    async transition(context, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw Error('invalid_staff_lifecycle_request');
      }
      const actionDescriptor = Object.getOwnPropertyDescriptor(input, 'action');
      if (!actionDescriptor || !Object.hasOwn(actionDescriptor, 'value') ||
          typeof actionDescriptor.value !== 'string') {
        throw Error('invalid_staff_lifecycle_request');
      }
      const action = actionDescriptor.value;
      const adminRequired = ADMIN_ACTIONS.has(action);
      const actorId = verifiedActor(context, adminRequired);
      let enrollmentId;
      let subjectUserId = null;
      let requestedRole = null;
      let inviteeEmailHashHex = null;
      let inviteTokenHashHex = null;
      let credentialEvidenceHashHex = null;
      let normalizedReason = null;
      let deliveryToken = null;
      let correlationId;

      if (action === 'invite') {
        if (!exactDataRecord(input, ['action', 'email', 'requestedRole', 'correlationId']) ||
            !ROLES.has(input.requestedRole)) throw Error('invalid_staff_lifecycle_request');
        enrollmentId = uuid();
        if (!UUID.test(enrollmentId)) throw Error('invalid_staff_lifecycle_uuid');
        inviteeEmailHashHex = hashInviteeEmail(input.email);
        deliveryToken = issueInvitationToken();
        inviteTokenHashHex = hashStaffInvitationToken(deliveryToken);
        requestedRole = input.requestedRole;
        correlationId = input.correlationId;
      } else if (action === 'accept') {
        if (!exactDataRecord(input, ['action', 'enrollmentId', 'inviteToken', 'correlationId'])) {
          throw Error('invalid_staff_lifecycle_request');
        }
        enrollmentId = input.enrollmentId;
        subjectUserId = actorId;
        inviteTokenHashHex = hashStaffInvitationToken(input.inviteToken);
        correlationId = input.correlationId;
      } else if (action === 'register') {
        if (!exactDataRecord(input, ['action', 'enrollmentId', 'credentialRegistration', 'correlationId']) ||
            typeof input.credentialRegistration !== 'string' ||
            input.credentialRegistration.length < 32 || input.credentialRegistration.length > 8192) {
          throw Error('invalid_staff_lifecycle_request');
        }
        enrollmentId = input.enrollmentId;
        subjectUserId = actorId;
        const evidence = await verifyCredentialRegistration(Object.freeze({
          actorId, enrollmentId, evidence: input.credentialRegistration,
        }));
        if (!(evidence instanceof Uint8Array) || evidence.byteLength !== 32) {
          throw Error('invalid_staff_credential_evidence');
        }
        credentialEvidenceHashHex = Buffer.from(evidence).toString('hex');
        correlationId = input.correlationId;
      } else if (action === 'resend') {
        if (!exactDataRecord(input, ['action', 'enrollmentId', 'correlationId'])) {
          throw Error('invalid_staff_lifecycle_request');
        }
        enrollmentId = input.enrollmentId;
        deliveryToken = issueInvitationToken();
        inviteTokenHashHex = hashStaffInvitationToken(deliveryToken);
        correlationId = input.correlationId;
      } else if (action === 'activate') {
        if (!exactDataRecord(input, ['action', 'enrollmentId', 'subjectUserId', 'correlationId'])) {
          throw Error('invalid_staff_lifecycle_request');
        }
        enrollmentId = input.enrollmentId;
        subjectUserId = input.subjectUserId;
        correlationId = input.correlationId;
      } else if (action === 'suspend' || action === 'revoke') {
        if (!exactDataRecord(input, ['action', 'enrollmentId', 'subjectUserId', 'reason', 'correlationId'])) {
          throw Error('invalid_staff_lifecycle_request');
        }
        enrollmentId = input.enrollmentId;
        subjectUserId = input.subjectUserId;
        normalizedReason = reason(input.reason);
        correlationId = input.correlationId;
      } else {
        throw Error('invalid_staff_lifecycle_request');
      }

      if (!UUID.test(enrollmentId) ||
          (subjectUserId !== null && !UUID.test(subjectUserId)) ||
          typeof correlationId !== 'string' || !CORRELATION.test(correlationId)) {
        throw Error('invalid_staff_lifecycle_request');
      }

      const capability = issueCapability({
        actorId,
        action,
        enrollmentId: enrollmentId.toLowerCase(),
        subjectUserId: subjectUserId?.toLowerCase() ?? null,
        requestedRole,
        inviteeEmailHashHex,
        inviteTokenHashHex,
        credentialEvidenceHashHex,
        reason: normalizedReason,
        correlationId,
      });
      const result = await withTransaction(async (query) =>
        repository.transition(query, capability));
      return deliveryResult(result, deliveryToken);
    },
  });
}
