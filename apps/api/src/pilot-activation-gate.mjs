// Fail-closed activation gate for the Sabora pilot. No environment reads,
// network connections, container operations or route registration.
// Exhaustive *claims* checklist, not an authority to deploy. Completion
// never overrides independent approvals or the protected production bootstrap.
const REQUIRED = Object.freeze([
  'normativeConformance', 'customerFlow', 'staffOperations',
  'twoPwasValidated', 'migrationChecksumsVerified', 'sqlLeastPrivilege',
  'secretsProvisioned', 'jwtHmacIdentityVerified', 'tlsAndEgressVerified',
  'vpsIsolationVerified', 'backupRestoreVerified', 'observabilityReady',
  'alertDeliveryVerified', 'rollbackVerified', 'operationalBootstrapVerified',
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
    mode: missing.length === 0 ? 'self_reported_evidence_complete_unverified' : 'blocked'
  });
}

export function assertPilotActivation(evidence) {
  const result = evaluatePilotActivation(evidence);
  if (!result.ready) throw Error('pilot_activation_blocked');
  return result;
}

// S46/V2: a separate admission scope, never ordinary pilot readiness.
// The protected controller admits this scope only for a first fictitious
// release. This declaration is not an access-control mechanism or evidence
// that backup, restore or rollback was performed.
const GENESIS_DEFERRED=Object.freeze(['backupRestoreVerified','rollbackVerified']);
const GENESIS_PENDING=Object.freeze(['twoPwasValidated','operationalBootstrapVerified']);
const GENESIS_SCOPE=Object.freeze({"mode":"deferred-first-test-activation","testDataOnly":true,"realUsersAllowed":false,"backupPerformed":false,"restorePerformed":false});
export function isFirstTestActivationScope(scope){
 return scope!==null&&typeof scope==='object'&&!Array.isArray(scope)&&
  Object.keys(scope).length===Object.keys(GENESIS_SCOPE).length&&
  Object.entries(GENESIS_SCOPE).every(([key,value])=>Object.hasOwn(scope,key)&&scope[key]===value);
}
export function assertFirstTestActivation(evidence,scope){
 if(!isFirstTestActivationScope(scope)||!evidence||typeof evidence!=='object'||Array.isArray(evidence)||
    !REQUIRED.every(key=>Object.hasOwn(evidence,key)&&
      evidence[key]===!(GENESIS_DEFERRED.includes(key)||GENESIS_PENDING.includes(key))))
  throw Error('pilot_first_test_activation_blocked');
 return Object.freeze({ready:true,missing:Object.freeze([]),deferred:GENESIS_DEFERRED,
  pendingAfterStart:GENESIS_PENDING,mode:'first_test_activation_admission_unverified'});
}
