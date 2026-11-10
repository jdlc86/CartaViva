import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SABORA_COMPOSE_SCOPE,
  inspectDeploymentIsolation,
  isolatedComposeCommand,
  isExactIsolatedComposeCommand,
} from '../scripts/ci/deployment-isolation-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Sabora deployment candidate is isolated and fail-closed', () => {
  assert.deepEqual(inspectDeploymentIsolation(root), []);
  assert.deepEqual(SABORA_COMPOSE_SCOPE, {
    project: 'sabora', file: 'deploy/compose.sabora.yml', service: 'api', stopTimeoutSeconds: 20,
  });
});

test('only exact service-scoped lifecycle commands are accepted', () => {
  const expected = {
    validate: ['config', '--quiet'],
    build: ['build', 'api'],
    start: ['up', '--detach', '--no-deps', '--wait', 'api'],
    status: ['ps', 'api'],
    logs: ['logs', '--no-color', '--tail', '200', 'api'],
    stop: ['stop', '--timeout', '20', 'api'],
    remove: ['rm', '--stop', '--force', 'api'],
  };
  for (const [operation, suffix] of Object.entries(expected)) {
    const command = isolatedComposeCommand(operation);
    assert.deepEqual(command, [
      'docker', 'compose', '--project-name', 'sabora', '--file', 'deploy/compose.sabora.yml', ...suffix,
    ]);
    assert.equal(isExactIsolatedComposeCommand(command), true);
    assert.ok(Object.isFrozen(command));
  }
  for (const command of [
    ['docker', 'compose', 'down'],
    ['docker', 'compose', '--project-name', 'sabora', '--file', 'deploy/compose.sabora.yml', 'stop'],
    ['docker', 'compose', '--project-name', 'fleetia', '--file', 'deploy/compose.sabora.yml', 'stop', 'api'],
    ['docker', 'system', 'prune'],
    ['docker', 'stop', '*'],
  ]) assert.equal(isExactIsolatedComposeCommand(command), false);
  assert.throws(() => isolatedComposeCommand('down'), /unsupported_sabora_compose_operation/);
});

test('gate detects shared resources and weakened lifecycle controls', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'sabora-p3-isolation-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  mkdirSync(join(fixture, 'deploy'), { recursive: true });
  writeFileSync(join(fixture, 'deploy/compose.sabora.yml'), readFileSync(join(root, 'deploy/compose.sabora.yml')));
  writeFileSync(join(fixture, 'deploy/Dockerfile.api'), readFileSync(join(root, 'deploy/Dockerfile.api')));
  assert.deepEqual(inspectDeploymentIsolation(fixture), []);

  const baseline = readFileSync(join(root, 'deploy/compose.sabora.yml'), 'utf8');
  const cases = [
    [baseline.replace('internal: true', 'external: true'), 'network_not_internal'],
    [baseline.replace("'127.0.0.1:4100:4100'", "'4100:4100'"), 'port_not_loopback_scoped'],
    [baseline.replace('restart: "no"', 'restart: always'), 'automatic_restart_enabled'],
    [baseline.replace('tmpfs: [/tmp]', 'volumes:\n      - shared:/data'), 'persistent_or_external_mount_declared'],
    [baseline.replace('cap_drop: [ALL]', 'privileged: true'), 'shared_namespace_or_privilege'],
    [baseline.replace('SABORA_API_MODE: health-only', 'SABORA_API_MODE: h6\n      SABORA_HMAC_KEY: unsafe'), 'api_mode_not_health_only'],
  ];
  for (const [compose, expected] of cases) {
    writeFileSync(join(fixture, 'deploy/compose.sabora.yml'), compose);
    assert.ok(inspectDeploymentIsolation(fixture).includes(expected), expected);
  }
});
