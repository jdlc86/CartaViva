import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiApp} from './server.mjs';
import {readApiRuntimeConfig} from './api-runtime-config.mjs';
import {evaluatePilotActivation, PILOT_ACTIVATION_REQUIREMENTS} from './pilot-activation-gate.mjs';

test('pilot readiness evidence never implicitly mounts customer or staff routes', async () => {
 const allEvidence = Object.fromEntries(PILOT_ACTIVATION_REQUIREMENTS.map(key => [key, true]));
 assert.equal(evaluatePilotActivation(allEvidence).ready, true);
 const app = createApiApp();
 try {
   await app.ready();
   assert.equal(app.hasRoute({method:'GET',url:'/health'}), true);
   assert.equal(app.hasRoute({method:'GET',url:'/ready'}), true);
   for (const [method,url] of [
     ['POST','/api/v1/customer/orders'],
     ['GET','/api/v1/operations/order-lines'],
     ['POST','/api/v1/customer/register']
   ]) assert.equal(app.hasRoute({method,url}), false, url);
   const response = await app.inject({method:'GET',url:'/ready'});
   assert.equal(response.statusCode,200);
   assert.equal(response.json().mode,'health-only');
 } finally { await app.close(); }
});

test('production cannot bypass dormant compositions through environment flags', () => {
 for (const mode of ['pilot','operational','full','customer']) {
   assert.throws(() => readApiRuntimeConfig({
     NODE_ENV:'production',SABORA_API_HOST:'127.0.0.1',
     SABORA_API_PORT:'4100',SABORA_API_MODE:mode
   }), /invalid_api_runtime_config/);
 }
});
