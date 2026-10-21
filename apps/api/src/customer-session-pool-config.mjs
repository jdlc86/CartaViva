// Pure configuration validator; never creates credentials or connects on import.
// This login must be provisioned and audited separately, not by the API.
export function readCustomerSessionPoolConfig(env = {}) {
  const host = env.SABORA_CUSTOMER_SESSION_DB_HOST;
  const database = env.SABORA_CUSTOMER_SESSION_DB_NAME;
  const user = env.SABORA_CUSTOMER_SESSION_DB_USER;
  const password = env.SABORA_CUSTOMER_SESSION_DB_PASSWORD;
  const ca = env.SABORA_CUSTOMER_SESSION_DB_CA_PEM;
  const port = Number(env.SABORA_CUSTOMER_SESSION_DB_PORT ?? 5432);
  if (![host,database,user,password,ca].every(v => typeof v === 'string' && v.trim().length > 0) ||
      !Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      /[\s/@:]/.test(host) || /[\s/@:]/.test(user) ||
      user !== 'sabora_customer_session_login' ||
      !ca.includes('-----BEGIN CERTIFICATE-----') ||
      !ca.includes('-----END CERTIFICATE-----')) {
    throw Error('invalid_customer_session_pool_config');
  }
  return Object.freeze({
    host,port,database,user,password,
    ssl:Object.freeze({ca,rejectUnauthorized:true}),
    max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,
    allowExitOnIdle:false
  });
}
