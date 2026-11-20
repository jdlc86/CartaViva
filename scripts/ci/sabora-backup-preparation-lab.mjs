// Exercise the offline dossier and the actual Git-blob package in one
// disposable runner, no new PG17 restore or operational installation.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createCipheriv,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,unlinkSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackupPreparationArtifact,verifyBackupPreparationDirectory} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_INSTALL_PATHS,BACKUP_PREPARATION_FILES,verifyBackupInstallationPlan} from '../ops/sabora-backup-installation-plan.mjs';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
import {verifyInstalledBackupActivation,sshEd25519Sha256} from '../ops/sabora-backup-installed-contract.mjs';
import {prepareInstalledBackupTransfer,backupLabSshArguments} from '../ops/sabora-vps-backup-transport.mjs';
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
 // Test the installed-only authorization and preflight without connecting
 // to a network or provisioning any installation. TEST-NET addresses
 // are reserved documentation values; all keys and content are fixtures.
 const local=join(root,'sender');mkdirSync(local,{mode:0o700});
 const clientFile=join(local,'client'),hostFile=join(local,'host');
 for(const path of [clientFile,hostFile]){
  const keygen=spawnSync('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path],{encoding:'utf8',timeout:10000});
  assert.equal(keygen.status,0);
 }
 const pub=path=>readFileSync(path+'.pub','utf8').trim().split(' ').slice(0,2).join(' ');
 const hostKey=pub(hostFile),clientKey=pub(clientFile);
 const ssh=realpathSync('/usr/bin/ssh'),sshHash=sha256(readFileSync(ssh));
 const productionPlan={...plan,environment:'production-candidate',transport:{
  listenAddress:'192.0.2.10',clientAddress:'198.51.100.20',port:22239,
  hostKeySha256:sshEd25519Sha256(hostKey),clientKeySha256:sshEd25519Sha256(clientKey)}};
 const productionBytes=signed(productionPlan),productionChecked=verify(productionPlan);
 const activation={schema:'sabora-backup-receiver-activation/v1',repository:plan.repository,project:plan.project,
  environment:'production',operation:'receive-encrypted-only',sourceSha,artifactSha256:first.artifactSha256,
  planSha256:productionChecked.planSha256,configurationSha256:productionChecked.configurationSha256,
  installationId:'SABORA-BACKUP-INSTALL-CI-ONLY',hostIdentitySha256:digest('fixture-host-id'),
  uid:22017,gid:22017,device:'12345',guardInode:'54321',
  independentReviewSha256:digest('synthetic-review'),isolationEvidenceSha256:digest('synthetic-isolation'),
  senderBinarySha256:sshHash,authorizedAt:productionPlan.plannedAt,validUntil:productionPlan.validUntil};
 const activate=(p=activation,overrides={})=>verifyInstalledBackupActivation({
  planBytes:productionBytes,artifactBytes,activationBytes:signed(p),ownerPublicKey:publicKey(owner),now,...overrides});
 const active=activate();
 assert.equal(active.activation.installationId,activation.installationId);
 const rejectsActivation=[
  [{...activation,environment:'disposable-lab'},/activation_scope/],
  [{...activation,operation:'recover'},/activation_scope/],
  [{...activation,planSha256:digest('wrong-plan')},/activation_scope/],
  [{...activation,artifactSha256:digest('wrong-artifact')},/activation_scope/],
  [{...activation,configurationSha256:digest('wrong-config')},/activation_scope/],
  [{...activation,uid:0},/activation_scope/],
  [{...activation,gid:10001},/activation_scope/],
  [{...activation,device:'0'},/activation_scope/],
  [{...activation,validUntil:new Date(now-1).toISOString()},/activation_time/],
  [{...activation,validUntil:new Date(now+120000).toISOString()},/activation_time/]
 ];
 for(const [invalid,pattern] of rejectsActivation)assert.throws(()=>activate(invalid),pattern);
 assert.throws(()=>activate(activation,{activationBytes:null}),/activation_size/);
 assert.throws(()=>activate(activation,{planBytes:signed(plan)}),/production_plan_required/);
 assert.throws(()=>activate(activation,{activationBytes:Buffer.from(JSON.stringify({payload:activation,signature:sign(null,Buffer.from(stableStringify(activation)),recovery.privateKey).toString('base64')}))}),/document_signature_invalid/);
 assert.throws(()=>sshEd25519Sha256(hostKey+' comment'),/ssh_key_shape/);
 const known=join(local,'known hosts');
 writeFileSync(known,'[192.0.2.10]:22239 '+hostKey+'\n',{mode:0o600});
 const endpoint={environment:'production',host:'192.0.2.10',port:22239,user:plan.account,
  sshBinary:ssh,identityFile:clientFile,knownHostsFile:known};
 // Real encrypted bytes, synthetic database content and authority. Never
 // publish the fixture signed production-shaped plan or private key.
 const bundle=join(local,'bundle');mkdirSync(bundle,{mode:0o700});
 const plain=Buffer.from('disposable sender fixture'),secret=randomBytes(32),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',secret,iv);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);secret.fill(0);
 const manifest={schema:'sabora-preinstall-backup/v1',backupId:'SABORA-BACKUP-INSTALLED-SENDER-LAB',
  repository:plan.repository,releaseSha:sourceSha,sourceProjectRef:'byhvmumqivmunkmomhup',postgresMajor:17,postgresVersion:'17.1',
  plannedMigrationTreeSha256:digest('migrations'),includedSchemas:[],
  excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
  createdAt:new Date(now-1000).toISOString(),custody:'key-outside-artifact-git-actions-vps',
  sourceSystemIdentifier:plan.storage.systemIdentifier,sourceDatabase:'postgres',snapshotId:'1-1-1',
  initialState:'no-sabora-objects',artifactPolicy:'ciphertext-only-replicas; no keys or plaintext dumps',
  components:[{algorithm:'aes-256-gcm',ciphertextBytes:encrypted.length,ciphertextSha256:sha256(encrypted),
   filename:'initial-state.aesgcm',ivHex:iv.toString('hex'),mediaType:'application/json',name:'initial-state',
   plaintextBytes:plain.length,plaintextSha256:sha256(plain),tagHex:cipher.getAuthTag().toString('hex')} ]};
 const manifestBytes=Buffer.from(JSON.stringify(manifest));
 writeFileSync(join(bundle,'manifest.json'),manifestBytes,{mode:0o600});
 writeFileSync(join(bundle,'initial-state.aesgcm'),encrypted,{mode:0o600});
 const proof={schema:'sabora-vps-rotation-proof/v1',repository:plan.repository,project:plan.project,
  environment:'production',storageIdentitySha256:plan.storage.storageIdentitySha256,
  externalStorageIdentitySha256:plan.storage.externalStorageIdentitySha256,backupId:manifest.backupId,
  manifestSha256:sha256(manifestBytes),previousManifestSha256:null,releaseSha:sourceSha,backupSchema:manifest.schema,
  recoveredInventorySha256:sha256(plain),recoveryEvidenceSha256:digest('synthetic-restore'),
  recoveryKind:'authenticated-initial-state-and-recovery-drill',observedAt:new Date(now).toISOString(),
  validUntil:productionPlan.validUntil};
 const proofDocument=value=>Buffer.from(JSON.stringify({payload:value,
  signature:sign(null,Buffer.from(stableStringify(value)),verification.privateKey).toString('base64')}));
 const request={endpoint,sourceDirectory:bundle,proofBytes:proofDocument(proof),planBytes:productionBytes,
  artifactBytes,activationBytes:signed(activation),ownerPublicKey:publicKey(owner)};
 await assert.rejects(backupLabSshArguments(endpoint),/endpoint_not_authorized/);
 const prepared=await prepareInstalledBackupTransfer(request);
 assert.equal(prepared.expected.manifestSha256,sha256(manifestBytes));
 assert.equal(prepared.args.at(-1),productionPlan.transport.listenAddress);
 await assert.rejects(prepareInstalledBackupTransfer({...request,endpoint:{...endpoint,host:'192.0.2.11'}}),/endpoint_not_authorized/);
 await assert.rejects(prepareInstalledBackupTransfer({...request,proofBytes:proofDocument({...proof,environment:'disposable-lab'})}),/installed_proof_scope/);
 await assert.rejects(prepareInstalledBackupTransfer({...request,proofBytes:proofDocument({...proof,manifestSha256:digest('wrong-manifest')})}),/installed_proof_scope/);
 writeFileSync(known,'[192.0.2.10]:22239 '+clientKey+'\n');
 await assert.rejects(prepareInstalledBackupTransfer(request),/installed_host_pin/);
 writeFileSync(known,'[192.0.2.10]:22239 '+hostKey+'\n');
 const binary=join(root,'installed-shell');
 const build=outputFile=>spawnSync('/usr/bin/cc',['-O2','-Wall','-Wextra','-Werror',
  '-DSABORA_BACKUP_UID=22017','-DSABORA_BACKUP_GID=22017','-o',outputFile,
  join(output,'deploy/sabora-backup-installed-shell.c')],{encoding:'utf8',timeout:15000});
 assert.equal(build(binary).status,0);
 assert.equal(build(binary+'-repeat').status,0);
 assert.equal(sha256(readFileSync(binary)),sha256(readFileSync(binary+'-repeat')));
 assert.notEqual(spawnSync(binary,[],{encoding:'utf8',timeout:1000}).status,0);
 console.log('sabora_backup_installed_activation_sender_preflight_and_shell_ok:'+JSON.stringify({
  networkContacted:false,installed:false,operationalAuthorization:false,activationNegatives:rejectsActivation.length+4}));
 console.log('sabora_backup_preparation_artifact_and_signed_plan_ok:'+JSON.stringify({
  sourceSha,artifactSha256:first.artifactSha256,files:first.files,negativeCases:rejects.length+2,
  repeatReproducible:true,operationalAuthorization:false,installed:false}));
 // Only the unsigned closed source artifact survives; never store fixture
 // keys, a fixture signed production-candidate plan or a real dossier.
}finally{rmSync(root,{recursive:true,force:true});}
