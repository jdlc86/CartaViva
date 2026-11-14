import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildReleaseBundleManifest} from '../scripts/ci/sabora-release-bundle.mjs';
import {verifyReleaseBundle} from '../scripts/ops/sabora-release-host-agent.mjs';
test('Sabora two-image package: complete producer/host digest roundtrip with tamper negative',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sabora-release-package-'));
 try{
  const files={api:Buffer.from('api archive fixture'),web:Buffer.from('web archive fixture'),
   compose_operational:Buffer.from('name: sabora\nservices:\n  api: {}\n'),
   compose_web:Buffer.from('name: sabora\nservices:\n  web: {}\n')};
  for(const [name,bytes] of Object.entries(files))writeFileSync(join(dir,name),bytes);
  const sha='b'.repeat(40);
  const manifest=await buildReleaseBundleManifest({
   releaseSha:sha,apiArchive:join(dir,'api'),webArchive:join(dir,'web'),
   apiImageId:'sha256:'+'1'.repeat(64),webImageId:'sha256:'+'2'.repeat(64),
   operationalCompose:join(dir,'compose_operational'),webCompose:join(dir,'compose_web')});
  const parsed=JSON.parse(JSON.stringify(manifest));
  const manifestBytes=Buffer.from(JSON.stringify(parsed,null,2)+'\n');
  const receipt={releaseSha:sha,bundleManifestSha256:(await import('node:crypto')).createHash('sha256').update(manifestBytes).digest('hex')};
  const checked=verifyReleaseBundle(receipt,parsed,files,manifestBytes);
  assert.equal(checked.images.length,2);
  assert.equal(checked.authorizedToDeploy,false);
  assert.throws(()=>verifyReleaseBundle(receipt,parsed,
   {...files,web:Buffer.from('tampered')},manifestBytes),/image_bundle_hash_or_scope/);
  await assert.rejects(()=>buildReleaseBundleManifest({...{
   releaseSha:sha,apiArchive:join(dir,'api'),webArchive:join(dir,'web'),
   apiImageId:'sha256:'+'1'.repeat(64),webImageId:'sha256:'+'2'.repeat(64),
   operationalCompose:join(dir,'compose_operational'),webCompose:join(dir,'compose_web')},
   releaseSha:'not-sha'}),/release_sha_or_image_identity_invalid/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
