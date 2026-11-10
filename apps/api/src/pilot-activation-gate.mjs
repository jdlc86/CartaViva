// Fail-closed activation gate for the Sabora pilot. No environment reads,
// network connections, container operations or route registration.
const REQUIRED = Object.freeze([
  'normativeConformance', 'customerFlow', 'staffOperations',
  'sqlLeastPrivilege', 'secretsProvisioned', 'vpsIsolationVerified',
  'backupRestoreVerified', 'observabilityReady', 'rollbackVerified',
  'deploymentAuthorized'
]);

export const PILOT_ACTIVATION_REQUIREMENTS = REQUIRED;

export function evaluatePilotActivation(evidence = {}) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw Error('invalid_pilot_evidence');
  }
  const missing = REQUIRED.filter(key => evidence[key] !== true);
  return Object.freeze({
    ready: missing.length === 0,
    missing: Object.freeze(missing),
    // No credentials, arbitrary evidence values or external identifiers are echoed.
    mode: missing.length === 0 ? 'eligible_for_controlled_activation' : 'blocked'
  });
}

export function assertPilotActivation(evidence) {
  const result = evaluatePilotActivation(evidence);
  if (!result.ready) throw Error('pilot_activation_blocked');
  return result;
}
