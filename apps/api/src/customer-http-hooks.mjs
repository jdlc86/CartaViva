import { readCustomerSessionCookie, isAllowedCustomerRequestOrigin, clearCustomerSessionCookie } from './customer-http-security.mjs';

// Private Fastify-compatible hooks; intentionally not registered on server.mjs.
// Keep customer cookie authentication entirely separate from staff JWTs.
export function createCustomerHttpHooks({ verifySession, revokeSession, expectedOrigin } = {}) {
  if (typeof verifySession !== 'function' || typeof revokeSession !== 'function' ||
      typeof expectedOrigin !== 'string' || !/^https:\/\/[^/]+$/.test(expectedOrigin)) {
    throw Error('invalid_customer_http_hooks_configuration');
  }
  async function authenticate(request, reply) {
    const token = readCustomerSessionCookie(request.headers?.cookie);
    if (!token) return reply.code(401).send({error:'unauthorized'});
    let identity;
    try { identity = await verifySession(token); }
    catch { return reply.code(503).send({error:'session_verification_unavailable'}); }
    if (!identity || typeof identity.customerId !== 'string') {
      return reply.code(401).send({error:'unauthorized'});
    }
    request.verifiedCustomer = identity;
    // Never attach the bearer token to the request object.
  }
  function guardMutation(request, reply) {
    if (!isAllowedCustomerRequestOrigin({
      method:request.method, origin:request.headers?.origin, expectedOrigin
    })) return reply.code(403).send({error:'forbidden_origin'});
  }
  async function logout(request, reply) {
    // This handler must be installed ONLY on a POST route after guardMutation.
    const token = readCustomerSessionCookie(request.headers?.cookie);
    if (!token) return reply.code(401).send({error:'unauthorized'});
    try { await revokeSession(token); }
    catch { return reply.code(503).send({error:'session_revocation_unavailable'}); }
    reply.header('Set-Cookie',clearCustomerSessionCookie());
    return reply.code(204).send();
  }
  return {authenticate,guardMutation,logout};
}
