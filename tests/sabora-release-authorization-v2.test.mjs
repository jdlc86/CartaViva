import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubReleaseAuthorization,verifyGitHubReleaseAuthorizationV2} from '../scripts/ci/sabora-release-authorization-v2.mjs';
import {stableStringify} from '../scripts/ci/sabora-release-governor.mjs';

const SHA='a'.repeat(40),DIGEST='b'.repeat(64),NOW=Date.parse('2026-11-23T12:00:00Z');
const input=()=>({actor:'jdlc86',runId:'45081697324',attempt:1,operation:'deploy',sha:SHA,
 bundleManifestSha256:DIGEST,now:NOW});
const valid=()=>createGitHubReleaseAuthorization(input());
function verify(raw,overrides={}){return verifyGitHubReleaseAuthorizationV2(raw,{
 operation:'deploy',sha:SHA,runId:'45081697324',attempt:1,...overrides},NOW+1000);}
function change(raw,fields){return stableStringify({...JSON.parse(raw),...fields});}
test('V2 authorizes one owner GitHub run, fixed SHA/host/manifest and no signature or dossiers',()=>{
 const a=valid(),receipt=verify(a.raw,{manifestSha256:DIGEST});
 assert.equal(a.authorizationId,'GH45081697324-A1');
 assert.equal(receipt.authorizationSha256,a.authorizationSha256);
 assert.equal(receipt.bundleManifestSha256,DIGEST);
 assert.equal(receipt.actor,'jdlc86');
 assert.equal(Object.hasOwn(JSON.parse(a.raw),'signature'),false);
 assert.equal(Object.hasOwn(JSON.parse(a.raw),'evidence'),false);
});
test('V2 rejects foreign actors, unknown operation, unpinned manifest, and malformed run',()=>{
 for(const variant of [{actor:'attacker'},{operation:'plan'},{bundleManifestSha256:null},
  {runId:'0'},{attempt:0},{sha:'0000'}])
  assert.throws(()=>createGitHubReleaseAuthorization({...input(),...variant}),/sabora_v2_authorization_stop/);
});
test('V2 rejects actor/host/operation/CI-run substitution, replay identity and canonical JSON changes',()=>{
 const raw=valid().raw;
 const bad=[{actor:'attacker'},{repository:'another/repo'},{server:'localhost'},
  {port:22},{operation:'rollback'},{releaseSha:'c'.repeat(40)},
  {authorizationId:'GH45081697324-A2'},{githubRunId:'45081697325'},
  {githubRunAttempt:2},{bundleManifestSha256:'d'.repeat(64)},
  {origins:['https://invalid']},{services:['api']}];
 for(const variant of bad)assert.throws(()=>verify(change(raw,variant),{manifestSha256:DIGEST}),/sabora_v2_authorization_stop/);
 assert.throws(()=>verify(raw+'\n'),/sabora_v2_authorization_stop/);
 assert.throws(()=>verify(raw,{runId:'45081697325'}),/sabora_v2_authorization_stop/);
 assert.throws(()=>verify(raw,{manifestSha256:'c'.repeat(64)}),/sabora_v2_authorization_stop/);
});
test('V2 rejects expired, future and stretched windows',()=>{
 const raw=valid().raw;
 assert.throws(()=>verifyGitHubReleaseAuthorizationV2(raw,{operation:'deploy',sha:SHA},NOW+3600000),/expired/);
 assert.throws(()=>verifyGitHubReleaseAuthorizationV2(raw,{operation:'deploy',sha:SHA},NOW-1),/expired/);
 assert.throws(()=>verify(change(raw,{expiresAt:new Date(NOW+7200000).toISOString()})),/expired/);
});
test('Issue authorization is keyed to the original Issue, not a fresh run or attempt',()=>{
 const a=createGitHubReleaseAuthorization({...input(),sourceIssueNumber:87});
 const b=createGitHubReleaseAuthorization({...input(),sourceIssueNumber:87,runId:'45081697325',attempt:2});
 assert.equal(a.authorizationId,'IS000000000087');
 assert.equal(b.authorizationId,a.authorizationId);
 const receipt=verify(a.raw,{sourceIssueNumber:87});
 assert.equal(receipt.sourceIssueNumber,87);
 assert.throws(()=>verify(a.raw,{sourceIssueNumber:88}),/sabora_v2_authorization_stop/);
 assert.throws(()=>createGitHubReleaseAuthorization({...input(),sourceIssueNumber:0}),/sabora_v2_authorization_stop/);
});
test('V2 rollback has no required signature nor declared package, but binds target and GitHub run',()=>{
 const a=createGitHubReleaseAuthorization({...input(),operation:'rollback',bundleManifestSha256:null});
 const receipt=verifyGitHubReleaseAuthorizationV2(a.raw,{operation:'rollback',sha:SHA,
  runId:input().runId,attempt:1},NOW+1000);
 assert.equal(receipt.bundleManifestSha256,null);
 assert.throws(()=>verifyGitHubReleaseAuthorizationV2(a.raw,{operation:'deploy',sha:SHA},NOW+1000));
 assert.throws(()=>createGitHubReleaseAuthorization({...input(),operation:'rollback'}));
});
