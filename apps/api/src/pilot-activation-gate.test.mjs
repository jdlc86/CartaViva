import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePilotActivation, assertPilotActivation, PILOT_ACTIVATION_REQUIREMENTS} from './pilot-activation-gate.mjs';

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
});

test('pilot activation does not expose supplied secret-like evidence', () => {
 const result = evaluatePilotActivation({secret: 'sensitive', deploymentAuthorized: false});
 assert.equal(JSON.stringify(result).includes('sensitive'), false);
 assert.equal(Object.isFrozen(result.missing), true);
 assert.throws(() => evaluatePilotActivation(null), /invalid_pilot_evidence/);
 assert.throws(() => evaluatePilotActivation([]), /invalid_pilot_evidence/);
});
