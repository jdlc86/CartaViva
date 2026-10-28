#!/usr/bin/env node
// Static candidate gate only: never contacts Supabase, Docker or the VPS.
import {readFileSync, existsSync} from 'node:fs';
import {resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REQUIRED_ARTIFACTS = Object.freeze([
  'docs/REQUISITOS_FUNCIONALES.md',
  'docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md',
  'docs/security/SABORA_STAFF_DIRECTORY_READ_CONTRACT_V1.md',
  'docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md',
  'supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql',
  'supabase/migrations/20261027190334_sabora_pickup_claim_cancel_candidate.sql',
  'supabase/migrations/20261027225805_sabora_staff_display_id_candidate.sql',
  'supabase/migrations/20261028120000_sabora_staff_directory_read_candidate.sql',
]);
const RUNBOOK = 'docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md';
const UNSAFE_COMMANDS = [
  /\bdocker\s+(?:system|volume|network|image|container)\s+prune\b/i,
  /\bdocker\s+(?:compose\s+)?(?:down|restart)\b/i,
  /\bsystemctl\s+(?:restart|stop)\s+docker\b/i,
  /\bsupabase\s+(?:db\s+push|migration\s+up)\b/i,
];
export function inspectActivationReadiness({
  root, files = REQUIRED_ARTIFACTS, exists = existsSync,
  read = path => readFileSync(path, 'utf8'),
} = {}) {
  if (typeof root !== 'string' || !root.trim()) throw Error('invalid_readiness_root');
  const base = resolve(root);
  const errors = [];
  for (const file of files) {
    if (typeof file !== 'string' || !file || isAbsolute(file) ||
        relative(base, resolve(base, file)).startsWith('..')) {
      errors.push('Invalid artifact path');
      continue;
    }
    const path = resolve(base, file);
    if (!exists(path)) { errors.push(`Missing required artifact: ${file}`); continue; }
    if (file.startsWith('supabase/migrations/')) {
      try {
        if (!read(path).trim()) errors.push(`Empty migration: ${file}`);
      } catch {
        errors.push(`Unreadable migration: ${file}`);
      }
    }
  }
  const runbookPath = resolve(base, RUNBOOK);
  if (!exists(runbookPath)) {
    if (!errors.includes(`Missing required artifact: ${RUNBOOK}`)) {
      errors.push(`Missing required artifact: ${RUNBOOK}`);
    }
  } else {
    try {
      const runbook = read(runbookPath);
      if (!/Fleetia/i.test(runbook) || !/autorizaci[oó]n/i.test(runbook)) {
        errors.push('Runbook missing isolation or authorization gate');
      }
      const blocks = [...runbook.matchAll(/```(?:bash|sh|shell)\s*\n([\s\S]*?)```/g)].map(match => match[1]);
      for (const [index, pattern] of UNSAFE_COMMANDS.entries()) {
        if (blocks.some(block => pattern.test(block))) {
          errors.push(`Unsafe shell example in runbook (rule ${index + 1})`);
        }
      }
    } catch {
      errors.push('Unreadable runbook');
    }
  }
  return Object.freeze({ok: errors.length === 0, errors, requiredCount: files.length});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectActivationReadiness({root: process.argv[2] ?? '.'});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
