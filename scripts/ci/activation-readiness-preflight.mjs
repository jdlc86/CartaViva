#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS = [
  '20261027122858_sabora_h6_events_payments_operations_candidate.sql',
  '20261027190334_sabora_pickup_claim_cancel_candidate.sql',
  '20261027225805_sabora_staff_display_id_candidate.sql',
  '20261028120000_sabora_staff_directory_read_candidate.sql',
];
const REQUIRED = [
  'docs/REQUISITOS_FUNCIONALES.md',
  'docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md',
  'docs/security/SABORA_STAFF_DIRECTORY_READ_CONTRACT_V1.md',
  'docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md',
  ...MIGRATIONS.map(name => `supabase/migrations/${name}`),
];
const DANGEROUS = [
  /\bdocker\s+(?:system|volume|network|image|container)\s+prune\b/i,
  /\bdocker\s+(?:compose\s+)?(?:down|restart)\b/i,
  /\bsystemctl\s+(?:restart|stop)\s+docker\b/i,
  /\b(?:supabase\s+db\s+push|supabase\s+migration\s+up)\b/i,
];
export function inspectReadiness({ root, files = REQUIRED, read = path => readFileSync(path, 'utf8'), exists = existsSync }) {
  const errors = [];
  for (const file of files) {
    const full = resolve(root, file);
    if (!exists(full)) { errors.push(`Missing required artifact: ${file}`); continue; }
    if (file.startsWith('supabase/migrations/') && !read(full).trim()) errors.push(`Empty migration: ${file}`);
  }
  const runbookPath = resolve(root, 'docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md');
  if (exists(runbookPath)) {
    const runbook = read(runbookPath);
    const blocks = [...runbook.matchAll(/```(?:bash|sh|shell)\s*\n([\s\S]*?)```/g)].map(m => m[1]);
    for (const [index, expression] of DANGEROUS.entries()) {
      if (blocks.some(block => expression.test(block))) errors.push(`Unsafe executable example in runbook (rule ${index + 1})`);
    }
    if (!/Fleetia/i.test(runbook) || !/autorizaci[oó]n/i.test(runbook)) errors.push('Runbook missing isolation or approval gate');
  }
  return { ok: errors.length === 0, errors, requiredCount: files.length };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const result = inspectReadiness({ root: resolve(process.argv[2] || '.') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
