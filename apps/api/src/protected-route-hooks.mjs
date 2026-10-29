import { createAuthenticationHook } from './auth-hook.mjs';
import { createStaffAuthorization } from './staff-authorization.mjs';

// Route-scoped composition: no global hooks and no operational routes registered.
// The caller must supply a trusted JWKS provider and a durable membership lookup.
export function createProtectedRouteHooks({ issuer, getTrustedKeys, lookupStaff, verify } = {}) {
  const authenticate = createAuthenticationHook({ issuer, getTrustedKeys, verify });
  const authorize = createStaffAuthorization({ lookupStaff });
  return function forRoles(allowedRoles) {
    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0 ||
        allowedRoles.some(role => !['root', 'admin', 'waiter', 'kitchen'].includes(role))) {
      throw new Error('invalid_route_roles');
    }
    return [
      authenticate,
      async (request, reply) => {
        if (reply.sent) return;
        return authorize(request, reply, allowedRoles);
      }
    ];
  };
}
