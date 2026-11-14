import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {stableStringify,SABORA_RELEASE_SCOPE,EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';
import {parseForcedReleaseCommand,verifyHostEnvelope,verifyHostEvidence,
 verifyReleaseBundle,readProtectedFile,recordAuthorizationOnce,
 authorizeHostOperation} from '../scripts/ops/sabora-release-host-agent.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const sha='a'.repeat(40);
const now=Date.parse('2026-11-14T09:00:00Z');
test('governed host boundary: signed SSH request to real files to single-use receipt, fail closed',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sabora-host-agent-'));
 try{
  const pair=generateKeyPairSync('ed25519');
  const pub=pair.publicKey.export({format:'pem',type:'spki'});
  const artifacts=Object.fromEntries(EVIDENCE_KEYS.map((gate,i)=>[gate,Buffer.from(JSON.stringify({
   schema:'sabora-release-evidence/v1',gate,restaurant:'sabora',
   status:'verified',observedAt:'2026-11-14T08:00:00Z',
   reference:'independent-explicit-evidence-'+i}))]));
  const evidence=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,digest(artifacts[k])]));
  const approval={schema:'sabora-governed-release/v1',repository:'jdlc86/CartaViva',
   operation:'deploy',releaseSha:sha,authorizationId:'SABORA-RELEASE-20261114',
   approvedAt:'2026-11-14T08:45:00.000Z',expiresAt:'2026-11-14T09:45:00.000Z',
   server:'146.59.145.64',project:'sabora',port:8443,
   origins:[...SABORA_RELEASE_SCOPE.origins],services:[...SABORA_RELEASE_SCOPE.services],evidence};
  const raw=stableStringify(approval);
  const sig=sign(null,Buffer.from(raw),pair.privateKey).toString('base64');
  const cmd='sabora-release-v1 deploy '+sha+' SABORA-RELEASE-20261114 '+digest(raw)+' 100234';
  const envelope=JSON.stringify({approvalB64:Buffer.from(raw).toString('base64'),signatureB64:sig});
  const receipt=verifyHostEnvelope(cmd,envelope,pub,now);
  assert.equal(receipt.githubRunId,'100234');
  assert.equal(verifyHostEvidence(receipt,artifacts).length,6);
  assert.throws(()=>verifyHostEvidence(receipt,{...artifacts,externalRestoreSha256:Buffer.from('{}')}),/evidence_hash_mismatch/);
  assert.throws(()=>verifyHostEnvelope(cmd,envelope,pub,now+7200000),/expired_or_invalid/);
  assert.throws(()=>verifyHostEnvelope(cmd.replace('100234','not-number'),envelope,pub,now),/invalid_forced_command/);
  assert.throws(()=>verifyHostEnvelope(cmd.replace(' deploy ',' rollback '),envelope,pub,now),/command_approval_mismatch|wrong_release_scope/);
  assert.throws(()=>verifyHostEnvelope(cmd,envelope,generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}),now),/signature_invalid/);
  assert.throws(()=>parseForcedReleaseCommand(cmd+';docker ps'),/invalid_forced_command/);
  const imageA=Buffer.from('example-image-archive-A');
  const imageB=Buffer.from('example-image-archive-B');
  const composeA=Buffer.from('name: sabora\nservices:\n  api: {}\n');
  const composeB=Buffer.from('name: sabora\nservices:\n  web: {}\n');
  const files={api:imageA,web:imageB,compose_operational:composeA,compose_web:composeB};
  const manifest={schema:'sabora-release-bundle/v1',repository:'jdlc86/CartaViva',
   releaseSha:sha,project:'sabora',services:[...SABORA_RELEASE_SCOPE.services],
   images:{api:{tag:'sabora-api:'+sha,imageId:'sha256:'+'1'.repeat(64),archiveSha256:digest(imageA)},
    web:{tag:'sabora-web:'+sha,imageId:'sha256:'+'2'.repeat(64),archiveSha256:digest(imageB)}},
   compose:{operational:digest(composeA),web:digest(composeB)}};
  assert.equal(verifyReleaseBundle(receipt,manifest,files).authorizedToDeploy,false);
  assert.throws(()=>verifyReleaseBundle(receipt,{...manifest,project:'another'},files),/invalid_release_bundle/);
  assert.throws(()=>verifyReleaseBundle(receipt,manifest,{...files,api:Buffer.from('tampered')}),/image_bundle_hash_or_scope/);
  const protectedFile=join(dir,'owner.pem');
  writeFileSync(protectedFile,pub,{mode:0o600});
  assert.equal(readProtectedFile(protectedFile,process.getuid()).toString(),pub);
  const record=recordAuthorizationOnce(dir,receipt,{evidenceHashesVerified:6,artifactDigestsVerified:2});
  assert.equal(JSON.parse(readFileSync(record,'utf8')).state,'consumed-before-operation');
  assert.equal(statSync(record).mode&0o777,0o600);
  assert.throws(()=>recordAuthorizationOnce(dir,receipt,{}),/authorization_replay/);
  assert.throws(()=>authorizeHostOperation(),/actuator_not_provisioned/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
