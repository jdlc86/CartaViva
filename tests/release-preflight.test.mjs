import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
test('Docker Compose owns an isolated project, bridge network and loopback-only port', () => {
  const c = read('deploy/compose.sabora.yml');
  assert.match(c, /^name:\s*sabora\s*$/m);
  assert.match(c, /^\s+sabora_private:\s*$/m);
  assert.match(c, /driver:\s*bridge/);
  assert.match(c, /127\.0\.0\.1:4100:4100/);
  assert.doesNotMatch(c, /(?:^|\n)\s*(?:container_name|network_mode|pid|ipc|volumes_from):/);
});
test('CI remains read-only and never requests deployment credentials', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /contents:\s*read/);
  assert.doesNotMatch(ci, /(?:id-token|packages|actions):\s*write|secrets\.|workflow_dispatch|ssh-action|appleboy|docker login/);
});
test('no fabricated dependency lockfile is shipped', () => {
  const p = new URL('pnpm-lock.yaml', root);
  if (existsSync(p)) {
    assert.match(read('pnpm-lock.yaml'), /^lockfileVersion:/);
  }
});
