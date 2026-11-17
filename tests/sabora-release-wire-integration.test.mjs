import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough,Readable} from 'node:stream';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {sendReleaseBundle} from '../scripts/ci/sabora-release-transport.mjs';
import {receiveReleaseBundle} from '../scripts/ops/sabora-release-receiver.mjs';
import {buildReleaseBundleManifest} from '../scripts/ci/sabora-release-bundle.mjs';
import {SABORA_RELEASE_SCOPE,stableStringify,EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');

test('integrated governed Sabora: main package -> wire -> signed verification -> private stage, tamper and replay denied',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sabora-wire-integration-'));
 try{
  const src=join(root,'source'),dest=join(root,'stage');
  const {mkdirSync}=await import('node:fs');
  mkdirSync(src,{mode:0o700});mkdirSync(dest,{mode:0o700});
  const files=['api.tar','web.tar','operational.yml','web.yml'];
  const payload=[Buffer.from('fake API tar data, no real image'),
   Buffer.from('fake WEB tar data, no real image'),
   Buffer.from('name: sabora\nservices:\n  api: {}\n'),
   Buffer.from('name: sabora\nservices:\n  web: {}\n')];
  for(let i=0;i<4;i++)writeFileSync(join(src,files[i]),payload[i],{mode:0o600});
  const sha='d'.repeat(40),id='SABORA-RELEASE-INTEGRAL-01';
  const manifest=await buildReleaseBundleManifest({releaseSha:sha,
   apiArchive:join(src,files[0]),webArchive:join(src,files[1]),
   operationalCompose:join(src,files[2]),webCompose:join(src,files[3]),
   apiImageId:'sha256:'+'1'.repeat(64),webImageId:'sha256:'+'2'.repeat(64)});
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  const key=generateKeyPairSync('ed25519');
  const pub=key.publicKey.export({format:'pem',type:'spki'});
  const evid=Object.fromEntries(EVIDENCE_KEYS.map((k,i)=>[k,createHash('sha256').update('integrated-evidence-'+i).digest('hex')]));
  const approval={schema:'sabora-governed-release/v1',repository:'jdlc86/CartaViva',operation:'deploy',
   releaseSha:sha,authorizationId:id,approvedAt:'2026-11-14T10:00:00.000Z',
   expiresAt:'2026-11-14T10:50:00.000Z',server:SABORA_RELEASE_SCOPE.host,
   project:'sabora',port:8443,origins:SABORA_RELEASE_SCOPE.origins,
   services:SABORA_RELEASE_SCOPE.services,bundleManifestSha256:hash(manifestBytes),
   evidence:evid};
  const raw=stableStringify(approval),approvalB64=Buffer.from(raw).toString('base64');
  const signatureB64=sign(null,Buffer.from(raw),key.privateKey).toString('base64');
  const command='sabora-release-v1 deploy '+sha+' '+id+' '+hash(raw)+' 7771';
  const opts={command,publicKey:pub,stageRoot:dest,now:Date.parse('2026-11-14T10:15:00.000Z')};
  async function deliver(){
   const channel=new PassThrough({highWaterMark:1024});
   return Promise.all([
    sendReleaseBundle(channel,{approvalB64,signatureB64,manifestBytes,
     paths:files.map(f=>join(src,f))}),
    receiveReleaseBundle(channel,opts)
   ]).then(r=>r[1]);
  }
  const result=await deliver();
  assert.equal(result.stage,'verified-only');
  assert.equal(result.authorizedToDeploy,false);
  assert.equal(result.bundleManifestSha256,hash(manifestBytes));
  for(let i=0;i<4;i++)assert.deepEqual(readFileSync(join(result.location,files[i])),payload[i]);
  await assert.rejects(deliver(),/stage_replayed_or_in_progress/);
  const secondRoot=join(root,'second-stage');
  mkdirSync(secondRoot,{mode:0o700});
  writeFileSync(join(src,'web.tar'),Buffer.from('manipulated tar'),{mode:0o600});
  const channel=new PassThrough({highWaterMark:1024});
  await assert.rejects(Promise.all([
   sendReleaseBundle(channel,{approvalB64,signatureB64,manifestBytes,paths:files.map(f=>join(src,f))}),
   receiveReleaseBundle(channel,{...opts,stageRoot:secondRoot})
  ]),/transferred_hash_mismatch:web/);
  await assert.rejects(receiveReleaseBundle(Readable.from([Buffer.from('{"protocol":"wrong"}\n')]),
   {...opts,stageRoot:secondRoot}),/invalid_protocol/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
