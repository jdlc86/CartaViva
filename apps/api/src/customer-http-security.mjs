// Pure HTTP boundary policy; no route is exposed by this module.
// Customer auth is cookie-based and MUST NOT share staff Bearer JWT hooks.
const COOKIE_NAME = '__Host-sabora_customer';
const SAFE_METHODS = new Set(['GET','HEAD','OPTIONS']);

export function customerSessionCookie(token, { secure = true, maxAge = 60 * 60 * 24 * 30 } = {}) {
  if (secure !== true || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > 60 * 60 * 24 * 90) {
    throw Error('invalid_customer_cookie');
  }
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCustomerSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readCustomerSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 8192) return null;
  const values = cookieHeader.split(';').map(x=>x.trim()).filter(x=>x.startsWith(`${COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(COOKIE_NAME.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function isAllowedCustomerRequestOrigin({ method, origin, expectedOrigin, fetchSite } = {}) {
  if (typeof expectedOrigin !== 'string' || !/^https:\/\/[^/?#]+$/.test(expectedOrigin)) {
    throw Error('invalid_customer_origin_configuration');
  }
  if (typeof method !== 'string') return false;
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  // Unsafe requests are denied unless Origin matches the exact configured
  // HTTPS PWA origin. No Referer fallback or wildcard matching.
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return false;
  return typeof origin === 'string' && origin === expectedOrigin;
}

export { COOKIE_NAME };
