import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReadiness } from '../scripts/ci/activation-readiness-preflight.mjs';

const files = ['docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md', 'supabase/migrations/x.sql'];
const fixtures = () => new Map(files.map(f => [`/fake/${f}`, f.endsWith('.sql') ? 'select 1;' : 'Fleetia autorización']));
const run = contents => inspectReadiness({
  root: '/fake',
  files,
  exists: path => contents.has(path),
  read: path => contents.get(path),
});

test('activation preflight accepts complete safe fixtures', () => {
  assert.equal(run(fixtures()).ok, true);
});
test('activation preflight rejects missing migration', () => {
  const contents = fixtures();
  contents.delete('/fake/supabase/migrations/x.sql');
  assert.match(run(contents).errors.join(' '), /Missing required artifact/);
});
test('activation preflight rejects empty migration', () => {
  const contents = fixtures();
  contents.set('/fake/supabase/migrations/x.sql', ' ');
  assert.match(run(contents).errors.join(' '), /Empty migration/);
});
test('activation preflight rejects dangerous executable instructions', () => {
  const contents = fixtures();
  contents.set('/fake/docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md',
    'Fleetia autorización\n```bash\ndocker system prune\n```');
  assert.match(run(contents).errors.join(' '), /Unsafe executable example/);
});
test('activation preflight requires isolation and approval language', () => {
  const contents = fixtures();
  contents.set('/fake/docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md', 'generic plan');
  assert.match(run(contents).errors.join(' '), /missing isolation or approval/);
});

test('repository activation artifacts satisfy static preflight', () => {
  const result = inspectReadiness({ root: new URL('..', import.meta.url).pathname });
  assert.deepEqual(result.errors, [], result.errors.join('; '));
});

// A missing runbook must never be accepted as an activation-ready candidate.
test('activation preflight rejects absent runbook', () => {
  const contents = fixtures();
  contents.delete('/fake/docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md');
  assert.equal(run(contents).ok, false);
});
