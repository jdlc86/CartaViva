import {hasUnsafeProductionDatabaseEndpoint,isUnsafeProductionSecret} from './production-secret-policy.mjs';

// Strict configuration validator only. It does not open network connections,
// log secrets, create credentials, or register operational HTTP routes.
// The backend must provision a dedicated staff reader identity separately.
export function readStaffPoolConfig(env = {}) {
  const host = env.SABORA_STAFF_DB_HOST;
  const database = env.SABORA_STAFF_DB_NAME;
  const user = env.SABORA_STAFF_DB_USER;
  const password = env.SABORA_STAFF_DB_PASSWORD;
  const ca = env.SABORA_STAFF_DB_CA_PEM;
  const port = Number(env.SABORA_STAFF_DB_PORT ?? 5432);

  if (![host, database, user, password, ca].every(v => typeof v === 'string' && v.trim().length > 0) ||
      !Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      /[\s/@:]/.test(host) || /[\s/@:]/.test(user) ||
      user !== 'sabora_staff_reader_login' ||
      !ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    throw new Error('invalid_staff_pool_config');
  }
  if (env.NODE_ENV === 'production' &&
      (isUnsafeProductionSecret(password) || hasUnsafeProductionDatabaseEndpoint({host,database,ca}))) {
    throw new Error('invalid_staff_pool_config');
  }
  return Object.freeze({
    host, port, database, user, password,
    ssl: Object.freeze({ ca, rejectUnauthorized: true }),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: false
  });
}
