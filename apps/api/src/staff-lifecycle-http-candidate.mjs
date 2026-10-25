import {STAFF_INVITATION_DELIVERY_TOKEN} from './staff-lifecycle-coordinator.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);
const ACTIONS = new Set(['invite', 'accept', 'register', 'activate', 'resend', 'suspend', 'revoke']);
const ADMIN_ACTIONS = new Set(['invite', 'activate', 'resend', 'suspend', 'revoke']);

function exactRecord(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  const allowed = new Set(fields);
  return keys.every(key => typeof key === 'string' && allowed.has(key) &&
    Object.prototype.propertyIsEnumerable.call(value, key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

export function validateStaffLifecycleHttpInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Error('invalid_staff_lifecycle_request');
  }
  const descriptor = Object.getOwnPropertyDescriptor(body, 'action');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') ||
      !ACTIONS.has(descriptor.value)) throw Error('invalid_staff_lifecycle_request');
  const action = descriptor.value;
  const fields = action === 'invite'
    ? ['action', 'email', 'requestedRole', 'correlationId']
    : action === 'accept'
      ? ['action', 'enrollmentId', 'inviteToken', 'correlationId']
      : action === 'register'
        ? ['action', 'enrollmentId', 'credentialRegistration', 'correlationId']
        : action === 'resend'
          ? ['action', 'enrollmentId', 'correlationId']
          : action === 'activate'
            ? ['action', 'enrollmentId', 'subjectUserId', 'correlationId']
            : ['action', 'enrollmentId', 'subjectUserId', 'reason', 'correlationId'];
  if (!exactRecord(body, fields) || !CORRELATION.test(body.correlationId) ||
      (action !== 'invite' && !UUID.test(body.enrollmentId)) ||
      ((action === 'activate' || action === 'suspend' || action === 'revoke') &&
        body.subjectUserId !== null && !UUID.test(body.subjectUserId)) ||
      (action === 'invite' && (!ROLES.has(body.requestedRole) ||
        typeof body.email !== 'string' || body.email.length > 254)) ||
      (action === 'accept' && (typeof body.inviteToken !== 'string' ||
        body.inviteToken.length < 32 || body.inviteToken.length > 512)) ||
      (action === 'register' && (typeof body.credentialRegistration !== 'string' ||
        body.credentialRegistration.length < 32 ||
        body.credentialRegistration.length > 8192)) ||
      ((action === 'suspend' || action === 'revoke') &&
        (typeof body.reason !== 'string' || body.reason.trim().length < 1 ||
          body.reason.trim().length > 500))) {
    throw Error('invalid_staff_lifecycle_request');
  }
  return Object.freeze({action, adminRequired: ADMIN_ACTIONS.has(action), input: body});
}

// Candidate adapter: does not mount itself and never sends invitation secrets
// to HTTP clients. Delivery is a trusted out-of-band dependency only.
export function createStaffLifecycleHttpHandler({coordinator, deliverInvitation} = {}) {
  if (!coordinator || typeof coordinator.transition !== 'function' ||
      typeof deliverInvitation !== 'function') {
    throw Error('invalid_staff_lifecycle_http_config');
  }
  return async function handle(request, reply) {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    let parsed;
    try { parsed = validateStaffLifecycleHttpInput(request.body); }
    catch { return reply.code(400).send({error: 'invalid_staff_lifecycle_request'}); }
    if (!request.verifiedIdentity ||
        (parsed.adminRequired && !request.verifiedStaff)) {
      return reply.code(403).send({error: 'forbidden'});
    }
    try {
      const result = await coordinator.transition({
        verifiedIdentity: request.verifiedIdentity,
        verifiedStaff: request.verifiedStaff,
      }, parsed.input);
      const token = result[STAFF_INVITATION_DELIVERY_TOKEN];
      if (token !== undefined) {
        // Delivery failures are not silently reported as success.
        await deliverInvitation(Object.freeze({
          enrollmentId: result.enrollmentId,
          token,
          action: parsed.action,
        }));
      }
      return reply.code(result.repeated ? 200 : 201).send(result);
    } catch (error) {
      if (error?.message === 'staff_lifecycle_identity_forbidden' ||
          error?.message === 'staff_lifecycle_admin_forbidden') {
        return reply.code(403).send({error: 'forbidden'});
      }
      if (error?.message === 'invalid_staff_lifecycle_request') {
        return reply.code(400).send({error: 'invalid_staff_lifecycle_request'});
      }
      return reply.code(503).send({error: 'staff_lifecycle_unavailable'});
    }
  };
}
