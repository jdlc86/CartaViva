// Customer HTTP candidates require an exact origin. HTTPS is mandatory except
// for the loopback-only browser acceptance explicitly allowed by QR V1.
export function isAllowedCustomerOrigin(value) {
  if (typeof value !== 'string') return false;
  let origin;
  try { origin = new URL(value); }
  catch { return false; }
  if (origin.origin !== value || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) return false;
  if (origin.protocol === 'https:') return true;
  return origin.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
}
