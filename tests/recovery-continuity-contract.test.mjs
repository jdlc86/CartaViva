import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RECOVERY_CONTINUITY_CONTRACT,
  inspectRecoveryContinuity,
} from '../scripts/ci/recovery-continuity-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const recovery = readFileSync(new URL('../scripts/ci/postgres-recovery-smoke.sh', import.meta.url), 'utf8');

test('recovery contract is Sabora-only and makes no unverified production claim', () => {
  assert.deepEqual(inspectRecoveryContinuity(root), []);
  assert.equal(RECOVERY_CONTINUITY_CONTRACT.databaseScope, 'sabora_only');
  assert.equal(RECOVERY_CONTINUITY_CONTRACT.postgresMajor, 17);
  assert.equal(RECOVERY_CONTINUITY_CONTRACT.representativeRows, 10000);
  assert.equal(RECOVERY_CONTINUITY_CONTRACT.productionRto, null);
  assert.equal(RECOVERY_CONTINUITY_CONTRACT.productionRpo, null);
  assert.equal(RECOVERY_CONTINUITY_CONTRACT.storage.databaseBackupIncludesObjectBytes, false);
});

test('recovery gate detects weakened load, isolation and ambiguous-target handling', () => {
  const weakened = recovery
    .replace('P3_RECOVERY_ROWS=10000', 'P3_RECOVERY_ROWS=10')
    .replace(' --section=pre-data ', ' --section=all ')
    .replace('--network none', '--network bridge');
  const violations = inspectRecoveryContinuity(root, { recoveryScript: weakened });
  assert.ok(violations.some(value => value.startsWith('recovery_contract_marker_missing:P3_RECOVERY_ROWS=')));
  assert.ok(violations.some(value => value.startsWith('recovery_contract_marker_missing:--section=pre-data')));
  assert.ok(violations.includes('clean_recovery_cluster_not_network_isolated'));
});

test('new Storage usage fails until a separate object recovery contract exists', () => {
  assert.deepEqual(inspectRecoveryContinuity(root, { applicationTexts: ['export const safe = true;'] }), []);
  assert.ok(inspectRecoveryContinuity(root, {
    applicationTexts: ["client.storage.from('menus').upload('dish.jpg', body)"],
  }).includes('untracked_storage_dependency'));
});
