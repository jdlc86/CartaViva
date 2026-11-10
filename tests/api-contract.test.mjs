import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const api = readFileSync(new URL('apps/api/src/server.mjs', root), 'utf8');
test('API exposes isolated health and readiness endpoints', () => {
  assert.match(api, /app\.get\('\/health'/);
  assert.match(api, /app\.get\('\/ready'/);
  assert.match(api, /trustProxy:\s*false/);
});
test('API deployment binds only to Sabora loopback port', () => {
  const compose = readFileSync(new URL('deploy/compose.sabora.yml', root), 'utf8');
  assert.match(compose, /127\.0\.0\.1:4100:4100/);
  assert.match(compose, /name:\s*sabora/);
  assert.match(compose, /sabora_private/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /no-new-privileges:true/);
});
