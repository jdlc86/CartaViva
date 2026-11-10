import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECOVERY_CONTINUITY_CONTRACT = Object.freeze({
  schema: 1,
  databaseScope: 'sabora_only',
  postgresMajor: 17,
  representativeRows: 10000,
  representativePayloadBytes: 64,
  lockTimeoutMs: 500,
  lockDetectionBudgetMs: 5000,
  ciRecoveryBudgetMs: 180000,
  storage: Object.freeze({
    approvedFlowDependency: false,
    databaseBackupIncludesObjectBytes: false,
    state: 'separate_inventory_and_restore_required_before_activation',
  }),
  pitr: Object.freeze({
    operationallyVerified: false,
    state: 'plan_retention_restore_point_and_rto_require_authorized_rehearsal',
  }),
  productionRto: null,
  productionRpo: null,
});

const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx', '.sql']);
const filesBelow = path => {
  if (!existsSync(path)) return [];
  const files = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) {
      if (name !== 'dist' && name !== 'node_modules') files.push(...filesBelow(child));
    } else if (sourceExtensions.has(extname(name))) files.push(child);
  }
  return files;
};

export function inspectRecoveryContinuity(rootPath, {
  contract = RECOVERY_CONTINUITY_CONTRACT,
  recoveryScript,
  applicationTexts,
} = {}) {
  const root = resolve(rootPath);
  const script = recoveryScript ?? readFileSync(join(root, 'scripts', 'ci', 'postgres-recovery-smoke.sh'), 'utf8');
  const sources = applicationTexts ?? [
    ...filesBelow(join(root, 'apps')),
    ...filesBelow(join(root, 'supabase', 'migrations')),
  ].map(path => readFileSync(path, 'utf8'));
  const violations = [];

  const exactMarkers = [
    `P3_RECOVERY_ROWS=${contract.representativeRows}`,
    `P3_LOCK_TIMEOUT_MS=${contract.lockTimeoutMs}`,
    `P3_CI_RTO_BUDGET_MS=${contract.ciRecoveryBudgetMs}`,
    'p3_recovery_load_fixture',
    'generate_series(1,:p3_recovery_rows)',
    'p3_recovery_lock_timeout_not_enforced',
    'sabora-corrupt-recovery.dump',
    '--section=pre-data',
    'p3_interrupted_recovery_target_not_recreated',
    'p3_clean_cluster_load_fingerprint_mismatch',
    'sabora_p3_recovery_metrics:',
  ];
  for (const marker of exactMarkers) if (!script.includes(marker)) {
    violations.push(`recovery_contract_marker_missing:${marker}`);
  }
  if (!script.includes('docker run -d --name "$clean_container" --network none')) {
    violations.push('clean_recovery_cluster_not_network_isolated');
  }
  if (!script.includes('pg_dump -U postgres -d postgres -Fc --schema=sabora')) {
    violations.push('sabora_only_archive_missing');
  }
  if (!/interrupted_old_oid[\s\S]+dropdb[\s\S]+createdb[\s\S]+interrupted_new_oid/.test(script)) {
    violations.push('ambiguous_restore_target_not_discarded');
  }
  if (/DATABASE_URL|SUPABASE_URL|PROJECT_REF|--force/.test(script)) {
    violations.push('recovery_harness_external_target_surface');
  }
  if (contract.productionRto !== null || contract.productionRpo !== null || contract.pitr.operationallyVerified !== false) {
    violations.push('unverified_production_recovery_claim');
  }
  if (contract.storage.approvedFlowDependency !== false || contract.storage.databaseBackupIncludesObjectBytes !== false) {
    violations.push('invalid_storage_recovery_assumption');
  }
  const storageDependency = /\bstorage\.(?:objects|buckets)\b|\.storage\.from\s*\(|\bsupabase\.storage\b/i;
  if (sources.some(text => storageDependency.test(text))) violations.push('untracked_storage_dependency');

  return Object.freeze([...new Set(violations)]);
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const violations = inspectRecoveryContinuity(root);
  if (violations.length) {
    process.stderr.write(`recovery_continuity_gate_failed:${violations.join(',')}\n`);
    process.exitCode = 1;
  } else process.stdout.write('recovery_continuity_gate_ok\n');
}
