import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const compose = readFileSync(new URL('deploy/compose.sabora.yml', root), 'utf8');
const ci = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');
test('Sabora has no privileged, host-network, shared-volume or global Docker controls', () => {
  assert.doesNotMatch(compose, /privileged:\s*true|network_mode:\s*host|\/var\/run\/docker\.sock|external:\s*true|\/opt\/fleetia|\/etc\/fleetia/i);
  assert.match(compose, /mem_limit:\s*256m/);
  assert.match(compose, /cpus:\s*0\.5/);
});
test('CI uses deterministic pnpm and does not deploy automatically', () => {
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.doesNotMatch(ci, /docker\s+(?:compose\s+(?:up|down|restart)|stack\s+deploy)|ssh\s|production-deploy|deploy-hook/i);
});
test('API image uses pnpm with a committed lockfile and excludes sensitive build context', () => {
  const dockerfile = readFileSync(new URL('deploy/Dockerfile.api', root), 'utf8');
  const ignore = readFileSync(new URL('.dockerignore', root), 'utf8');
  assert.match(dockerfile, /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml/);
  assert.match(dockerfile, /RUN pnpm install --frozen-lockfile/);
  assert.doesNotMatch(dockerfile, /RUN npm install|COPY \. \.|COPY \/opt\/fleetia/);
  for (const pattern of ['.git', 'node_modules', '.env', '*.pem', '*.key']) {
    assert.ok(ignore.split(/\r?\n/).includes(pattern), `missing ignore: ${pattern}`);
  }
});
test('Sabora runtime has process limits, reduced privileges, bounded logs and healthcheck', () => {
  assert.match(compose, /pids_limit:\s*100/);
  assert.match(compose, /cap_drop:\s*\[ALL\]/);
  assert.match(compose, /max-size:\s*"10m"/);
  assert.match(compose, /max-file:\s*"3"/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /127\.0\.0\.1:4100\/health/);
});
