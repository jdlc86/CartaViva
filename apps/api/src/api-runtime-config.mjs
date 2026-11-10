const API_SECRET_ENV_NAMES = Object.freeze([
  'SABORA_STAFF_DB_PASSWORD', 'SABORA_STAFF_DB_CA_PEM',
  'SABORA_CATALOG_DB_PASSWORD', 'SABORA_CATALOG_DB_CA_PEM',
  'SABORA_CUSTOMER_SESSION_DB_PASSWORD', 'SABORA_CUSTOMER_SESSION_DB_CA_PEM'
]);

const present = value => typeof value === 'string' && value.length > 0;
const validHost = value => value === '127.0.0.1' || value === '0.0.0.0';
const sensitiveName = name =>
  /^(?:DATABASE_URL|PGPASSWORD|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY)$/i.test(name) ||
  /^SABORA_.*(?:PASSWORD|SECRET|TOKEN|PRIVATE|KEY|CA_PEM|HMAC|CREDENTIAL)/i.test(name) ||
  /^VITE_.*(?:SECRET|TOKEN|PASSWORD|PRIVATE|KEY|CA_PEM)$/i.test(name);

// This is the only active production process configuration. Operational H3-H6
// candidates remain dependency-injected and are deliberately absent here.
export function readApiRuntimeConfig(env = {}) {
  const environment = env.NODE_ENV ?? 'development';
  const production = environment === 'production';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw Error('invalid_api_runtime_config');
  }

  if (production && (present(env.HOST) || present(env.PORT))) {
    throw Error('invalid_api_runtime_config');
  }
  const host = env.SABORA_API_HOST ?? (production ? undefined : '127.0.0.1');
  const rawPort = env.SABORA_API_PORT ?? (production ? undefined : '4100');
  const mode = env.SABORA_API_MODE ?? (production ? undefined : 'health-only');
  const port = typeof rawPort === 'string' && /^[0-9]{1,5}$/.test(rawPort) ? Number(rawPort) : NaN;

  if (!validHost(host) || !Number.isSafeInteger(port) || port < 1024 || port > 65535 ||
      mode !== 'health-only') {
    throw Error('invalid_api_runtime_config');
  }

  if (production) {
    if (API_SECRET_ENV_NAMES.some(name => present(env[name])) ||
        Object.entries(env).some(([name, value]) => sensitiveName(name) && present(value))) {
      throw Error('invalid_api_runtime_config');
    }
  }

  return Object.freeze({ environment, host, port, mode });
}

export { API_SECRET_ENV_NAMES };
