// Exercise the offline dossier and the actual Git-blob package in one
// disposable runner, no new PG17 restore or operational installation.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createCipheriv,randomBytes} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,unlinkSync,realpathSync,lstatSync,copyFileSync,chmodSync,linkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBackupPreparationArtifact,verifyBackupPreparationDirectory} from './sabora-backup-preparation-artifact.mjs';
import {BACKUP_INSTALL_PATHS,BACKUP_PREPARATION_FILES,verifyBackupInstallationPlan} from '../ops/sabora-backup-installation-plan.mjs';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
import {verifyInstalledBackupActivation,sshEd25519Sha256} from '../ops/sabora-backup-installed-contract.mjs';
import {prepareInstalledBackupTransfer,backupLabSshArguments} from '../ops/sabora-vps-backup-transport.mjs';
import {stageInactiveBackupInstallation,verifyInactiveBackupStage} from '../ops/sabora-backup-installation-stager.mjs';
import {verifyExternalRecoveryCheckpoint} from '../ops/sabora-backup-recovery-checkpoint.mjs';
import {advanceExternalRecoveryCheckpoint,observeExternalRecoveryCheckpoint,reserveLocalRecoveryCheckpoint,diagnoseInterruptedLocalCheckpoint} from '../ops/sabora-backup-checkpoint-custodian.mjs';
import {authorityFingerprint} from '../ops/sabora-release-evidence.mjs';
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
   guard:BACKUP_INSTALL_PATHS.guard,recovery:BACKUP_INSTALL_PATHS.recovery,control:BACKUP_INSTALL_PATHS.control},
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
  [{...plan,paths:{...plan.paths,control:plan.paths.recovery}},/plan_scope/],
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
  installationId:'SABORA-BACKUP-INSTALL-CI-ONLY-01',hostIdentitySha256:digest('fixture-host-id'),
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
 const component=join(bundle,'initial-state.aesgcm');
 chmodSync(component,0o644);
 try{await assert.rejects(prepareInstalledBackupTransfer(request),/local_file_permissions_invalid/);}
 finally{chmodSync(component,0o600);}
 const unexpected=join(bundle,'unexpected.txt');
 writeFileSync(unexpected,'fixture',{mode:0o600,flag:'wx'});
 try{await assert.rejects(prepareInstalledBackupTransfer(request),/installed_source_inventory/);}
 finally{unlinkSync(unexpected);}

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
 // Materialize the actual closed installation set, including the native
 // binaries pinned by a signed preparation plan. Staging stays unprivileged,
 // contains no host private key or activation and cannot start a service.
 const hostedNode=realpathSync(process.execPath),observedNode=lstatSync(hostedNode);
 console.log('sabora_backup_stage_runner_node_observed:'+JSON.stringify({
  regular:observedNode.isFile(),links:observedNode.nlink,bytes:observedNode.size,
  trustedOwner:[0,process.getuid()].includes(observedNode.uid),groupOrOtherWritable:(observedNode.mode&0o022)!==0}));
 // The hosted tool cache is not the independently prepared installation
 // input. Materialize a fresh private regular copy for the disposable test
 // and compare the original bytes; do not weaken the stager's checks.
 assert.equal(observedNode.isFile(),true);
 const nodeBinary=join(root,'fixture-node');
 copyFileSync(hostedNode,nodeBinary);chmodSync(nodeBinary,0o700);
 assert.equal(sha256(readFileSync(nodeBinary)),sha256(readFileSync(hostedNode)));
 assert.equal(lstatSync(nodeBinary).nlink,1);
 const stagedPlan={...productionPlan,runtime:{...productionPlan.runtime,
  nodeSha256:sha256(readFileSync(nodeBinary)),shellSha256:sha256(readFileSync(binary))}};
 const staging={sourceDirectory:output,destination:join(root,'inactive-stage'),nodeBinary,
  shellBinary:binary,planBytes:signed(stagedPlan),ownerPublicKey:publicKey(owner),
  hostPublicKey:hostKey,clientPublicKey:clientKey};
 const stage=stageInactiveBackupInstallation(staging);
 assert.equal(stage.installed,false);assert.equal(stage.listenerEnabled,false);
 assert.equal(stage.operationalAuthorization,false);assert.equal(stage.controlRoot,BACKUP_INSTALL_PATHS.control);
 assert.equal(Object.keys(stage.files).length,BACKUP_PREPARATION_FILES.length+8);
 for(const [name,record] of Object.entries(stage.files))
  assert.equal(sha256(readFileSync(join(staging.destination,name))),record.sha256);
 assert.deepEqual(JSON.parse(readFileSync(join(staging.destination,'stage.json'),'utf8')),stage);
 assert.equal(stage.files['activation.json'],undefined);
 assert.equal(stage.files['host-ed25519'],undefined);
 assert.equal(stage.files['bin/receive'].installMode,'0755');
 const verifyStage=()=>verifyInactiveBackupStage({directory:staging.destination,ownerPublicKey:publicKey(owner)});
 const stageVerified=verifyStage();
 assert.equal(stageVerified.files,Object.keys(stage.files).length);
 assert.equal(stageVerified.installed,false);
 assert.equal(stageVerified.operationalAuthorization,false);
 assert.throws(()=>verifyInactiveBackupStage({directory:staging.destination,ownerPublicKey:publicKey(recovery)}),/stage_owner_identity/);
 const receiptPath=join(staging.destination,'stage.json');
 const originalReceipt=readFileSync(receiptPath);
 writeFileSync(receiptPath,JSON.stringify({...stage,installed:true}));
 assert.throws(verifyStage,/stage_receipt/);
 writeFileSync(receiptPath,originalReceipt);
 const sourcePath=join(staging.destination,'code',BACKUP_PREPARATION_FILES[0]);
 const originalSource=readFileSync(sourcePath);
 writeFileSync(sourcePath,Buffer.concat([originalSource,Buffer.from('\n// tampered')]));
 assert.throws(verifyStage,/stage_digest/);
 // Even a rewritten self-receipt cannot authorize the altered source.
 const forged=JSON.parse(originalReceipt);
 forged.files['code/'+BACKUP_PREPARATION_FILES[0]].sha256=sha256(readFileSync(sourcePath));
 writeFileSync(receiptPath,JSON.stringify(forged));
 assert.throws(verifyStage,/stage_digest/);
 writeFileSync(sourcePath,originalSource);writeFileSync(receiptPath,originalReceipt);
 const unexpected=join(staging.destination,'activation.json');
 writeFileSync(unexpected,'{}',{mode:0o600});
 assert.throws(verifyStage,/stage_inventory/);unlinkSync(unexpected);
 const alias=join(root,'fixture-node-alias');linkSync(nodeBinary,alias);
 try{
  assert.throws(()=>stageInactiveBackupInstallation({...staging,destination:join(root,'reject-linked-node')}),/input_file/);
 }finally{unlinkSync(alias);}
 assert.equal(verifyStage().stageSha256,stageVerified.stageSha256);
 console.log('sabora_backup_inactive_stage_independent_verification_ok:'+JSON.stringify({
  files:stageVerified.files,negativeCases:6,installed:false,operationalAuthorization:false}));
 assert.throws(()=>stageInactiveBackupInstallation(staging),/fresh_stage_required/);
 assert.throws(()=>stageInactiveBackupInstallation({...staging,destination:join(root,'reject-runtime'),
  planBytes:signed(productionPlan)}),/runtime_digest/);
 assert.throws(()=>stageInactiveBackupInstallation({...staging,destination:join(root,'reject-key'),
  hostPublicKey:clientKey}),/ssh_key_identity/);
 assert.throws(()=>stageInactiveBackupInstallation({...staging,destination:join(root,'reject-lab'),
  planBytes:signed(plan)}),/production_candidate_required/);
 console.log('sabora_backup_inactive_installation_stage_ok:'+JSON.stringify({
  files:Object.keys(stage.files).length,installed:false,listenerEnabled:false,operationalAuthorization:false}));
 // A separate, ephemeral authority signs the current checkpoint, not the
 // recovery or verification authorities. Simulate both restored and ahead
 // local state. No live custodian connection or external ledger write.
 const custodian=key(),identity={environment:'production',installationId:activation.installationId,
  hostIdentitySha256:activation.hostIdentitySha256,storageIdentitySha256:plan.storage.storageIdentitySha256,
  externalStorageIdentitySha256:plan.storage.externalStorageIdentitySha256,
  controlStorageIdentitySha256:digest('separate-control-volume'),
  recoveryAuthoritySha256:authorityFingerprint(publicKey(recovery))};
 const record={schema:'sabora-backup-control-record/v1',repository:plan.repository,project:plan.project,
  environment:'production',...identity,sequence:7,authorizationSha256:digest('auth-7'),lockSha256:digest('lock-7')};
 const challenge=digest('fresh-challenge');
 const checkpoint={...record,schema:'sabora-backup-external-checkpoint/v1',challenge,
  recordSha256:sha256(Buffer.from(stableStringify(record))),
  observedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+60000).toISOString()};
 const signCheckpoint=(p,k=custodian)=>Buffer.from(JSON.stringify({payload:p,
  signature:sign(null,Buffer.from(stableStringify(p)),k.privateKey).toString('base64')}));
 const checkpointInput={record,expected:identity,challenge,checkpointBytes:signCheckpoint(checkpoint),
  checkpointPublicKey:publicKey(custodian),ownerPublicKey:publicKey(owner),
  recoveryPublicKey:publicKey(recovery),verificationPublicKey:publicKey(verification),now};
 const match=verifyExternalRecoveryCheckpoint(checkpointInput);
 assert.equal(match.matches,true);assert.equal(match.sequence,7);
 assert.equal(match.externalAdvancePerformed,false);assert.equal(match.recoveryAuthorized,false);
 for(const [overrides,pattern] of [
  [{record:{...record,sequence:6,authorizationSha256:digest('auth-6')}},/local_rollback_or_loss/],
  [{record:{...record,sequence:8}},/external_checkpoint_stale/],
  [{record:{...record,lockSha256:digest('wrong-lock')}},/checkpoint_record_mismatch/],
  [{record:null},/record/],
  [{challenge:digest('new-challenge')},/checkpoint_scope/],
  [{checkpointBytes:signCheckpoint({...checkpoint,validUntil:new Date(now-1).toISOString()})},/checkpoint_time/],
  [{checkpointBytes:signCheckpoint({...checkpoint,storageIdentitySha256:digest('wrong-volume')})},/checkpoint_scope/],
  [{checkpointBytes:signCheckpoint(checkpoint,owner)},/document_signature_invalid/],
  [{checkpointPublicKey:publicKey(owner)},/authority_alias/],
  [{expected:{...identity,controlStorageIdentitySha256:identity.storageIdentitySha256}},/identity/]
 ])assert.throws(()=>verifyExternalRecoveryCheckpoint({...checkpointInput,...overrides}),pattern);
 console.log('sabora_backup_checkpoint_comparison_and_rollback_rejection_ok:'+JSON.stringify({
  negativeCases:10,externalAdvancePerformed:false,recoveryAuthorized:false}));
 // Simulated independent custodian, with real durable CAS state in a
 // separate private fixture directory. This does not prove independent
 // physical custody or production authority on the runner.
 const custody=join(root,'external-checkpoint-fixture');mkdirSync(custody,{mode:0o700});
 const recordFile=join(custody,'record.json');
 writeFileSync(recordFile,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});
 const config={expected:identity,checkpointPublicKey:publicKey(custodian),
  checkpointPrivateKey:custodian.privateKey,ownerPublicKey:publicKey(owner),
  recoveryPublicKey:publicKey(recovery),verificationPublicKey:publicKey(verification)};
 const recoverySign=payload=>Buffer.from(JSON.stringify({payload,
  signature:sign(null,Buffer.from(stableStringify(payload)),recovery.privateKey).toString('base64')}));
 const observed=challenge=>observeExternalRecoveryCheckpoint({directory:custody,config,challenge});
 const verifyObserved=(localRecord,challenge,checkpointBytes)=>verifyExternalRecoveryCheckpoint({
  ...checkpointInput,record:localRecord,challenge,checkpointBytes,now:Date.now()});
 const fresh=()=>randomBytes(32).toString('hex'),initialChallenge=fresh();
 assert.equal(verifyObserved(record,initialChallenge,observed(initialChallenge)).sequence,7);
 const advanceRequest=(prior,{challenge=fresh(),lockSha256=digest('lock-'+(prior.sequence+1))}={})=>{
  const timestamp=Date.now(),validUntil=new Date(timestamp+30000).toISOString(),
   observedAt=new Date(timestamp-100).toISOString(),sequence=prior.sequence+1;
  const externalProofBytes=proofDocument({...proof,observedAt,validUntil});
  const authorizationBytes=recoverySign({schema:'sabora-vps-recovery-transition/v1',repository:plan.repository,project:plan.project,
   environment:'production',storageIdentitySha256:identity.storageIdentitySha256,
   externalStorageIdentitySha256:identity.externalStorageIdentitySha256,action:'publish-promoted-state',
   sequence,lockSha256,subjectSha256:digest('subject-'+sequence),externalProofSha256:sha256(externalProofBytes),observedAt,validUntil});
  const payload={schema:'sabora-backup-checkpoint-advance/v1',repository:plan.repository,project:plan.project,
   environment:'production',...identity,challenge,previousRecordSha256:sha256(Buffer.from(stableStringify(prior))),
   sequence,authorizationSha256:sha256(authorizationBytes),observedAt,validUntil};
  const requestBytes=recoverySign(payload);
  return {directory:custody,config,requestBytes,authorizationBytes,externalProofBytes,payload};
 };
 const nextRequest=advanceRequest(record);
 const advance=request=>{
  const {payload,...args}=request;
  return advanceExternalRecoveryCheckpoint(args);
 };
 const diskRecord=()=>JSON.parse(readFileSync(recordFile,'utf8'));
 assert.throws(()=>advance({...nextRequest,requestBytes:recoverySign({...nextRequest.payload,
  previousRecordSha256:digest('wrong-record')})}),/compare_and_set/);
 assert.throws(()=>advance({...nextRequest,requestBytes:recoverySign({...nextRequest.payload,
  validUntil:new Date(Date.now()-1).toISOString()})}),/document_time/);
 assert.throws(()=>advance({...nextRequest,externalProofBytes:proofDocument({...proof,backupId:'SABORA-BACKUP-DIFFERENT'})}),/authorization_scope/);
 assert.deepEqual(diskRecord(),record);
 const reserved=advance(nextRequest);
 assert.equal(reserved.externalAdvancePerformed,true);assert.equal(reserved.recoveryAuthorized,false);
 assert.equal(reserved.record.sequence,8);assert.deepEqual(diskRecord(),reserved.record);
 assert.equal(verifyObserved(reserved.record,nextRequest.payload.challenge,reserved.checkpointBytes).sequence,8);
 assert.throws(()=>verifyObserved(record,nextRequest.payload.challenge,reserved.checkpointBytes),/local_rollback_or_loss/);
 assert.throws(()=>advance(nextRequest),/compare_and_set/);
 // Two real processes race on the same previous record. Exactly one can
 // advance, either via exclusive lock or stale compare-and-set rejection.
 const raceA=advanceRequest(reserved.record),raceB=advanceRequest(reserved.record,{lockSha256:digest('competing-lock')});
 const moduleUrl=pathToFileURL(resolve('scripts/ops/sabora-backup-checkpoint-custodian.mjs')).href;
 const program='import {advanceExternalRecoveryCheckpoint as advance} from '+JSON.stringify(moduleUrl)+';\n'+
  "let text='';for await(const chunk of process.stdin)text+=chunk;const x=JSON.parse(text);"+
  "try{const result=advance({...x,requestBytes:Buffer.from(x.requestBytes,'base64'),authorizationBytes:Buffer.from(x.authorizationBytes,'base64'),externalProofBytes:Buffer.from(x.externalProofBytes,'base64')});"+
  "process.stdout.write(JSON.stringify({sequence:result.record.sequence}));}catch(e){process.stderr.write(String(e.message));process.exitCode=1;}";
 async function race(request){
  const child=spawn(process.execPath,['--input-type=module','--eval',program],{stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  child.stdin.on('error',()=>{});
  const ended=once(child,'close');
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  try{
   child.stdin.end(JSON.stringify({directory:custody,config:{...config,
    checkpointPrivateKey:custodian.privateKey.export({format:'pem',type:'pkcs8'})},
    requestBytes:request.requestBytes.toString('base64'),authorizationBytes:request.authorizationBytes.toString('base64'),
    externalProofBytes:request.externalProofBytes.toString('base64')}));
   const [status,signal]=await ended;assert.equal(signal,null);return {status,out,err};
  }finally{clearTimeout(timer);}
 }
 const racers=await Promise.all([race(raceA),race(raceB)]);
 assert.deepEqual(racers.map(x=>x.status).sort(),[0,1]);
 assert.equal(JSON.parse(racers.find(x=>x.status===0).out).sequence,9);
 assert.match(racers.find(x=>x.status===1).err,/custody_locked_or_crashed|compare_and_set/);
 const durable=diskRecord(),newChallenge=fresh();
 assert.equal(durable.sequence,9);
 const afterRestart=observed(newChallenge);
 assert.equal(verifyObserved(durable,newChallenge,afterRestart).sequence,9);
 assert.throws(()=>verifyObserved(reserved.record,newChallenge,afterRestart),/local_rollback_or_loss/);
 assert.throws(()=>verifyObserved(durable,initialChallenge,afterRestart),/checkpoint_scope/);
 for(const name of ['record.pending','custody.lock']){
  const pending=join(custody,name);
  writeFileSync(pending,'{}',{mode:0o600,flag:'wx'});
  try{assert.throws(()=>observed(fresh()),/unreconciled_custody|custody_locked_or_crashed/);}
  finally{unlinkSync(pending);}
 }
 const saved=readFileSync(recordFile);unlinkSync(recordFile);
 try{assert.throws(()=>observed(fresh()),/unreconciled_custody/);}
 finally{writeFileSync(recordFile,saved,{mode:0o600,flag:'wx'});}
 assert.deepEqual(diskRecord(),durable);
 console.log('sabora_backup_external_custody_cas_ok:'+JSON.stringify({
  sequence:durable.sequence,concurrentWinners:1,persistentRecords:1,
  externalAdvancePerformed:true,independentPhysicalCustody:false,recoveryAuthorized:false,operationalAuthorization:false}));
 // Connect the local durable reservation to the actual custody CAS, in
 // distinct private fixture directories. The transfer adapter signs only
 // the supplied envelope, like the future separately authorized operator.
 const localControl=join(root,'local-control-fixture');mkdirSync(localControl,{mode:0o700});
 const localRecordFile=join(localControl,'record.json');
 writeFileSync(localRecordFile,JSON.stringify(durable)+'\n',{mode:0o600,flag:'wx'});
 const localConfig={expected:identity,checkpointPublicKey:config.checkpointPublicKey,
  ownerPublicKey:config.ownerPublicKey,recoveryPublicKey:config.recoveryPublicKey,
  verificationPublicKey:config.verificationPublicKey};
 const localDisk=()=>JSON.parse(readFileSync(localRecordFile,'utf8'));
 const makeLocalRequest=prior=>{
  const r=advanceRequest(prior);
  const auth=JSON.parse(r.authorizationBytes.toString('utf8')).payload;
  const subject=Object.fromEntries(['action','lockSha256','externalProofSha256','subjectSha256'].map(k=>[k,auth[k]]));
  return {directory:localControl,config:localConfig,subject,
   authorizationBytes:r.authorizationBytes,externalProofBytes:r.externalProofBytes,
   observeExternal:challenge=>observed(challenge),
   advanceExternal:envelope=>advanceExternalRecoveryCheckpoint({directory:custody,config,
    requestBytes:recoverySign(envelope.payload),authorizationBytes:envelope.authorizationBytes,
    externalProofBytes:envelope.externalProofBytes}).checkpointBytes};
 };
 const localRequest=makeLocalRequest(durable);
 await assert.rejects(reserveLocalRecoveryCheckpoint({...localRequest,subject:{...localRequest.subject,
  subjectSha256:digest('wrong-observed-subject')}}),/local_subject/);
 await assert.rejects(reserveLocalRecoveryCheckpoint({...localRequest,
  observeExternal:()=>afterRestart}),/checkpoint_scope/);
 assert.deepEqual(localDisk(),durable);assert.deepEqual(diskRecord(),durable);
 const localReservation=await reserveLocalRecoveryCheckpoint(localRequest);
 assert.equal(localReservation.sequence,10);assert.equal(localReservation.slotsChanged,false);
 assert.equal(localReservation.operationalAuthorization,false);
 assert.deepEqual(localDisk(),diskRecord());
 await assert.rejects(reserveLocalRecoveryCheckpoint(localRequest),/local_authorization_sequence/);
 // Simulate a lost response after the independent CAS committed. Do not
 // infer that the mutation failed, retry or reset the pending record.
 const previousLocal=localDisk(),lost=makeLocalRequest(previousLocal);
 await assert.rejects(reserveLocalRecoveryCheckpoint({...lost,advanceExternal:envelope=>{
  lost.advanceExternal(envelope);throw Error('fixture_response_lost');
 }}),/fixture_response_lost/);
 assert.deepEqual(localDisk(),previousLocal);assert.equal(diskRecord().sequence,11);
 assert.equal(lstatSync(join(localControl,'record.pending')).isFile(),true);
 assert.equal(lstatSync(join(localControl,'custody.lock')).isFile(),true);
 await assert.rejects(reserveLocalRecoveryCheckpoint(lost),/local_checkpoint_locked_or_crashed/);
 const rollbackChallenge=fresh();
 assert.throws(()=>verifyObserved(previousLocal,rollbackChallenge,observed(rollbackChallenge)),/local_rollback_or_loss/);
 console.log('sabora_backup_local_external_checkpoint_exchange_ok:'+JSON.stringify({
  sequence:localReservation.sequence,lostResponseBlocksRetry:true,remoteSequence:diskRecord().sequence,
  localSequence:localDisk().sequence,slotsChanged:false,independentPhysicalCustody:false,operationalAuthorization:false}));
 // Diagnosis must never clear the interrupted state or confer a right
 // to reuse the consumed authorization. Take byte-level inventories.
 const pendingPath=join(localControl,'record.pending'),lockPath=join(localControl,'custody.lock');
 const pendingBytes=readFileSync(pendingPath),lockBytes=readFileSync(lockPath),localBytes=readFileSync(localRecordFile);
 const diagnose=options=>diagnoseInterruptedLocalCheckpoint({directory:localControl,config:localConfig,
  observeExternal:challenge=>observed(challenge),...options});
 const diagnosis=await diagnose();
 assert.equal(diagnosis.phase,'external-consumed');
 assert.equal(diagnosis.localSequence,10);assert.equal(diagnosis.pendingSequence,11);
 assert.equal(diagnosis.remoteSequence,11);assert.equal(diagnosis.blocked,true);
 assert.equal(diagnosis.lockRemovalAuthorized,false);assert.equal(diagnosis.recoveryAuthorized,false);
 assert.equal(diagnosis.pendingSha256,sha256(pendingBytes));
 await assert.rejects(diagnose({observeExternal:()=>afterRestart}),/local_pending_remote_diverged|checkpoint_scope/);
 await assert.rejects(diagnose({observeExternal:challenge=>signCheckpoint({...checkpoint,
  challenge,sequence:11,recordSha256:digest('wrong-record'),
  observedAt:new Date(Date.now()-100).toISOString(),validUntil:new Date(Date.now()+30000).toISOString()})}),/checkpoint_record_mismatch/);
 // Fresh response that still names the predecessor is also STOP, not a
 // proof that the delayed request will never execute.
 const priorObservation=challenge=>signCheckpoint({...previousLocal,schema:'sabora-backup-external-checkpoint/v1',
  challenge,recordSha256:sha256(Buffer.from(stableStringify(previousLocal))),
  observedAt:new Date(Date.now()-100).toISOString(),validUntil:new Date(Date.now()+30000).toISOString()});
 const predecessorDiagnosis=await diagnose({observeExternal:priorObservation});
 assert.equal(predecessorDiagnosis.phase,'external-still-predecessor');
 assert.equal(predecessorDiagnosis.blocked,true);
 assert.deepEqual(readFileSync(pendingPath),pendingBytes);assert.deepEqual(readFileSync(lockPath),lockBytes);
 assert.deepEqual(readFileSync(localRecordFile),localBytes);
 // Crash boundary after record.next was staged, before rename.
 const temporaryRecord=join(localControl,'record.next');
 writeFileSync(temporaryRecord,JSON.stringify(diskRecord()),{mode:0o600,flag:'wx'});
 try{
  assert.equal((await diagnose()).phase,'external-consumed');
  writeFileSync(temporaryRecord,JSON.stringify(previousLocal));
  await assert.rejects(diagnose(),/local_pending_temporary/);
 }finally{unlinkSync(temporaryRecord);}
 // Simulate a concurrent change during the observation; no phase result
 // from an observation of stale local bytes.
 try{
  await assert.rejects(diagnose({observeExternal:challenge=>{
   writeFileSync(pendingPath,Buffer.concat([pendingBytes,Buffer.from('\n')]));
   return observed(challenge);
  }}),/local_pending_changed/);
 }finally{writeFileSync(pendingPath,pendingBytes);}
 // Crash boundary after durable local publication, before pending removal.
 writeFileSync(localRecordFile,JSON.stringify(diskRecord()));
 try{
  const published=await diagnose();
  assert.equal(published.phase,'external-consumed');assert.equal(published.localSequence,11);
  assert.equal(published.blocked,true);assert.equal(published.lockRemovalAuthorized,false);
 }finally{writeFileSync(localRecordFile,localBytes);}
 assert.deepEqual(readFileSync(pendingPath),pendingBytes);assert.deepEqual(readFileSync(lockPath),lockBytes);
 assert.deepEqual(readFileSync(localRecordFile),localBytes);
 console.log('sabora_backup_interrupted_checkpoint_diagnosis_ok:'+JSON.stringify({
  observedConsumed:true,observedPredecessor:true,stillBlocked:true,slotsChanged:false,
  lockRemovalAuthorized:false,operationalAuthorization:false}));
 console.log('sabora_backup_installed_activation_sender_preflight_and_shell_ok:'+JSON.stringify({
  networkContacted:false,installed:false,operationalAuthorization:false,activationNegatives:rejectsActivation.length+4}));
 console.log('sabora_backup_preparation_artifact_and_signed_plan_ok:'+JSON.stringify({
  sourceSha,artifactSha256:first.artifactSha256,files:first.files,negativeCases:rejects.length+2,
  repeatReproducible:true,operationalAuthorization:false,installed:false}));
 // Only the unsigned closed source artifact survives; never store fixture
 // keys, a fixture signed production-candidate plan or a real dossier.
}finally{rmSync(root,{recursive:true,force:true});}
