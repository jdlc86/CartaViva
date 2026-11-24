import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,linkSync,symlinkSync,chmodSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createReleaseLedger} from '../scripts/ops/sabora-release-ledger.mjs';
import {protectedBytes,acquireReleaseLock,sha256} from '../scripts/ops/sabora-release-protected-store.mjs';
import {inspectDockerSaveArchive} from '../scripts/ops/sabora-release-image-archive.mjs';
const applicable=process.platform==='linux'&&process.getuid?.()===0;
function tarFile(name,bytes,type='0'){
 const h=Buffer.alloc(512);h.write(name);h.write('0000600\0',100);h.write('0000000\0',108);h.write('0000000\0',116);
 h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write(type,156);h.write('ustar\0',257);h.write('00',263);
 h.write(h.reduce((n,b)=>n+b,0).toString(8).padStart(6,'0')+'\0 ',148);
 return Buffer.concat([h,bytes,Buffer.alloc((512-bytes.length%512)%512)]);
}
test('root filesystem, durable replay/crash and signed malicious Docker TAR invariants',{skip:applicable?false:'Linux root fixture runs in controller integration'},()=>{
 mkdirSync('/var/lib/sabora-release-tests',{mode:0o700});const root=mkdtempSync('/var/lib/sabora-release-tests/case-');chmodSync(root,0o700);
 try{
  const f=join(root,'data');writeFileSync(f,'protected',{mode:0o600});assert.equal(protectedBytes(f).toString(),'protected');
  linkSync(f,f+'.hard');assert.throws(()=>protectedBytes(f),/untrusted_file/);unlinkSync(f+'.hard');symlinkSync(f,f+'.link');assert.throws(()=>protectedBytes(f+'.link'));unlinkSync(f+'.link');
  chmodSync(f,0o666);assert.throws(()=>protectedBytes(f),/untrusted_file/);chmodSync(f,0o600);
  const unlock=acquireReleaseLock(root);assert.throws(()=>acquireReleaseLock(root),/release_locked/);unlock();
  const ledgerDir=join(root,'ledger');mkdirSync(ledgerDir,{mode:0o700});const ledger=createReleaseLedger(ledgerDir);
  const receipt={authorizationId:'LAB-LEDGER-000001',releaseSha:'a'.repeat(40),operation:'deploy',authorizationSha256:'b'.repeat(64),bundleManifestSha256:'c'.repeat(64),evidence:{}};
  ledger.consume(receipt,{});assert.throws(()=>ledger.assertReconciled(),/requires_reconciliation/);ledger.phase('compose-up');ledger.commit({receipt,operation:'deploy',readiness:{apiReady:true}});
  assert.equal(ledger.assertReconciled().activeReleaseSha,receipt.releaseSha);assert.throws(()=>ledger.consume(receipt,{}),/authorization_replay/);
  const next={...receipt,authorizationId:'LAB-LEDGER-000002',releaseSha:'d'.repeat(40)};
  const orphan=join(ledgerDir,next.authorizationId+'.json');
  writeFileSync(orphan,JSON.stringify({...next,state:'consumed'}),{mode:0o600});
  // Crash after the exclusive record and before replacing the prior journal.
  assert.throws(()=>ledger.assertReconciled(),/ledger_orphan_consumption/);
  ledger.fail('before-journal',next.authorizationId);
  assert.equal(JSON.parse(readFileSync(join(ledgerDir,'transaction.json'))).state,'healthy');
  unlinkSync(orphan);
  ledger.consume(next,{});ledger.phase('compose-up');
  ledger.commit({receipt:next,operation:'deploy',readiness:{apiReady:true}});
  // A final rename can be visible even when the following fsync fails.
  ledger.fail('final-sync-failure',next.authorizationId);
  const unknown=JSON.parse(readFileSync(join(ledgerDir,'transaction.json')));
  assert.equal(unknown.state,'unknown');
  assert.equal(unknown.failedPhase,'postchecks-committed');
  assert.throws(()=>ledger.assertReconciled(),/requires_reconciliation/);
  const layer=Buffer.alloc(1024),config=Buffer.from(JSON.stringify({os:'linux',architecture:'amd64',rootfs:{type:'layers',diff_ids:['sha256:'+sha256(layer)]},config:{User:'sabora'}}));
  const tag='sabora-api:'+'a'.repeat(40),id=sha256(config),configName=id+'.json',layerName='e'.repeat(64)+'/layer.tar';
  const manifest=[{Config:configName,RepoTags:[tag],Layers:[layerName]}];
  const archive=(m,extra=[])=>Buffer.concat([tarFile(configName,config),tarFile(layerName,layer),tarFile('manifest.json',Buffer.from(JSON.stringify(m))),...extra,Buffer.alloc(1024)]);
  const path=join(root,'api.tar'),inspect=bytes=>{writeFileSync(path,bytes,{mode:0o600});return inspectDockerSaveArchive(path,{tag,imageId:'sha256:'+id,archiveSha256:sha256(bytes)});};
  assert.equal(inspect(archive(manifest)).imageId,'sha256:'+id);
  assert.throws(()=>inspect(archive([{...manifest[0],RepoTags:[tag,'foreign:latest']}])) ,/archive_image_scope/);
  assert.throws(()=>inspect(archive([...manifest,...manifest])),/archive_multiple_images/);
  assert.throws(()=>inspect(archive(manifest,[tarFile('../escape',Buffer.from('bad'))])),/tar_path/);
  assert.throws(()=>inspect(archive(manifest,[tarFile('link',Buffer.alloc(0),'2')])),/tar_path/);
  assert.throws(()=>inspect(archive(manifest,[tarFile(configName,config)])),/tar_path/);
  assert.throws(()=>inspect(archive(manifest,[tarFile('unknown',Buffer.from('bad'))])),/unreferenced/);
  // Same dual OCI + legacy-compatibility shape observed in real Docker save.
  const created='2026-11-19T00:00:00Z',legacyEmpty={Hostname:'',Domainname:'',User:'',
   AttachStdin:false,AttachStdout:false,AttachStderr:false,Tty:false,OpenStdin:false,StdinOnce:false,
   Env:null,Cmd:null,Image:'',Volumes:null,WorkingDir:'',Entrypoint:null,OnBuild:null,Labels:null};
  const config2=Buffer.from(JSON.stringify({...JSON.parse(config),created})),configId=sha256(config2);
  const blob=hash=>'blobs/sha256/'+hash;
  const layerDigest='sha256:'+sha256(layer),layerDesc={mediaType:'application/vnd.oci.image.layer.v1.tar',digest:layerDigest,size:layer.length};
  const imageType='application/vnd.oci.image.manifest.v1+json';
  const image={schemaVersion:2,mediaType:imageType,
   config:{mediaType:'application/vnd.oci.image.config.v1+json',digest:'sha256:'+configId,size:config2.length},layers:[layerDesc]};
  const imageBytes=Buffer.from(JSON.stringify(image)),imageDigest=sha256(imageBytes);
  const [repoName,repoTag]=tag.split(':');
  const index={schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:[
   {mediaType:imageType,digest:'sha256:'+imageDigest,size:imageBytes.length,
    annotations:{'io.containerd.image.name':'docker.io/library/'+tag,'org.opencontainers.image.ref.name':repoTag}}]};
  const compatibility={id:'f'.repeat(64),created,container_config:legacyEmpty,config:{...legacyEmpty,User:'sabora'},architecture:'amd64',os:'linux'};
  const modernManifest=[{Config:blob(configId),RepoTags:[tag],Layers:[blob(sha256(layer))],LayerSources:{[layerDigest]:layerDesc}}];
  const j=(name,value)=>tarFile(name,Buffer.from(JSON.stringify(value)));
  function modern({metadata=compatibility,manifest=modernManifest,indexValue=index,repository={[repoName]:{[repoTag]:sha256(layer)}},extra=[]}={}){
   const metaBytes=Buffer.from(JSON.stringify(metadata));
   return Buffer.concat([tarFile(blob(configId),config2),tarFile(blob(sha256(layer)),layer),tarFile(blob(imageDigest),imageBytes),
    tarFile(blob(sha256(metaBytes)),metaBytes),j('manifest.json',manifest),j('index.json',indexValue),
    j('repositories',repository),j('oci-layout',{imageLayoutVersion:'1.0.0'}),...extra,Buffer.alloc(1024)]);
  }
  const inspectModern=bytes=>{writeFileSync(path,bytes,{mode:0o600});return inspectDockerSaveArchive(path,{tag,imageId:'sha256:'+configId,archiveSha256:sha256(bytes)});};
  assert.equal(inspectModern(modern()).imageId,'sha256:'+configId);
  assert.throws(()=>inspectModern(modern({metadata:{...compatibility,config:{...compatibility.config,User:'root'}}})),/archive_legacy_config_disagrees/);
  assert.throws(()=>inspectModern(modern({metadata:{...compatibility,parent:compatibility.id}})),/archive_legacy_chain_invalid/);
  assert.throws(()=>inspectModern(modern({extra:[tarFile(blob(sha256(Buffer.from('arbitrary'))),Buffer.from('arbitrary'))]})),/archive_unreferenced_payload/);
  assert.throws(()=>inspectModern(modern({repository:{[repoName]:{[repoTag]:'e'.repeat(64)}}})),/archive_repository_layer_disagrees/);
  const changedIndex=structuredClone(index);changedIndex.manifests[0].annotations['org.opencontainers.image.ref.name']='foreign';
  assert.throws(()=>inspectModern(modern({indexValue:changedIndex})),/archive_oci_foreign_tag/);
  const changedSources=structuredClone(modernManifest);changedSources[0].LayerSources[layerDigest].urls=['https://foreign.invalid/layer'];
  assert.throws(()=>inspectModern(modern({manifest:changedSources})),/archive_layer_sources_disagree/);
 }finally{rmSync(root,{recursive:true,force:true});rmSync('/var/lib/sabora-release-tests',{recursive:true,force:true});}
});
