import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {planRelease,stableStringify,verifyReleaseAuthorization,verifyGithubChecks,
 SABORA_RELEASE_SCOPE,EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';

const fullSha='a'.repeat(40);
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({format:'pem',type:'spki'});
const now=Date.parse('2026-11-14T09:00:00.000Z');
function approval(overrides={}){
 return {schema:'sabora-governed-release/v1',repository:'jdlc86/CartaViva',
  operation:'deploy',releaseSha:fullSha,authorizationId:'SABORA-RELEASE-20261114',
  approvedAt:'2026-11-14T08:45:00.000Z',expiresAt:'2026-11-14T09:45:00.000Z',
  server:'146.59.145.64',project:'sabora',port:8443,
  bundleManifestSha256:'9'.repeat(64),
  origins:[...SABORA_RELEASE_SCOPE.origins],services:[...SABORA_RELEASE_SCOPE.services],
  evidence:Object.fromEntries(EVIDENCE_KEYS.map((k,i)=>[k,(i+1).toString(16).repeat(64)])),...overrides};
}
function signed(value){const raw=stableStringify(value);return [raw,sign(null,Buffer.from(raw),privateKey).toString('base64')];}
function verify(value){const [raw,sig]=signed(value);return verifyReleaseAuthorization(raw,sig,pub,{operation:'deploy',sha:fullSha},now);}

test('complete governed Sabora release: plan scope, signed attestations, immutable actions and negatives',async()=>{
 const plan=planRelease('deploy',fullSha);
 assert.equal(plan.automaticallyAuthorized,false);
 assert.equal(plan.serverChanged,false);
 assert.deepEqual(plan.scope.services,['sabora-egress','api','web']);
 assert.deepEqual(plan.scope.origins,SABORA_RELEASE_SCOPE.origins);
 assert.equal(plan.scope.port,8443);
 const receipt=verify(approval());
 assert.equal(receipt.releaseSha,fullSha);
 assert.equal(receipt.authorizationId,'SABORA-RELEASE-20261114');
 assert.match(receipt.authorizationSha256,/^[0-9a-f]{64}$/);
 for(const candidate of [
  approval({server:'other.example.com'}),approval({project:'fleetia'}),
  approval({port:443}),approval({bundleManifestSha256:'0'.repeat(64)}),
  approval({releaseSha:'c'.repeat(40)}),
  approval({operation:'rollback'}),approval({origins:['https://fake.test']}),
  approval({services:['web','api','other']}),approval({expiresAt:'2026-11-14T08:00:00.000Z'}),
  approval({approvedAt:'2026-11-14T09:05:00.000Z'}),
  approval({evidence:{...approval().evidence,externalRestoreSha256:'0'.repeat(64)}}),
  approval({evidence:{...approval().evidence,ingressIsolationSha256:''}}),
  approval({evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,'f'.repeat(64)]))})
 ]) assert.throws(()=>verify(candidate),/sabora_release_stop:/);
 const [raw,sig]=signed(approval());
 assert.throws(()=>verifyReleaseAuthorization(raw,sig,pub,{operation:'rollback',sha:fullSha},now));
 assert.throws(()=>verifyReleaseAuthorization(raw,sig,generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}),{operation:'deploy',sha:fullSha},now));
 assert.throws(()=>verifyReleaseAuthorization(' '+raw,sig,pub,{operation:'deploy',sha:fullSha},now));
 assert.throws(()=>planRelease('remove',fullSha),/invalid_operation/);
 const good=['validate','web-publication','generate-lockfile','functional-ui-gate'].map(name=>({name,status:'completed',conclusion:'success',head_sha:fullSha}));
 const ok=async()=>({ok:true,json:async()=>({total_count:good.length,check_runs:good})});
 assert.equal((await verifyGithubChecks(fullSha,'test-token-for-ci-check',ok)).length,4);
 await assert.rejects(()=>verifyGithubChecks(fullSha,'test-token-for-ci-check',async()=>({ok:true,json:async()=>({total_count:3,check_runs:good.slice(1)})})),/ci_not_success:validate/);
 await assert.rejects(()=>verifyGithubChecks(fullSha,'test-token-for-ci-check',async()=>({ok:true,json:async()=>({total_count:4,check_runs:good.map(x=>x.name==='web-publication'?{...x,conclusion:'failure'}:x)})})),/ci_not_success:web-publication/);
});

test('release workflow requires explicit dispatch, signed gate, forced host identity, no auto deployment',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/sabora-governed-deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^  push:|^  pull_request:|^  schedule:|pull_request_target:/m);
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/git merge-base --is-ancestor/);
 assert.match(workflow,/git rev-parse HEAD/);
 assert.match(workflow,/if \[\[ "\$RELEASE_OPERATION" == deploy \]\]; then/);
 assert.match(workflow,/test "\$RELEASE_SHA" = "\$GITHUB_SHA"/);
 assert.match(workflow,/host ledger independently proves prior deployment/);
 assert.match(workflow,/git rev-parse origin\/main/);
 assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/environment: sabora-live/);
 assert.match(workflow,/sabora-release-governor\.mjs authorize/);
 assert.match(workflow,/sabora-release-artifact\.mjs/);
 assert.match(workflow,/actions\/download-artifact@v4/);
 assert.match(workflow,/sabora-release-transport\.mjs/);
 assert.match(workflow,/sabora-release-rollback-request\.mjs/);
 assert.match(workflow,/if: inputs.operation == 'deploy'/);
 assert.match(workflow,/SABORA_RELEASE_AGENT_READY/);
 assert.match(workflow,/StrictHostKeyChecking=yes/);
 assert.match(workflow,/SABORA_APPROVAL_JSON_B64/);
 assert.match(workflow,/SABORA_APPROVAL_SIG_B64/);
 const transport=readFileSync(new URL('../scripts/ci/sabora-release-transport.mjs',import.meta.url),'utf8');
 assert.match(transport,/approvalB64/);
 assert.match(transport,/signatureB64/);
 assert.match(workflow,/GITHUB_RUN_ID/);
 assert.match(workflow,/sabora-release@146\.59\.145\.64/);
 assert.doesNotMatch(workflow,/docker (?:compose|run|stop|restart|rm)|prune|systemctl|sudo /);
 assert.doesNotMatch(workflow,/ssh\s+[^\n]*ubuntu@|root@146\.59/);
});

import {checkIngressAddressSpace,renderIngressFilter,INGRESS_SPEC}
 from '../scripts/ci/sabora-ingress-network-policy.mjs';

test('Sabora ingress filter is scoped to a dedicated bridge and Cloudflare sources only',()=>{
 const preflight=checkIngressAddressSpace([
  {dst:'default'},{dst:'172.17.0.0/16'},{dst:'172.18.0.0/16'},
  {dst:'146.59.144.1'}]);
 assert.equal(preflight.overlap,false);
 assert.equal(preflight.candidateCidr,'172.28.240.0/24');
 assert.throws(()=>checkIngressAddressSpace([{dst:'172.28.0.0/16'}]),/existing_route_overlaps/);
 assert.throws(()=>checkIngressAddressSpace([],'172.18.0.0/16'),/unapproved_network/);
 const nft=renderIngressFilter({
   bridge:'br-0123456789ab',
   cloudflareIpv4Cidrs:['173.245.48.0/20','103.21.244.0/22']});
 assert.match(nft,/table inet sabora_ingress_guard/);
 assert.match(nft,/oifname "br-0123456789ab" ct state new drop/);
 assert.match(nft,/iifname "br-0123456789ab" ct state new drop/);
 assert.match(nft,/ip saddr @cf4/);
 assert.doesNotMatch(nft,/flush ruleset|docker0|fleetia|chain INPUT|chain FORWARD/);
 assert.throws(()=>renderIngressFilter({bridge:'docker0',cloudflareIpv4Cidrs:['0.0.0.0/0','10.0.0.0/8']}),/invalid_bridge/);
 assert.throws(()=>renderIngressFilter({bridge:'br-0123456789ab',cloudflareIpv4Cidrs:['0.0.0.0/0','10.0.0.0/8']}),/unrestricted_cloudflare/);
 assert.equal(INGRESS_SPEC.port,8443);
});
