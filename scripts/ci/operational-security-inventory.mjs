import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_SECRET_ENV_NAMES } from '../../apps/api/src/api-runtime-config.mjs';

const lifecycle = Object.freeze({
  custodian: 'security_and_dba_sabora',
  rotate: 'inject_new_value_restart_only_authorized_sabora_process_verify_then_revoke_old',
  revoke: 'revoke_at_issuer_or_database_drain_bounded_pool_and_repeat_preflight',
});

const entry = value => Object.freeze(value);

export const OPERATIONAL_ENVIRONMENT_INVENTORY = Object.freeze([
  entry({ name: 'NODE_ENV', component: 'api', state: 'active', exposure: 'server', classification: 'public', owner: 'release_sabora' }),
  entry({ name: 'SABORA_API_HOST', component: 'api', state: 'active', exposure: 'server', classification: 'public', owner: 'platform_sabora' }),
  entry({ name: 'SABORA_API_PORT', component: 'api', state: 'active', exposure: 'server', classification: 'public', owner: 'platform_sabora' }),
  entry({ name: 'SABORA_API_MODE', component: 'api', state: 'active', exposure: 'server', classification: 'public', owner: 'release_sabora' }),
  entry({ name: 'VITE_SABORA_RESTAURANT_CODE', component: 'client_build', state: 'build_only', exposure: 'frontend', classification: 'public', owner: 'installation_owner' }),
  ...[
    ['SABORA_STAFF_DB', 'staff_reader', 'sabora_staff_reader_login'],
    ['SABORA_CATALOG_DB', 'catalog_reader', 'sabora_catalog_login'],
    ['SABORA_CUSTOMER_SESSION_DB', 'customer_session', 'sabora_customer_session_login'],
  ].flatMap(([prefix, component, principal]) => [
    entry({ name: `${prefix}_HOST`, component, state: 'dormant', exposure: 'server', classification: 'endpoint', owner: 'dba_sabora', principal }),
    entry({ name: `${prefix}_PORT`, component, state: 'dormant', exposure: 'server', classification: 'endpoint', owner: 'dba_sabora', principal }),
    entry({ name: `${prefix}_NAME`, component, state: 'dormant', exposure: 'server', classification: 'endpoint', owner: 'dba_sabora', principal }),
    entry({ name: `${prefix}_USER`, component, state: 'dormant', exposure: 'server', classification: 'principal', owner: 'dba_sabora', principal }),
    entry({ name: `${prefix}_PASSWORD`, component, state: 'dormant', exposure: 'server', classification: 'secret', owner: 'dba_sabora', principal, ...lifecycle }),
    entry({ name: `${prefix}_CA_PEM`, component, state: 'dormant', exposure: 'server', classification: 'trust_material', owner: 'security_sabora', principal, ...lifecycle }),
  ]),
]);

export const DORMANT_INJECTED_SECURITY_INVENTORY = Object.freeze([
  ['staff_jwks', 'public_trust_material'],
  ['customer_allowed_origin', 'public'],
  ['customer_acceptance_hmac', 'secret'],
  ['staff_lifecycle_hmac', 'secret'],
  ['staff_invitee_email_hmac', 'secret'],
  ['staff_invitation_encryption_keyring', 'secret'],
  ['staff_directory_hmac', 'secret'],
  ['staff_code_maintenance_hmac', 'secret'],
  ['h6_staff_hmac', 'secret'],
  ['h6_customer_sql_login', 'secret'],
  ['h6_operations_sql_login', 'secret'],
  ['h6_provider_sql_login', 'secret'],
  ['h6_sse_listener_sql_login', 'secret'],
  ['stripe_restricted_test_credential', 'secret'],
  ['stripe_webhook_test_secret', 'secret'],
].map(([id, classification]) => entry({
  id, classification, source: 'dependency_injection', state: 'dormant', environmentName: null,
  owner: classification === 'public' ? 'platform_sabora' : 'security_sabora',
  requiresActivationContract: true,
  ...(classification === 'secret' || classification === 'public_trust_material' ? lifecycle : {}),
})));

const secretLike = value => ['secret', 'trust_material', 'public_trust_material'].includes(value);
const filesBelow = path => {
  if (!existsSync(path)) return [];
  const result = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) result.push(...filesBelow(child));
    else result.push(child);
  }
  return result;
};

const parseExampleNames = value => value.split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .map(line => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1] ?? null).filter(Boolean);

export function inspectOperationalSecurityInventory(rootPath, {
  environment = OPERATIONAL_ENVIRONMENT_INVENTORY,
  injected = DORMANT_INJECTED_SECURITY_INVENTORY,
} = {}) {
  const root = resolve(rootPath);
  const violations = [];
  const names = environment.map(item => item.name);
  const exampleNames = parseExampleNames(readFileSync(join(root, '.env.example'), 'utf8'));
  if (new Set(names).size !== names.length) violations.push('duplicate_environment_inventory_name');
  if (new Set(injected.map(item => item.id)).size !== injected.length) violations.push('duplicate_injected_inventory_id');
  if (names.join('\n') !== exampleNames.join('\n')) violations.push('environment_example_inventory_drift');

  const secretEnvironment = environment.filter(item => secretLike(item.classification)).map(item => item.name).sort();
  if (secretEnvironment.join('\n') !== [...API_SECRET_ENV_NAMES].sort().join('\n')) {
    violations.push('runtime_secret_rejection_inventory_drift');
  }
  if (environment.some(item => item.exposure === 'frontend' && secretLike(item.classification))) {
    violations.push('frontend_sensitive_input');
  }
  if (environment.some(item => !item.owner || !item.component || !item.state || !item.exposure || !item.classification)) {
    violations.push('incomplete_environment_inventory');
  }
  if ([...environment, ...injected].some(item => secretLike(item.classification) &&
      (!item.custodian || !item.rotate || !item.revoke))) {
    violations.push('sensitive_input_without_lifecycle');
  }
  if (injected.some(item => item.state !== 'dormant' || item.environmentName !== null ||
      item.source !== 'dependency_injection' || item.requiresActivationContract !== true)) {
    violations.push('injected_candidate_not_fail_closed');
  }
  const principals = new Set(environment.map(item => item.principal).filter(Boolean));
  if (principals.size !== 3 || ![
    'sabora_staff_reader_login', 'sabora_catalog_login', 'sabora_customer_session_login',
  ].every(value => principals.has(value))) violations.push('database_principal_separation_drift');

  const compose = readFileSync(join(root, 'deploy', 'compose.sabora.yml'), 'utf8');
  const activeServerNames = environment.filter(item => item.state === 'active' && item.exposure === 'server').map(item => item.name);
  const composeNames = [...compose.matchAll(/^\s{6}([A-Z][A-Z0-9_]+):/gm)].map(match => match[1]);
  if (composeNames.join('\n') !== activeServerNames.join('\n')) violations.push('compose_environment_surface_drift');
  if (environment.filter(item => item.state === 'dormant').some(item => compose.includes(`${item.name}:`))) {
    violations.push('dormant_input_in_active_compose');
  }

  const credential = /(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{16,}|whsec_[A-Za-z0-9_]{16,}|postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
  for (const path of [
    join(root, 'apps', 'api', 'src'), join(root, 'apps', 'api', 'dist'),
    join(root, 'apps', 'client', 'dist'), join(root, 'apps', 'management', 'dist'),
    join(root, 'deploy'), join(root, '.github', 'workflows'),
  ]) for (const file of filesBelow(path)) {
    if (credential.test(readFileSync(file, 'utf8'))) violations.push(`credential_in_artifact:${relative(root, file)}`);
  }

  return Object.freeze([...new Set(violations)]);
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const violations = inspectOperationalSecurityInventory(root);
  if (violations.length) {
    process.stderr.write(`operational_security_gate_failed:${violations.join(',')}\n`);
    process.exitCode = 1;
  } else process.stdout.write('operational_security_gate_ok\n');
}
