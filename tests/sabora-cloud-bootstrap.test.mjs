import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BOOTSTRAP,verifyBootstrapArchive,assertCloudBootstrapWorkflow} from '../scripts/ci/sabora-cloud-bootstrap-verify.mjs';
const workflow=readFileSync(new URL('../.github/workflows/sabora-cloud-bootstrap-stage.yml',import.meta.url),'utf8');
const receiver=readFileSync(new URL('../deploy/sabora-bootstrap-receive-v1.sh',import.meta.url),'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');

test('cloud-only Sabora bootstrap is a closed, staged, no-install transport',()=>{
 assert.equal(assertCloudBootstrapWorkflow(workflow),true);
 assert.match(receiver,/SSH_ORIGINAL_COMMAND/);
 assert.match(receiver,/sabora-bootstrap/);
 assert.match(receiver,/\.sabora-original-launchers-426960f0\.zip/);
 assert.match(receiver,/head -c 8793 >> "\$DEST"/);
 assert.match(receiver,/chmod 600 -- "\$DEST"/);
 assert.match(receiver,/stat -c '%a'/);
 assert.match(receiver,/set -C/);
 assert.match(receiver,/sha256sum -c --status/);
 assert.doesNotMatch(receiver,/\b(?:sudo|docker|scp|sftp|rsync|rm|systemctl|nft|eval)\b/);
 execFileSync('bash',['-n',new URL('../deploy/sabora-bootstrap-receive-v1.sh',import.meta.url).pathname]);
});

test('cloud-only bootstrap boundary rejects bypasses of identity, host pin, trust and stage-only scope',()=>{
 const changes=[
  ['other repository',s=>s.replace("github.repository == 'jdlc86/CartaViva'","github.repository == 'evil/repo'")],
  ['non-main ref',s=>s.replace("github.ref == 'refs/heads/main'","github.ref == 'refs/heads/dev'")],
  ['non-owner',s=>s.replace("github.actor == 'jdlc86'","github.actor == 'someone'")],
  ['unguarded stage',s=>s.replace("if: inputs.operation == 'stage'","if: always()")],
  ['no environment',s=>s.replace('environment: sabora-bootstrap-stage','environment: staging')],
  ['bad pin',s=>s.replace('StrictHostKeyChecking=yes','StrictHostKeyChecking=no')],
  ['weaker host algorithm',s=>s.replace('HostKeyAlgorithms=ssh-ed25519','HostKeyAlgorithms=ssh-rsa')],
  ['approved fingerprint missing',s=>s.replace('vars.SABORA_BOOTSTRAP_HOST_ED25519_FINGERPRINT','vars.UNAPPROVED_FINGERPRINT')],
  ['approved client fingerprint missing',s=>s.replace('vars.SABORA_BOOTSTRAP_CLIENT_ED25519_FINGERPRINT','vars.UNAPPROVED_CLIENT_FINGERPRINT')],
  ['no private key type validation',s=>s.replace("ssh-keygen -y -P '' -f \"$key\"","ssh-keygen -y -f \"$key\"")],
  ['wrong user',s=>s.replace('sabora-bootstrap@146.59.145.64','ubuntu@146.59.145.64')],
  ['SFTP',s=>s.replace('receipt="$(cat', 'scp arbitrary /tmp && receipt="$(cat')],
  ['self-hosted',s=>s.replace('runs-on: ubuntu-24.04','runs-on: self-hosted')],
  ['other secret',s=>s.replace('secrets.SABORA_BOOTSTRAP_SSH_KEY_B64','secrets.FLEETIA_SSH_KEY_B64')],
  ['unexpected event',s=>s.replace('  workflow_dispatch:\n','  push:\n  workflow_dispatch:\n')],
  ['SSH inside plan',s=>s.replace('git fetch --no-tags origin main','ssh -F /dev/null bad && git fetch --no-tags origin main')]
 ];
 for(const [label,change] of changes){const modified=change(workflow);assert.notEqual(modified,workflow,label);
  assert.throws(()=>assertCloudBootstrapWorkflow(modified),/sabora_cloud_bootstrap_stop:/,label);}
});

test('archive verifier checks complete zip manifest, source SHA, both exact ELF digests and no extras',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sabora-bootstrap-'));
 try{
  const elf=Buffer.from([0x7f,69,76,70,2,1,1,0,0,0,0,0,0,0,0,0]);
  const source='f'.repeat(40);
  const names=[...BOOTSTRAP.allowed];
  for(const n of names){const data=n==='root-entry'||n==='ssh-entry'?elf:Buffer.from(n==='preparation.txt'?'sourceSha='+source+'\n':n+'\n');writeFileSync(join(dir,n),data);}
  const archive=join(dir,'archive.zip');
  execFileSync('zip',['-X','-q',archive,...names],{cwd:dir});
  const data=readFileSync(archive);
  const policy={artifactSize:data.length,archiveSha256:sha(data),artifactId:1,sourceSha:source,
   allowed:names,entries:{'root-entry':sha(elf),'ssh-entry':sha(elf)}};
  assert.equal(verifyBootstrapArchive(archive,policy).installed,false);
  assert.throws(()=>verifyBootstrapArchive(archive,{...policy,sourceSha:'e'.repeat(40)}),/source_sha/);
  assert.throws(()=>verifyBootstrapArchive(archive,{...policy,entries:{...policy.entries,'root-entry':'0'.repeat(64)}}),/elf_digest/);
  assert.throws(()=>verifyBootstrapArchive(archive,{...policy,allowed:[...names,'unexpected']}),/archive_entries/);
  assert.throws(()=>verifyBootstrapArchive(archive,{...policy,archiveSha256:'0'.repeat(64)}),/archive_digest/);
  assert.throws(()=>verifyBootstrapArchive(archive,{...policy,artifactSize:data.length+1}),/archive_digest/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
