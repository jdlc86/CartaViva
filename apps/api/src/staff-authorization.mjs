// A verified JWT identifies a user, but never grants operational permissions.
// The resolver MUST read current durable membership on every authorization;
// it must not trust request bodies, JWT role claims or stale cached memberships.
const ALLOWED_ROLES = new Set(['admin', 'waiter', 'kitchen']);

export function createStaffAuthorization({ lookupStaff } = {}) {
  if (typeof lookupStaff !== 'function') throw new Error('invalid_staff_authorization_config');

  return async function authorizeStaff(request, reply, allowedRoles) {
    const identity = request.verifiedIdentity;
    if (!identity || typeof identity.userId !== 'string' || !Array.isArray(allowedRoles) ||
        allowedRoles.length === 0 || allowedRoles.some(role => !ALLOWED_ROLES.has(role))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    let membership;
    try {
      membership = await lookupStaff(identity.userId);
    } catch {
      // Do not mistake a database outage for absence of permissions.
      return reply.code(503).send({ error: 'authorization_unavailable' });
    }
    if (!membership || membership.state !== 'active' || !ALLOWED_ROLES.has(membership.role) ||
        !allowedRoles.includes(membership.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    request.verifiedStaff = Object.freeze({ userId: identity.userId, role: membership.role });
  };
}
