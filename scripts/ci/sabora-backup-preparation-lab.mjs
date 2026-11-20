// Exercise the offline dossier and the actual Git-blob package in one
// disposable runner, no new PG17 restore or operational installation.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackupPreparationArtifact,verifyBackupPreparationDirectory} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_INSTALL_PATHS,BACKUP_PREPARATION_FILES,verifyBackupInstallationPlan} from '../ops/sabora-backup-installation-plan.mjs';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
import {stableStringify} from './sabora-release-governor.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
 process.env.RUNNER_OS!=='Linux'||!process.env.RUNNER_TEMP||!/^\d+$/.test(process.env.GITHUB_RUN_ID??'')||
 !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA??''))throw Error('disposable_backup_preparation_context_required');
const root=mkdtempSync(join(process.env.RUNNER_TEMP,'sabora-backup-preparation-lab-'));
const output=resolve(process.env.RUNNER_TEMP,'sabora-backup-preparation-package');
const fixture=join(root,'repeat'),sourceSha=process.env.GITHUB_SHA;
const key=()=>generateKeyPairSync('ed25519'),owner=key(),verification=key(),recovery=key();
const publicKey=k=>k.publicKey.export({format:'pem',type:'spki'});
const digest=x=>sha256(Buffer.from('fixture-only-'+x));
const signed=p=>Buffer.from(JSON.stringify({payload:p,signature:sign(null,Buffer.from(stableStringify(p)),owner.privateKey).toString('base64')}));
try{
 const first=buildBackupPreparationArtifact(output,sourceSha),second=buildBackupPreparationArtifact(fixture,sourceSha);
 assert.deepEqual(first,second);
 assert.equal(first.files,BACKUP_PREPARATION_FILES.length+1);
 assert.equal(first.operationalAuthorization,false);
 const artifactBytes=readFileSync(join(output,'artifact.json'));
 assert.deepEqual(artifactBytes,readFileSync(join(fixture,'artifact.json')));
 assert.throws(()=>buildBackupPreparationArtifact(output,sourceSha),/immutable_destination_required/);
 const path=join(fixture,BACKUP_PREPARATION_FILES[0]),original=readFileSync(path);
 writeFileSync(path,Buffer.concat([original,Buffer.from('\n// altered fixture')]));
 assert.throws(()=>verifyBackupPreparationDirectory(fixture),/artifact_content/);
 writeFileSync(path,original);
 const extra=join(fixture,'unapproved.mjs');writeFileSync(extra,'throw Error("never executed")');
 assert.throws(()=>verifyBackupPreparationDirectory(fixture),/artifact_inventory/);unlinkSync(extra);
 assert.deepEqual(verifyBackupPreparationDirectory(fixture),first);
 const now=Date.now();
 const plan={schema:'sabora-backup-installation-plan/v1',repository:'jdlc86/CartaViva',project:'sabora',
  environment:'disposable-lab',sourceSha,artifactSha256:first.artifactSha256,
  plannedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+60000).toISOString(),
  account:BACKUP_INSTALL_PATHS.account,paths:{config:BACKUP_INSTALL_PATHS.config,
   volume:BACKUP_INSTALL_PATHS.volume,cache:BACKUP_INSTALL_PATHS.cache,
   guard:BACKUP_INSTALL_PATHS.guard,recovery:BACKUP_INSTALL_PATHS.recovery},
  transport:{listenAddress:'127.0.0.1',port:22239,clientAddress:'127.0.0.1',
   hostKeySha256:digest('host'),clientKeySha256:digest('client')},
  storage:{filesystem:'ext4',filesystemUuid:'136c8b67-21de-40f9-9137-ec67a541e76b',filesystemBytes:32*1024**2,
   quotaBytes:24*1024**2,reserveBytes:1024**2,maxBundleBytes:8*1024**2,metadataBudgetBytes:4*1024**2,
   storageIdentitySha256:digest('vps'),externalStorageIdentitySha256:digest('external'),systemIdentifier:'1234567890123456789'},
  authorities:{verificationPublicKey:publicKey(verification),recoveryPublicKey:publicKey(recovery)},
  runtime:{nodeSha256:digest('node'),shellSha256:digest('shell'),sshdSha256:digest('sshd'),flockSha256:digest('flock')}};
 const verify=(payload,overrides={})=>verifyBackupInstallationPlan({planBytes:signed(payload),ownerPublicKey:publicKey(owner),artifactBytes,now,...overrides});
 const result=verify(plan);
 assert.equal(result.operationalAuthorization,false);assert.equal(result.installed,false);assert.equal(result.receiverAvailable,false);
 assert.match(result.sshdConfiguration,/^AllowUsers sabora-backup@127\.0\.0\.1$/m);
 assert.match(result.sshdConfiguration,/^DisableForwarding yes$/m);
 assert.match(result.sshdConfiguration,/^ForceCommand \/etc\/sabora\/backup\/bin\/receive$/m);
 assert.doesNotMatch(result.sshdConfiguration,/Subsystem|Include|PasswordAuthentication yes/);
 assert.equal(result.configurationSha256,sha256(Buffer.from(result.sshdConfiguration)));
 const rejects=[
  [{...plan,project:'other'},/plan_scope/],
  [{...plan,sourceSha:'a'.repeat(40)},/plan_scope/],
  [{...plan,artifactSha256:digest('wrong')},/plan_scope/],
  [{...plan,account:'sabora-release'},/plan_scope/],
  [{...plan,paths:{...plan.paths,cache:plan.paths.volume}},/plan_scope/],
  [{...plan,paths:{...plan.paths,volume:'/srv/sabora/backups'}},/plan_scope/],
  [{...plan,paths:{...plan.paths,recovery:plan.paths.cache}},/plan_scope/],
  [{...plan,paths:{...plan.paths,guard:plan.paths.cache+'/guard'}},/plan_scope/],
  [{...plan,transport:{...plan.transport,port:8443}},/transport_scope/],
  [{...plan,transport:{...plan.transport,listenAddress:'0.0.0.0'}},/transport_scope/],
  [{...plan,transport:{...plan.transport,clientAddress:'127.0.0.1\nPermitRootLogin yes'}},/transport_scope/],
  [{...plan,transport:{...plan.transport,clientKeySha256:plan.transport.hostKeySha256}},/transport_scope/],
  [{...plan,environment:'production-candidate'},/transport_scope/],
  [{...plan,storage:{...plan.storage,quotaBytes:20*1024**2}},/two_generation_capacity/],
  [{...plan,storage:{...plan.storage,quotaBytes:33*1024**2}},/storage_scope/],
  [{...plan,storage:{...plan.storage,externalStorageIdentitySha256:plan.storage.storageIdentitySha256}},/storage_scope/],
  [{...plan,storage:{...plan.storage,metadataBudgetBytes:1}},/storage_scope/],
  [{...plan,authorities:{...plan.authorities,recoveryPublicKey:publicKey(verification)}},/authority_alias/],
  [{...plan,authorities:{...plan.authorities,recoveryPublicKey:publicKey(owner)}},/authority_alias/],
  [{...plan,validUntil:new Date(now-1).toISOString()},/plan_expired/],
  [{...plan,runtime:{...plan.runtime,nodeSha256:'0'.repeat(64)}},/runtime_identity/]
 ];
 for(const [invalid,pattern] of rejects)assert.throws(()=>verify(invalid),pattern);
 assert.throws(()=>verify(plan,{ownerPublicKey:publicKey(recovery)}),/document_signature_invalid/);
 const changed=JSON.parse(signed(plan));changed.payload.transport.port++;
 assert.throws(()=>verify(plan,{planBytes:Buffer.from(JSON.stringify(changed))}),/document_signature_invalid/);
 // A production-candidate signed plan is still categorically non-operational.
 // Documentation-only TEST-NET addresses are not actual endpoint choices.
 const candidate=verify({...plan,environment:'production-candidate',
  transport:{...plan.transport,listenAddress:'192.0.2.10',clientAddress:'198.51.100.20'}});
 assert.equal(candidate.operationalAuthorization,false);
 assert.equal(candidate.status,'STOP_PENDING_PROVISIONING_AND_REVIEW');
 console.log('sabora_backup_preparation_artifact_and_signed_plan_ok:'+JSON.stringify({
  sourceSha,artifactSha256:first.artifactSha256,files:first.files,negativeCases:rejects.length+2,
  repeatReproducible:true,operationalAuthorization:false,installed:false}));
 // Only the unsigned closed source artifact survives; never store fixture
 // keys, a fixture signed production-candidate plan or a real dossier.
}finally{rmSync(root,{recursive:true,force:true});}
