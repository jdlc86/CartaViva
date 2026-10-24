// Trusted JWKS provider for Supabase Auth. The URL is derived exclusively from
// server configuration, never from a JWT header or a client-controlled value.
export function createSupabaseJwksProvider({
  issuer,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  ttlMs = 5 * 60 * 1000,
  timeoutMs = 5000
} = {}) {
  if (typeof issuer !== 'string' || !/^https:\/\/[^/?#]+\/auth\/v1$/.test(issuer) ||
      typeof fetchImpl !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 3600000 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new Error('invalid_jwks_config');

  const endpoint = issuer + '/.well-known/jwks.json';
  let cached = null;
  let expiresAt = 0;
  let pending = null;

  async function refresh() {
    const response = await fetchImpl(endpoint, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('jwks_unavailable');
    const length = response.headers?.get?.('content-length');
    if (length !== null && length !== undefined && Number(length) > 65536) throw new Error('jwks_invalid');
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 65536) throw new Error('jwks_invalid');
    let body;
    try { body = JSON.parse(raw); } catch { throw new Error('jwks_invalid'); }
    if (!body || !Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20 ||
        body.keys.some(k => !k || k.kty !== 'RSA' || k.alg !== 'RS256' || k.use !== 'sig' ||
          typeof k.kid !== 'string' || !k.kid || typeof k.n !== 'string' || !k.n ||
          typeof k.e !== 'string' || !k.e)) throw new Error('jwks_invalid');
    cached = body.keys.map(k => Object.freeze({ kty: k.kty, alg: k.alg, use: k.use, kid: k.kid, n: k.n, e: k.e }));
    expiresAt = now() + ttlMs;
    return cached;
  }

  return async function getTrustedKeys() {
    if (cached && now() < expiresAt) return cached;
    if (!pending) pending = refresh().finally(() => { pending = null; });
    return pending;
  };
}
