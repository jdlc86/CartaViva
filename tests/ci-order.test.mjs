import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
test('lockfile gate precedes Corepack initialization', () => {
 const guard = ci.indexOf('name: Require genuine pnpm lockfile');
 const setup = ci.indexOf('uses: actions/setup-node@v4');
 assert.ok(guard >= 0 && setup > guard);
});
