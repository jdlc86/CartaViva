import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifiedNtfsAclDigest} from '../scripts/ops/sabora-ntfs-acl-verifier.mjs';
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
 const good=['validate','web-publication','generate-lockfile','functional-ui-gate'].map(name=>({name,status:'completed',conclusion:'success',head_sha:fullSha,app:{slug:'github-actions'}}));
 const ok=async()=>({ok:true,json:async()=>({total_count:good.length,check_runs:good})});
 assert.equal((await verifyGithubChecks(fullSha,'test-token-for-ci-check',ok)).length,4);
 await assert.rejects(()=>verifyGithubChecks(fullSha,'test-token-for-ci-check',async()=>({ok:true,json:async()=>({total_count:3,check_runs:good.slice(1)})})),/ci_not_success:validate/);
 await assert.rejects(()=>verifyGithubChecks(fullSha,'test-token-for-ci-check',async()=>({ok:true,json:async()=>({total_count:4,check_runs:good.map(x=>x.name==='web-publication'?{...x,conclusion:'failure'}:x)})})),/ci_not_success:web-publication/);
 await assert.rejects(()=>verifyGithubChecks(fullSha,'test-token-for-ci-check',async()=>({ok:true,json:async()=>({total_count:4,check_runs:good.map(x=>x.name==='validate'?{...x,app:{slug:'untrusted-external-app'}}:x)})})),/ci_not_success:validate/);
});

test('release V2 requires owner Issue/manual authorization, exact SHA and forced SSH identity',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/sabora-governed-deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^  push:|^  pull_request:|^  schedule:|pull_request_target:/m);
 assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/git merge-base --is-ancestor/);
 assert.match(workflow,/git rev-parse HEAD/);
 assert.match(workflow,/if \[\[ "\$RELEASE_OPERATION" == deploy \]\]; then/);
 assert.match(workflow,/test "\$RELEASE_SHA" = "\$GITHUB_SHA"/);
 assert.match(workflow,/sabora-release-v2/);
 assert.match(workflow,/git rev-parse origin\/main/);
 assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/environment: sabora-live/);
 assert.match(workflow,/sabora-release-authorization-v2\.mjs create/);
 assert.match(workflow,/sabora-release-artifact\.mjs/);
 assert.match(workflow,/actions\/download-artifact@v4/);
 assert.match(workflow,/sabora-release-transport\.mjs/);
 assert.match(workflow,/sabora-release-rollback-request\.mjs/);
 assert.match(workflow,/if: inputs.operation == 'deploy'/);
 assert.match(workflow,/SABORA_RELEASE_AGENT_READY/);
 assert.match(workflow,/StrictHostKeyChecking=yes/);
 assert.doesNotMatch(workflow,/SABORA_APPROVAL_JSON_B64|SABORA_APPROVAL_SIG_B64/);
 assert.match(workflow,/SABORA_OWNER_VERIFIED/);
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

import {renderSaboraEgressGuard,EGRESS_SPEC}
 from '../scripts/ci/sabora-egress-network-policy.mjs';

test('Sabora-only ingress and egress policy compose two separate deny-by-default bridges in lab, with no global changes',()=>{
 const ingress=renderIngressFilter({
  bridge:'br-0123456789ab',
  cloudflareIpv4Cidrs:['173.245.48.0/20','103.21.244.0/22']});
 const egress=renderSaboraEgressGuard({
  bridge:'br-abcdef123456',
  allowlisted:[
   {cidr:'198.51.100.10/32',port:5432,protocol:'tcp'},
   {cidr:'203.0.113.20/32',port:443,protocol:'tcp'}]});
 assert.match(egress,/table inet sabora_egress_guard/);
 assert.match(egress,/iifname "br-abcdef123456" drop/);
 assert.match(egress,/tcp dport 5432 accept/);
 assert.match(egress,/tcp dport 443 accept/);
 assert.doesNotMatch(egress,/0\.0\.0\.0\/0|flush ruleset|chain INPUT|fleetia/i);
 assert.doesNotMatch(ingress,/br-abcdef123456/);
 assert.doesNotMatch(egress,/br-0123456789ab/);
 assert.equal(EGRESS_SPEC.project,'sabora');
 for(const candidate of [
  {bridge:'docker0',allowlisted:[{cidr:'0.0.0.0/0',port:5432,protocol:'tcp'},{cidr:'203.0.113.20/32',port:443,protocol:'tcp'}]},
  {bridge:'br-abcdef123456',allowlisted:[{cidr:'0.0.0.0/0',port:5432,protocol:'tcp'},{cidr:'203.0.113.20/32',port:443,protocol:'tcp'}]},
  {bridge:'br-abcdef123456',allowlisted:[{cidr:'198.51.100.10/32',port:5432,protocol:'tcp'}]},
  {bridge:'br-abcdef123456',allowlisted:[{cidr:'198.51.100.10/32',port:5432,protocol:'tcp'},{cidr:'198.51.100.10/32',port:5432,protocol:'tcp'}]},
  {bridge:'br-abcdef123456',allowlisted:[{cidr:'198.51.100.10/32',port:0,protocol:'tcp'},{cidr:'203.0.113.20/32',port:443,protocol:'tcp'}]},
  {bridge:'br-abcdef123456',allowlisted:[{cidr:'198.51.100.10/32',port:53,protocol:'udp'},{cidr:'203.0.113.20/32',port:443,protocol:'tcp'}]}
 ])assert.throws(()=>renderSaboraEgressGuard(candidate),/sabora_egress_stop:/);
});

test('offline signer CLI does not exit 0 silently and signs with a protected test key',()=>{
 const cli=fileURLToPath(new URL('../scripts/ops/sabora-sign-release-approval.mjs',import.meta.url));
 const root=mkdtempSync(join(tmpdir(),'sabora-signer-subprocess-'));
 try{
  const env={...process.env,SABORA_RELEASE_NTFS_ACL_RECEIPT_SHA256:'a'.repeat(64)};
  const missing=spawnSync(process.execPath,[cli],{encoding:'utf8',env});
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/sabora_release_sign_stop:expected_draft_privatekey_output_prefix/);
  const draft=join(root,'approval.json'),privatePath=join(root,'test-private.pem'),prefix=join(root,'approved');
  const keys=generateKeyPairSync('ed25519');
  writeFileSync(privatePath,keys.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  chmodSync(privatePath,0o600);
  const moment=Date.now();
  writeFileSync(draft,JSON.stringify(approval({
   approvedAt:new Date(moment-60000).toISOString(),
   expiresAt:new Date(moment+600000).toISOString()})),{mode:0o600});
  if(process.platform==='win32'){
   // CI-only ephemeral DACLs: remove inherited grants on the temporary
   // directory, draft and test private key, then measure the real SDDL.
   const prepare=`
$ErrorActionPreference='Stop'
$paths=@($env:SABORA_TEST_DIR,$env:SABORA_TEST_DRAFT,$env:SABORA_TEST_KEY)
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($path in $paths) {
 $isDirectory=[System.IO.Directory]::Exists($path)
 if ($isDirectory) {
  $acl=[System.IO.Directory]::GetAccessControl($path)
 } else {
  $acl=[System.IO.File]::GetAccessControl($path)
 }
 $acl.SetAccessRuleProtection($true,$false)
 $acl.SetOwner($user)
 if ($isDirectory) {
  # Inherited *child* permissions must be restricted too; otherwise files
  # written by the signer inherit an empty DACL and cannot be reopened.
  $rule=[System.Security.AccessControl.FileSystemAccessRule]::new(
   $user,[System.Security.AccessControl.FileSystemRights]::FullControl,
   [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
   [System.Security.AccessControl.PropagationFlags]::None,
   [System.Security.AccessControl.AccessControlType]::Allow)
 } else {
  $rule=[System.Security.AccessControl.FileSystemAccessRule]::new(
   $user,[System.Security.AccessControl.FileSystemRights]::FullControl,
   [System.Security.AccessControl.AccessControlType]::Allow)
 }
 $acl.AddAccessRule($rule)
 if ($isDirectory) {
  [System.IO.Directory]::SetAccessControl($path,$acl)
 } else {
  [System.IO.File]::SetAccessControl($path,$acl)
 }
}
`;
   const ps=join(process.env.SystemRoot??'C:\\Windows','System32',
    'WindowsPowerShell','v1.0','powershell.exe');
   const config=spawnSync(ps,['-NoProfile','-NonInteractive','-EncodedCommand',
    Buffer.from(prepare,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',
    env:{...env,SABORA_TEST_DIR:root,SABORA_TEST_DRAFT:draft,SABORA_TEST_KEY:privatePath}});
   assert.equal(config.status,0,
    'Windows runner DACL fixture: '+String(config.stderr??'')
     .replace(/[A-Za-z]:\\[^\s]*/g,'<runner-path>').slice(0,500));
   assert.throws(()=>verifiedNtfsAclDigest(join(tmpdir(),'definitely-missing.sabora')),
    /sabora_ntfs_acl_stop:/);
   env.SABORA_RELEASE_NTFS_ACL_RECEIPT_SHA256=verifiedNtfsAclDigest(privatePath);
   const wrongAcl=spawnSync(process.execPath,[cli,draft,privatePath,prefix],
    {encoding:'utf8',env:{...env,SABORA_RELEASE_NTFS_ACL_RECEIPT_SHA256:'a'.repeat(64)}});
   assert.notEqual(wrongAcl.status,0,'arbitrary 64-hex receipt is not an ACL proof');
  }
  const result=spawnSync(process.execPath,[cli,draft,privatePath,prefix],{encoding:'utf8',env});
  assert.equal(result.status,0,result.stderr);
  for(const suffix of ['.json','.sig','.pub.pem'])assert.equal(existsSync(prefix+suffix),true);
  const receipt=verifyReleaseAuthorization(readFileSync(prefix+'.json','utf8'),
   readFileSync(prefix+'.sig','utf8').trim(),readFileSync(prefix+'.pub.pem','utf8'),
   {operation:'deploy',sha:fullSha},moment);
  assert.equal(receipt.releaseSha,fullSha);
  // Launch from a different working directory: checkout protection is
  // derived from the script's real module path, never process.cwd().
  const insideCheckout=fileURLToPath(new URL('../AGENTS.md',import.meta.url));
  const escapeResult=spawnSync(process.execPath,[cli,draft,insideCheckout,
   join(root,'must-not-sign')],{encoding:'utf8',env,cwd:root});
  assert.notEqual(escapeResult.status,0);
  assert.match(escapeResult.stderr,/secrets_must_remain_outside_checkout/);
  assert.notEqual(spawnSync(process.execPath,[cli,draft,privatePath,prefix],
   {encoding:'utf8',env}).status,0,'never overwrite a signed approval');
  if(process.platform!=='win32'){
   const alias=join(root,'private-alias.pem');
   symlinkSync(privatePath,alias);
   const resultLink=spawnSync(process.execPath,[cli,draft,alias,join(root,'alias-out')],
    {encoding:'utf8',env});
   assert.notEqual(resultLink.status,0);
   assert.match(resultLink.stderr,/protected_input_not_regular/);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});


test('S50 deploy V2 has no mandatory Windows or offline signing CI job',()=>{
 const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const flow=readFileSync(new URL('../.github/workflows/sabora-governed-deploy.yml',import.meta.url),'utf8');
 assert.doesNotMatch(ci,/^  windows-offline-signer:/m);
 assert.doesNotMatch(ci,/Exercise offline signer end-to-end with disposable Windows test key/);
 assert.doesNotMatch(flow,/SABORA_APPROVAL_SIG_B64|SABORA_APPROVAL_JSON_B64|SABORA_APPROVER_PUBLIC_KEY_B64/);
 assert.match(flow,/sabora-release-authorization-v2\\.mjs create/);
});

test('main SHA release evidence is GitHub-owned, cost-bounded and refuses PR evidence as main',()=>{
 const release=readFileSync(new URL('../.github/workflows/sabora-main-release-evidence.yml',import.meta.url),'utf8');
 const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const visual=readFileSync(new URL('../.github/workflows/visual-contract-gate.yml',import.meta.url),'utf8');
 assert.match(release,/^on:\s*\n  push:\s*\n    branches: \[main\]/m);
 assert.doesNotMatch(release,/^  pull_request:|^  workflow_dispatch:|^  schedule:|pull_request_target:/m);
 assert.match(release,/github\.repository == 'jdlc86\/CartaViva'/);
 assert.match(release,/github\.ref == 'refs\/heads\/main'/);
 assert.match(release,/ref: \$\{\{ github\.sha \}\}/);
 assert.match(release,/git rev-parse HEAD/);
 for(const name of ['generate-lockfile','functional-ui-gate'])
  assert.match(release,new RegExp('name: '+name+'\\r?\\n'));
 assert.match(release,/pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile/);
 assert.match(release,/git diff --exit-code -- pnpm-lock\.yaml/);
 assert.match(release,/pnpm install --frozen-lockfile/);
 assert.match(release,/node scripts\/ci\/production-config-secrets-gate\.mjs/);
 assert.match(release,/FUNCTIONAL_UI_BASE_SHA: \$\{\{ github\.event\.before \}\}/);
 assert.match(release,/node --test tests\/functional-ui-coverage-gate\.test\.mjs/);
 assert.match(release,/node scripts\/ci\/functional-ui-coverage-gate\.mjs --require-base/);
 assert.doesNotMatch(release,/pnpm test|F21_FULL_WINDOW|catalog-postgres17|docker (?:build|run|compose)|ssh -/);
 assert.match(ci,/^  push:\s*\n    branches: \[main,/m);
 assert.match(ci,/SABORA_CI_F21_FULL_WINDOW: 'true'/);
 // A green main SHA is insufficient if the public restaurant code has not
 // been approved explicitly. Never silently use the lab value SABORA.
 assert.match(ci,/vars\.SABORA_APPROVED_RESTAURANT_CODE != ''/);
 assert.match(ci,/SABORA_RESTAURANT_CODE="\$SABORA_APPROVED_RESTAURANT_CODE"/);
 assert.match(visual,/if: github\.event_name == 'workflow_dispatch'/);
});
