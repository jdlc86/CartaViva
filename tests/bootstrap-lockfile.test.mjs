import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/bootstrap-lockfile.yml',import.meta.url),'utf8');
test('bootstrap is manual, PR-triggered and scoped to same-repo lockfile commits',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/contents:\s*read/);
 assert.doesNotMatch(workflow,/\b(?:ssh|scp|docker compose up|docker system prune|secrets\.)\b/i);
});
test('bootstrap generates, verifies and exports a genuine pnpm lockfile',()=>{
 assert.match(workflow,/pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile/);
 assert.match(workflow,/pnpm install --frozen-lockfile/);
 assert.match(workflow,/pnpm test/);
 assert.match(workflow,/pnpm build/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.match(workflow,/path: pnpm-lock.yaml/);
});
