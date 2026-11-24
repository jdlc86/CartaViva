import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePilotActivation, assertPilotActivation, assertFirstTestActivation, PILOT_ACTIVATION_REQUIREMENTS} from './pilot-activation-gate.mjs';

test('pilot activation fails closed without operational evidence', () => {
 const result = evaluatePilotActivation();
 assert.equal(result.ready, false);
 assert.equal(result.mode, 'blocked');
 assert.deepEqual(result.missing, PILOT_ACTIVATION_REQUIREMENTS);
 assert.throws(() => assertPilotActivation({}), /pilot_activation_blocked/);
});

test('pilot activation requires every gate to be explicitly true', () => {
 const evidence = Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(key => [key, true]));
 for (const key of PILOT_ACTIVATION_REQUIREMENTS) {
   const bad = {...evidence, [key]: 'true'};
   assert.equal(evaluatePilotActivation(bad).ready, false, key);
   assert.deepEqual(evaluatePilotActivation(bad).missing, [key]);
 }
 assert.equal(assertPilotActivation(evidence).ready, true);
 assert.equal(assertPilotActivation(evidence).mode, 'self_reported_evidence_complete_unverified');
});

test('full pilot readiness includes migration, two PWA, TLS/egress, signed identity and delivered alerts', () => {
 const essential=['twoPwasValidated','migrationChecksumsVerified','jwtHmacIdentityVerified',
  'tlsAndEgressVerified','alertDeliveryVerified','operationalBootstrapVerified'];
 for(const required of essential)assert.ok(PILOT_ACTIVATION_REQUIREMENTS.includes(required));
 const partial=Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(key=>[key,true]));
 for(const required of essential){
  assert.equal(evaluatePilotActivation({...partial,[required]:false}).ready,false);
 }
});

test('pilot activation does not expose supplied secret-like evidence', () => {
 const result = evaluatePilotActivation({secret: 'sensitive', deploymentAuthorized: false});
 assert.equal(JSON.stringify(result).includes('sensitive'), false);
 assert.equal(Object.isFrozen(result.missing), true);
 assert.throws(() => evaluatePilotActivation(null), /invalid_pilot_evidence/);
 assert.throws(() => evaluatePilotActivation([]), /invalid_pilot_evidence/);
});

test('S46/V2 admits only an explicit first fictitious scope without certifying recovery',()=>{
 const scope={"mode":"deferred-first-test-activation","testDataOnly":true,"realUsersAllowed":false,"backupPerformed":false,"restorePerformed":false};
 const evidence={...Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(key=>[key,true])),
  backupRestoreVerified:false,rollbackVerified:false};
 const admission=assertFirstTestActivation(evidence,scope);
 assert.equal(admission.mode,'first_test_activation_admission_unverified');
 assert.deepEqual(admission.deferred,['backupRestoreVerified','rollbackVerified']);
 assert.throws(()=>assertPilotActivation(evidence),/pilot_activation_blocked/);
 for(const key of PILOT_ACTIVATION_REQUIREMENTS){
  assert.throws(()=>assertFirstTestActivation({...evidence,[key]:!evidence[key]},scope),
   /pilot_first_test_activation_blocked/,key);
 }
 for(const change of [{realUsersAllowed:true},{testDataOnly:false},{backupPerformed:true},
  {restorePerformed:true},{mode:'ordinary'},{extra:true}]){
  assert.throws(()=>assertFirstTestActivation(evidence,{...scope,...change}),/pilot_first_test_activation_blocked/);
 }
 assert.throws(()=>assertFirstTestActivation(evidence,undefined),/pilot_first_test_activation_blocked/);
});
