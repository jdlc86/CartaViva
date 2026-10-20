import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');

test('unauthenticated Sabora API exposes only health and readiness', () => {
  const registered = [...server.matchAll(/\bapp\.(?:get|post|put|patch|delete|all|route)\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(match => match[1]);
  assert.deepEqual(registered.sort(), ['/health', '/ready']);
  assert.doesNotMatch(server, /\bapp\.register\s*\(/, 'plugin routes need an explicit auth boundary review');
  assert.doesNotMatch(server, /\bapp\.route\s*\(/, 'route objects need an explicit auth boundary review');
});

test('in-memory domain is not wired to a public operation endpoint', () => {
  assert.match(server, /createRestaurantStore\(\)/);
  assert.doesNotMatch(server, /\b(?:confirmOrder|transitionOrder|assignMember|rotateQr)\s*\(/);
});
