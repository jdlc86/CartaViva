import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough,Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {sendReleaseBundle} from '../scripts/ci/sabora-release-transport.mjs';
import {receiveReleaseBundle} from '../scripts/ops/sabora-release-receiver.mjs';
import {buildReleaseBundleManifest} from '../scripts/ci/sabora-release-bundle.mjs';
import {createGitHubReleaseAuthorization} from '../scripts/ci/sabora-release-authorization-v2.mjs';
import {verifyHostRunEnvelopeV2} from '../scripts/ops/sabora-release-host-authorization-v2.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const NOW=Date.parse('2026-11-23T12:00:00Z');
const SHA='d'.repeat(40);
async function packetFor(approvalB64,manifestBytes,paths){
 const out=new PassThrough(),pieces=[];
 const reader=(async()=>{for await(const chunk of out)pieces.push(chunk);})();
 await sendReleaseBundle(out,{approvalB64,manifestBytes,paths});
 await reader;
 return Buffer.concat(pieces);
}
async function specimen(){
 const root=mkdtempSync(join(tmpdir(),'sabora-v2-wire-'));
 const src=join(root,'src'),stage=join(root,'stage');
 mkdirSync(src,{mode:0o700});mkdirSync(stage,{mode:0o700});
 const files=['api.tar','web.tar','operational.yml','web.yml'];
 const bodies=['api fake tar','web fake tar','services:\n  api: {}\n','services:\n  web: {}\n'];
 const paths=files.map((name,i)=>{const path=join(src,name);writeFileSync(path,bodies[i],{mode:0o600});return path;});
 const manifest=await buildReleaseBundleManifest({releaseSha:SHA,
  apiArchive:paths[0],webArchive:paths[1],operationalCompose:paths[2],
  webCompose:paths[3],apiImageId:'sha256:'+'1'.repeat(64),webImageId:'sha256:'+'2'.repeat(64)});
 const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 const consent=createGitHubReleaseAuthorization({actor:'jdlc86',
  runId:'45081697324',attempt:1,operation:'deploy',sha:SHA,
  bundleManifestSha256:sha256(manifestBytes),now:NOW});
 const command='sabora-release-v2 deploy '+SHA+' '+consent.authorizationId+' '+consent.authorizationSha256+' 45081697324';
 return {root,stage,paths,consent,command,manifestBytes};
}
test('V2 complete immutable source -> no-signature wire -> private Sabora-only staging',async()=>{
 const s=await specimen();
 try{
  const wire=await packetFor(s.consent.approvalB64,s.manifestBytes,s.paths);
  const h=JSON.parse(wire.subarray(0,wire.indexOf(10)).toString());
  assert.deepEqual(Object.keys(h).sort(),['approvalB64','manifestB64','protocol']);
  assert.equal(h.protocol,'sabora-release-wire/v2');
  const receipt=verifyHostRunEnvelopeV2(s.command,JSON.stringify({approvalB64:h.approvalB64}),NOW+2000);
  assert.equal(receipt.authorizationId,s.consent.authorizationId);
  const staged=await receiveReleaseBundle(Readable.from([wire]),{
   command:s.command,stageRoot:s.stage,protocolVersion:2,now:NOW+2000});
  assert.equal(staged.authorizedToDeploy,false);
  assert.equal(staged.stage,'verified-only');
  assert.equal(readFileSync(join(staged.location,'api.tar')).toString(),'api fake tar');
  assert.equal(sha256(readFileSync(join(staged.location,'manifest.json'))),sha256(s.manifestBytes));
  await assert.rejects(receiveReleaseBundle(Readable.from([wire]),{
   command:s.command,stageRoot:s.stage,protocolVersion:2,now:NOW+2000}),/stage_replayed_or_in_progress/);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});
test('V2 rejects tampered run/host, altered manifest and legacy signature fields',async()=>{
 const s=await specimen();
 try{
  const wire=await packetFor(s.consent.approvalB64,s.manifestBytes,s.paths);
  const line=wire.indexOf(10),h=JSON.parse(wire.subarray(0,line).toString());
  assert.throws(()=>verifyHostRunEnvelopeV2(s.command.replace('45081697324','45081697325'),
   JSON.stringify({approvalB64:h.approvalB64}),NOW+2000),/sabora_v2_(?:host|authorization)_stop/);
  const withSignature=Buffer.concat([Buffer.from(JSON.stringify({...h,signatureB64:'dGVzdA=='})+'\n'),wire.subarray(line+1)]);
  await assert.rejects(receiveReleaseBundle(Readable.from([withSignature]),{
   command:s.command,stageRoot:s.stage,protocolVersion:2,now:NOW+2000}),/invalid_protocol/);
  const corrupted=Buffer.concat([Buffer.from(JSON.stringify({...h,manifestB64:Buffer.from('abc').toString('base64')})+'\n'),wire.subarray(line+1)]);
  await assert.rejects(receiveReleaseBundle(Readable.from([corrupted]),{
   command:s.command,stageRoot:s.stage,protocolVersion:2,now:NOW+2000}),/invalid_manifest_json|bundle_manifest/);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});
