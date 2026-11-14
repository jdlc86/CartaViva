import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectOperationalDeploymentIsolation,OPERATIONAL_COMPOSE}
 from '../scripts/ci/operational-deployment-isolation-contract.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=readFileSync(new URL('../'+OPERATIONAL_COMPOSE,import.meta.url),'utf8');
const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');

test('operational candidate requires an independently filtered outbound network',()=>{
 assert.deepEqual(inspectOperationalDeploymentIsolation(root),[]);
});

test('CI can render the fail-closed external egress network without provisioning it',()=>{
 assert.match(ci,/SABORA_EGRESS_ALLOWLIST_NETWORK: sabora-ci-preprovisioned-egress-unavailable/);
 assert.match(ci,/docker compose --project-name sabora --file deploy\/compose\.sabora-operational\.yml config --quiet/);
});

test('operational isolation gate rejects API egress, broad exposure and weakened hardening',()=>{
 const cases=[
  [baseline.replace(/name: sabora\r?\nservices:/, 'name: shared-project\nservices:'),
   'operational_project_name_invalid'],
  [baseline.replace(/networks: \[sabora_runtime_internal\]\r?\n    volumes:/,
   'networks: [sabora_runtime_internal, sabora_egress_allowlisted]\n    volumes:'),'api_attached_to_outbound_network'],
  [baseline.replace('    networks: [sabora_runtime_internal]',
   "    ports: ['127.0.0.1:4100:4100']\n    networks: [sabora_runtime_internal]"),
   'api_exposes_host_port'],
  [baseline.replace('internal: true','external: true'),'runtime_network_not_internal'],
  [baseline.replace('external: true','external: false'),
   'independent_egress_enforcement_boundary_missing'],
  [baseline.replace('${SABORA_EGRESS_ALLOWLIST_NETWORK:?pre-provisioned filtered Sabora egress network required}',
   'unrestricted-default'),'independent_egress_enforcement_boundary_missing'],
  [baseline.replace('cap_drop: [ALL]','privileged: true'),'capabilities_not_dropped:api'],
  [baseline.replace('SABORA_OPERATIONAL_MANIFEST_FILE: /run/sabora/activation.json',
   'SABORA_HMAC: unsafe'),'manifest_file_injection_missing'],
  [baseline.replace('SABORA_OPERATIONAL_EGRESS_POLICY_FILE: /run/sabora/egress-policy.json',
   'SABORA_OPERATIONAL_EGRESS_POLICY_FILE: /tmp/other-policy.json'),
   'api_egress_policy_injection_missing'],
  [baseline.replace('source: ${SABORA_EGRESS_POLICY_FILE:?absolute egress policy path required}',
   'source: /tmp/policy-not-shared.json'),'egress_policy_shared_bind_missing:api'],
 ];
 for(const [compose,expected] of cases)
  assert.ok(inspectOperationalDeploymentIsolation(root,{composeText:compose}).includes(expected),expected);
});
