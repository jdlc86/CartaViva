import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SABORA_COMPOSE_SCOPE = Object.freeze({
  project: 'sabora',
  file: 'deploy/compose.sabora.yml',
  service: 'api',
  stopTimeoutSeconds: 20,
});

const exact = (actual, expected) =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

export function isolatedComposeCommand(operation) {
  const prefix = [
    'docker', 'compose', '--project-name', SABORA_COMPOSE_SCOPE.project,
    '--file', SABORA_COMPOSE_SCOPE.file,
  ];
  const commands = {
    validate: [...prefix, 'config', '--quiet'],
    build: [...prefix, 'build', SABORA_COMPOSE_SCOPE.service],
    start: [...prefix, 'up', '--detach', '--no-deps', '--wait', SABORA_COMPOSE_SCOPE.service],
    status: [...prefix, 'ps', SABORA_COMPOSE_SCOPE.service],
    logs: [...prefix, 'logs', '--no-color', '--tail', '200', SABORA_COMPOSE_SCOPE.service],
    stop: [...prefix, 'stop', '--timeout', String(SABORA_COMPOSE_SCOPE.stopTimeoutSeconds), SABORA_COMPOSE_SCOPE.service],
    remove: [...prefix, 'rm', '--stop', '--force', SABORA_COMPOSE_SCOPE.service],
  };
  if (!Object.hasOwn(commands, operation)) throw new Error('unsupported_sabora_compose_operation');
  return Object.freeze(commands[operation]);
}

export function isExactIsolatedComposeCommand(command) {
  if (!Array.isArray(command) || command.some(token => typeof token !== 'string' || !token)) return false;
  return ['validate', 'build', 'start', 'status', 'logs', 'stop', 'remove']
    .some(operation => exact(command, isolatedComposeCommand(operation)));
}

export function inspectDeploymentIsolation(rootPath) {
  const root = resolve(rootPath);
  const compose = readFileSync(resolve(root, SABORA_COMPOSE_SCOPE.file), 'utf8');
  const dockerfile = readFileSync(resolve(root, 'deploy/Dockerfile.api'), 'utf8');
  const violations = [];
  const requireMatch = (value, pattern, code) => { if (!pattern.test(value)) violations.push(code); };
  const forbidMatch = (value, pattern, code) => { if (pattern.test(value)) violations.push(code); };

  requireMatch(compose, /^name:\s*sabora\s*$/m, 'project_name_not_sabora');
  requireMatch(compose, /^\s{2}api:\s*$/m, 'api_service_missing');
  requireMatch(compose, /SABORA_API_MODE:\s*health-only/, 'api_mode_not_health_only');
  requireMatch(compose, /restart:\s*["']?no["']?/, 'automatic_restart_enabled');
  requireMatch(compose, /stop_signal:\s*SIGTERM/, 'stop_signal_not_sigterm');
  requireMatch(compose, /stop_grace_period:\s*20s/, 'stop_grace_period_missing');
  requireMatch(compose, /127\.0\.0\.1:4100:4100/, 'port_not_loopback_scoped');
  requireMatch(compose, /networks:\s*\[sabora_private\]/, 'service_network_not_private');
  requireMatch(compose, /^\s{2}sabora_private:\s*$[\s\S]*?^\s{4}internal:\s*true\s*$/m, 'network_not_internal');
  requireMatch(compose, /read_only:\s*true/, 'filesystem_not_read_only');
  requireMatch(compose, /tmpfs:\s*\[\/tmp\]/, 'temporary_storage_not_ephemeral');
  requireMatch(compose, /security_opt:\s*\[no-new-privileges:true\]/, 'new_privileges_not_blocked');
  requireMatch(compose, /cap_drop:\s*\[ALL\]/, 'capabilities_not_dropped');
  requireMatch(compose, /mem_limit:\s*256m/, 'memory_limit_missing');
  requireMatch(compose, /cpus:\s*0\.5/, 'cpu_limit_missing');
  requireMatch(compose, /pids_limit:\s*100/, 'pid_limit_missing');
  requireMatch(compose, /healthcheck:[\s\S]*127\.0\.0\.1:4100\/health[\s\S]*retries:\s*3/, 'healthcheck_incomplete');
  requireMatch(compose, /max-size:\s*["']10m["'][\s\S]*max-file:\s*["']3["']/, 'log_rotation_missing');
  requireMatch(dockerfile, /^USER\s+sabora\s*$/m, 'container_user_not_sabora');

  forbidMatch(compose, /^\s*(?:volumes|secrets|configs):\s*$/m, 'persistent_or_external_mount_declared');
  forbidMatch(compose, /(?:external:\s*true|network_mode:\s*host|ipc:\s*host|pid:\s*host|privileged:\s*true)/i, 'shared_namespace_or_privilege');
  forbidMatch(compose, /(?:container_name:|env_file:|\/var\/run\/docker\.sock|fleetia)/i, 'shared_resource_or_foreign_reference');
  forbidMatch(compose, /^\s{4}(?!127\.0\.0\.1:)["']?\d+(?::\d+)?["']?\s*$/m, 'non_loopback_port');
  forbidMatch(compose, /SABORA_[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|PRIVATE|KEY|CA_PEM)/, 'runtime_secret_in_compose');
  forbidMatch(dockerfile, /\bUSER\s+(?:root|0)\b/i, 'runtime_root_user');

  return Object.freeze([...new Set(violations)]);
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const violations = inspectDeploymentIsolation(root);
  if (violations.length) {
    process.stderr.write(`deployment_isolation_gate_failed:${violations.join(',')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('deployment_isolation_gate_ok\n');
  }
}
