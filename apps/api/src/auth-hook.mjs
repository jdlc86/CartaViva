import { verifySupabaseAccessToken } from './auth.mjs';

// This hook authenticates a request, but does not authorize any business action.
// Every future operational route must separately check current membership and role.
export function createAuthenticationHook({ issuer, getTrustedKeys, verify = verifySupabaseAccessToken } = {}) {
  if (typeof issuer !== 'string' || typeof getTrustedKeys !== 'function' || typeof verify !== 'function') throw new Error('invalid_auth_config');
  return async function authenticate(request, reply) {
    const value = request.headers.authorization;
    if (typeof value !== 'string' || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    try {
      const keys = await getTrustedKeys();
      const identity = verify(value.slice(7), { issuer, keys });
      if (!identity || typeof identity.userId !== 'string') throw new Error('invalid_identity');
      request.verifiedIdentity = identity;
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };
}
