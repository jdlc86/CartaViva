import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectOperationalDeploymentIsolation,OPERATIONAL_COMPOSE}
 from '../scripts/ci/operational-deployment-isolation-contract.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=readFileSync(new URL('../'+OPERATIONAL_COMPOSE,import.meta.url),'utf8');

test('operational candidate gives only the gateway an outbound bridge',()=>{
 assert.deepEqual(inspectOperationalDeploymentIsolation(root),[]);
});

test('operational isolation gate rejects API egress, broad exposure and weakened hardening',()=>{
 const cases=[
  [baseline.replace('networks: [sabora_runtime_internal]\n    volumes:',
   'networks: [sabora_runtime_internal, sabora_egress_outbound]\n    volumes:'),'api_attached_to_outbound_network'],
  [baseline.replace("ports: ['127.0.0.1:4100:4100']","ports: ['4100:4100']"),'operational_port_not_loopback'],
  [baseline.replace('internal: true','external: true'),'runtime_network_not_internal'],
  [baseline.replace('cap_drop: [ALL]','privileged: true'),'capabilities_not_dropped:api'],
  [baseline.replace('SABORA_OPERATIONAL_MANIFEST_FILE: /run/sabora/activation.json',
   'SABORA_HMAC: unsafe'),'manifest_file_injection_missing'],
 ];
 for(const [compose,expected] of cases)
  assert.ok(inspectOperationalDeploymentIsolation(root,{composeText:compose}).includes(expected),expected);
});
