import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApiRuntimeConfig } from '../apps/api/src/api-runtime-config.mjs';
import {
  DORMANT_INJECTED_SECURITY_INVENTORY,
  OPERATIONAL_ENVIRONMENT_INVENTORY,
  inspectOperationalSecurityInventory,
} from '../scripts/ci/operational-security-inventory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = { NODE_ENV: 'production', SABORA_API_HOST: '0.0.0.0', SABORA_API_PORT: '4100', SABORA_API_MODE: 'health-only' };

test('operational inventory is complete, separated and repository-aligned', () => {
  assert.deepEqual(inspectOperationalSecurityInventory(root), []);
  assert.equal(OPERATIONAL_ENVIRONMENT_INVENTORY.length, 23);
  assert.equal(DORMANT_INJECTED_SECURITY_INVENTORY.length, 15);
  assert.ok(Object.isFrozen(OPERATIONAL_ENVIRONMENT_INVENTORY));
  assert.ok(OPERATIONAL_ENVIRONMENT_INVENTORY.every(Object.isFrozen));
  assert.ok(DORMANT_INJECTED_SECURITY_INVENTORY.every(item => item.state === 'dormant' && item.environmentName === null));
});

test('health-only startup rejects every inventoried sensitive environment input without echoing values', () => {
  for (const item of OPERATIONAL_ENVIRONMENT_INVENTORY.filter(value =>
    ['secret', 'trust_material', 'public_trust_material'].includes(value.classification))) {
    assert.throws(() => readApiRuntimeConfig({ ...runtime, [item.name]: 'CANARY_NOT_FOR_LOGS_7b4fe32d' }), /invalid_api_runtime_config/);
  }
  for (const name of ['SABORA_FUTURE_HMAC_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'VITE_PRIVATE_KEY']) {
    assert.throws(() => readApiRuntimeConfig({ ...runtime, [name]: 'CANARY_NOT_FOR_LOGS_7b4fe32d' }), /invalid_api_runtime_config/);
  }
});

test('security gate fails on lifecycle, principal, example and artifact drift', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'sabora-p3-security-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const directory of ['deploy', 'apps/api/src', 'apps/client/dist', 'apps/management/dist', '.github/workflows']) {
    mkdirSync(join(fixture, directory), { recursive: true });
  }
  for (const path of ['.env.example', 'deploy/compose.sabora.yml']) {
    writeFileSync(join(fixture, path), readFileSync(join(root, path)));
  }
  assert.deepEqual(inspectOperationalSecurityInventory(fixture), []);

  const incomplete = OPERATIONAL_ENVIRONMENT_INVENTORY.map(item =>
    item.name === 'SABORA_STAFF_DB_PASSWORD' ? { ...item, revoke: '' } : item);
  assert.ok(inspectOperationalSecurityInventory(fixture, { environment: incomplete }).includes('sensitive_input_without_lifecycle'));

  const aliased = OPERATIONAL_ENVIRONMENT_INVENTORY.map(item =>
    item.principal === 'sabora_catalog_login' ? { ...item, principal: 'sabora_staff_reader_login' } : item);
  assert.ok(inspectOperationalSecurityInventory(fixture, { environment: aliased }).includes('database_principal_separation_drift'));

  writeFileSync(join(fixture, 'apps/api/src/leak.mjs'), 'export const value="sk_live_1234567890abcdefghijkl";\n');
  assert.ok(inspectOperationalSecurityInventory(fixture).some(value => value.startsWith('credential_in_artifact:')));
});
