// Verification only. Provisioning is a separate, explicitly approved operation.
import {readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {protectedBytes,trustedDirectory,sha256,exactKeys,releaseStop as stop} from './sabora-release-protected-store.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {EVIDENCE_KEYS,SABORA_RELEASE_SCOPE,stableStringify} from '../ci/sabora-release-governor.mjs';
export const CONTROLLER_PATHS=Object.freeze({
 root:'/etc/sabora/release',code:'/etc/sabora/release/code',
 publicKey:'/etc/sabora/release/owner-public.pem',config:'/etc/sabora/release/controller.json',
 installation:'/etc/sabora/release/installation.json',runtimeEnv:'/etc/sabora/release/runtime.env',
 evidence:'/var/lib/sabora-release/evidence',ledger:'/var/lib/sabora-release/authorizations',
 staging:'/srv/sabora/release/staging',bundles:'/srv/sabora/release/bundles',
 state:'/var/lib/sabora-release/controller'
});
export const CONTROLLER_TOOLS=Object.freeze({docker:'/usr/bin/docker',nft:'/usr/sbin/nft',ip:'/usr/sbin/ip',ss:'/usr/bin/ss',getfacl:'/usr/bin/getfacl',
 compose:'/etc/sabora/release/docker-config/cli-plugins/docker-compose'});
const hashValid=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const read=path=>protectedBytes(path,{maxBytes:4*1024*1024});
// All nine roles are cryptographically distinct. This does not certify
// that separate humans actually control their respective private keys.
export function assertDistinctReleaseAuthorities(config,ownerKey){
 if(!exactKeys(config.evidenceKeys,EVIDENCE_KEYS))stop('custodian_set_invalid');
 const fingerprints=[ownerKey,...EVIDENCE_KEYS.map(gate=>config.evidenceKeys[gate]),config.allocationKey,config.alertKey].map(authorityFingerprint);
 if(new Set(fingerprints).size!==fingerprints.length)stop('custodian_independence_unproven');
}
// Every approved configuration field, including mounts/TLS/runtime env,
// network reservation and authority keys, belongs to the signed subject.
// Exclude only its own digest to avoid a circular hash.
export function deriveInstallationSubject(config){
 const {subjectSha256:ignored,...expected}=config.expected;
 return sha256(stableStringify({schema:'sabora-release-installation-subject/v1',
  repository:SABORA_RELEASE_SCOPE.repository,project:SABORA_RELEASE_SCOPE.project,
  configuration:{...config,expected}}));
}
export function verifyControllerInstallation({environment='production'}={}){
 if(process.platform!=='linux'||process.geteuid?.()!==0||process.argv.length!==2)stop('root_entry_required');
 for(const path of [CONTROLLER_PATHS.root,CONTROLLER_PATHS.code,CONTROLLER_PATHS.evidence,
  CONTROLLER_PATHS.ledger,CONTROLLER_PATHS.staging,CONTROLLER_PATHS.bundles,CONTROLLER_PATHS.state])
  trustedDirectory(path,{privateDirectory:![CONTROLLER_PATHS.code,CONTROLLER_PATHS.root].includes(path)});
 const publicKey=read(CONTROLLER_PATHS.publicKey).toString('utf8');
 const installation=verifySignedDocument(read(CONTROLLER_PATHS.installation),publicKey,'sabora-controller-installation/v1');
 if(!exactKeys(installation,['schema','repository','sourceSha','environment','artifactSha256','configurationSha256','nodeSha256','launcherHashes','toolHashes','approvedAt'])||
  installation.repository!==SABORA_RELEASE_SCOPE.repository||installation.environment!==environment||
  !/^[0-9a-f]{40}$/.test(installation.sourceSha)||!hashValid(installation.artifactSha256)||
  !Number.isFinite(Date.parse(installation.approvedAt))||Date.parse(installation.approvedAt)>Date.now())stop('installation_not_authorized');
 // No mutable interpreter symlink or package-manager shim in the privileged path.
 const node='/etc/sabora/release/bin/node';
 if(realpathSync(process.execPath)!==node||sha256(protectedBytes(node,{maxBytes:150*1024*1024}))!==installation.nodeSha256)
  stop('interpreter_not_approved');
 if(!exactKeys(installation.launcherHashes,['root-entry','ssh-entry']))stop('launcher_manifest_missing');
 for(const [name,digest] of Object.entries(installation.launcherHashes))
  if(sha256(protectedBytes(CONTROLLER_PATHS.root+'/bin/'+name))!==digest)stop('launcher_changed');
 trustedDirectory(CONTROLLER_PATHS.root+'/docker-config',{privateDirectory:true});
 trustedDirectory(CONTROLLER_PATHS.root+'/docker-config/cli-plugins',{privateDirectory:true});
 if(!exactKeys(installation.toolHashes,Object.keys(CONTROLLER_TOOLS)))stop('tool_manifest_invalid');
 for(const [name,path] of Object.entries(CONTROLLER_TOOLS)){
  // Distribution tools can be symlinks, but both the resolution and all parents
  // must be root-controlled; only the fixed name is ever executable by driver.
  const target=realpathSync(path);trustedDirectory(dirname(path));
  if(sha256(protectedBytes(target,{maxBytes:150*1024*1024}))!==installation.toolHashes[name])stop('tool_changed');
 }
 const artifactBytes=read(join(CONTROLLER_PATHS.code,'artifact.json'));
 if(sha256(artifactBytes)!==installation.artifactSha256)stop('artifact_not_approved');
 const artifact=JSON.parse(artifactBytes);
 if(!exactKeys(artifact,['schema','repository','sourceSha','files'])||artifact.schema!=='sabora-controller-artifact/v1'||
  artifact.repository!==SABORA_RELEASE_SCOPE.repository||artifact.sourceSha!==installation.sourceSha||
  !artifact.files||typeof artifact.files!=='object'||Array.isArray(artifact.files)||Object.keys(artifact.files).length>80)
  stop('artifact_manifest_invalid');
 const installed=[];
 const visit=directory=>{for(const name of readdirSync(directory)){
  const path=join(directory,name),st=lstatSync(path);
  if(st.isSymbolicLink())stop('artifact_link');
  if(st.isDirectory()){trustedDirectory(path);visit(path);}else installed.push(path.slice(CONTROLLER_PATHS.code.length+1));
 }};visit(CONTROLLER_PATHS.code);
 if(installed.sort().join('|')!==['artifact.json',...Object.keys(artifact.files)].sort().join('|'))stop('artifact_extra_or_missing_file');
 for(const [relative,digest] of Object.entries(artifact.files)){
  if(!/^(scripts\/(ops|ci)\/sabora-release-[a-z-]+\.mjs|deploy\/sabora-release-[a-z-]+\.(c|conf|json))$/.test(relative)||
   !hashValid(digest)||sha256(read(join(CONTROLLER_PATHS.code,relative)))!==digest)stop('artifact_content_changed');
 }
 const configBytes=read(CONTROLLER_PATHS.config);
 if(sha256(configBytes)!==installation.configurationSha256)stop('configuration_not_approved');
 const config=JSON.parse(configBytes);
 if(!exactKeys(config,['schema','environment','evidenceKeys','allocationKey','alertKey','expected','compose','networkPolicy','reservationSha256','runtimeEnvSha256','mountHashes','tls','alert','quotaBytes'])||
  config.schema!=='sabora-controller-config/v1'||config.environment!==environment||
  !exactKeys(config.evidenceKeys,EVIDENCE_KEYS)||!exactKeys(config.compose,['operational','web'])||
  !Object.values(config.compose).every(hashValid)||!hashValid(config.reservationSha256)||
  !hashValid(config.runtimeEnvSha256)||!Number.isSafeInteger(config.quotaBytes)||config.quotaBytes<1611000000||config.quotaBytes>100*1024**3)
  stop('configuration_scope_invalid');
 assertDistinctReleaseAuthorities(config,publicKey);
 if(!exactKeys(config.expected,['subjectSha256','databaseIdentitySha256','migrationTreeSha256','appliedLedgerSha256','databaseTlsIdentitySha256',
  'networkPolicySha256','allocationReservationSha256','alertReceiverIdentitySha256'])||
  !Object.values(config.expected).every(hashValid)||
  config.expected.networkPolicySha256!==sha256(stableStringify(config.networkPolicy))||
  config.expected.allocationReservationSha256!==config.reservationSha256||
  config.expected.alertReceiverIdentitySha256!==authorityFingerprint(config.alertKey)||
  config.expected.subjectSha256!==deriveInstallationSubject(config))stop('configuration_subject_invalid');
 if(sha256(read(CONTROLLER_PATHS.runtimeEnv))!==config.runtimeEnvSha256)stop('runtime_env_changed');
 const reservationBytes=read(join(CONTROLLER_PATHS.state,'allocation.json'));
 if(sha256(reservationBytes)!==config.reservationSha256)stop('reservation_changed');
 const reservation=verifySignedDocument(reservationBytes,config.allocationKey,'sabora-allocation-reservation/v1');
 return Object.freeze({publicKey,config,reservation,environment,sourceSha:installation.sourceSha});
}
