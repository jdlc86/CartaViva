// Root-owned, content-addressed installation V2. No external signatures.
// Only an authorized Sabora-only provisioner may first write these files.
// Root is explicitly the trust boundary; SSH release identity must be unprivileged.
import {readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {CONTROLLER_PATHS as P,CONTROLLER_TOOLS} from './sabora-release-installation.mjs';
import {protectedBytes,trustedDirectory,sha256,exactKeys,releaseStop as stop} from './sabora-release-protected-store.mjs';
import {SABORA_RELEASE_SCOPE,stableStringify} from '../ci/sabora-release-governor.mjs';

const HASH=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&!/^0+$/.test(v);
const read=path=>protectedBytes(path,{maxBytes:4*1024*1024});
function checkManifest(path,expectedSha){const bytes=read(path);
 if(sha256(bytes)!==expectedSha)stop('v2_install_hash_mismatch');return bytes;}
// Content-addressed proposal for the already staged, root-owned controller.
// This DOES NOT install anything and DOES NOT authorize the stage. An owner-
// authorized provisioner writes it once; verifyControllerInstallationV2 then
// independently verifies every pinned byte before privileged operations.
// No signing identity, private approval key, or sixth-party dossier.
export function deriveControllerInstallationManifestV2({
 environment='production',approvedAt=new Date().toISOString()
}={}){
 if(process.platform!=='linux'||process.geteuid?.()!==0)
  stop('v2_manifest_requires_root_linux');
 if(!['production','disposable-lab'].includes(environment)||
   !Number.isFinite(Date.parse(approvedAt))||
   new Date(Date.parse(approvedAt)).toISOString()!==approvedAt||
   Date.parse(approvedAt)>Date.now())stop('v2_manifest_invalid_scope');
 for(const path of [P.root,P.code])trustedDirectory(path);
 const artifactBytes=read(join(P.code,'artifact.json'));
 const artifact=JSON.parse(artifactBytes);
 if(!exactKeys(artifact,['schema','repository','sourceSha','files'])||
   artifact.schema!=='sabora-controller-artifact/v1'||
   artifact.repository!==SABORA_RELEASE_SCOPE.repository||
   !/^[a-f0-9]{40}$/.test(artifact.sourceSha)||
   !artifact.files||typeof artifact.files!=='object'||
   Array.isArray(artifact.files)||!Object.keys(artifact.files).length||
   Object.keys(artifact.files).length>90)stop('v2_manifest_source_untrusted');
 // Verify the entire source tree before proposing hashes. Hashing only
 // artifact.json would preserve a tampered file until the first invocation.
 const installed=[];
 const visit=dir=>{for(const name of readdirSync(dir)){
  const path=join(dir,name),st=lstatSync(path);
  if(st.isSymbolicLink())stop('v2_manifest_symlink');
  if(st.isDirectory()){trustedDirectory(path);visit(path);}
  else installed.push(path.slice(P.code.length+1));
 }};visit(P.code);
 if(installed.sort().join('|')!==['artifact.json',...Object.keys(artifact.files)].sort().join('|'))
  stop('v2_manifest_incomplete_tree');
 for(const [relative,digest] of Object.entries(artifact.files)){
  if(!/^(scripts\\/(ops|ci)\\/sabora-release-[a-z0-9-]+\\.mjs|deploy\\/sabora-release-[a-z-]+\\.(c|conf|json))$/.test(relative)||
   !HASH(digest)||sha256(read(join(P.code,relative)))!==digest)
   stop('v2_manifest_source_changed');
 }
 const configBytes=read(P.config),config=JSON.parse(configBytes);
 if(config.schema!=='sabora-controller-config/v2'||config.environment!==environment)
  stop('v2_manifest_configuration');
 const nodePath=join(P.root,'bin/node');
 trustedDirectory(join(P.root,'bin'));
 const launcherHashes=Object.fromEntries(['root-entry','ssh-entry'].map(name=>[
  name,sha256(protectedBytes(join(P.root,'bin',name),{maxBytes:150*1024*1024}))]));
 const toolHashes=Object.fromEntries(Object.entries(CONTROLLER_TOOLS).map(([name,path])=>{
  trustedDirectory(dirname(path));
  const resolved=realpathSync(path);
  return [name,sha256(protectedBytes(resolved,{maxBytes:150*1024*1024}))];
 }));
 return Object.freeze({
  schema:'sabora-controller-installation/v2',
  repository:SABORA_RELEASE_SCOPE.repository,sourceSha:artifact.sourceSha,
  environment,artifactSha256:sha256(artifactBytes),
  configurationSha256:sha256(configBytes),
  nodeSha256:sha256(protectedBytes(nodePath,{maxBytes:150*1024*1024})),
  launcherHashes,toolHashes,approvedAt
 });
}

export function verifyControllerInstallationV2({environment='production'}={}){
 if(process.platform!=='linux'||process.geteuid?.()!==0||process.argv.length!==2)
  stop('v2_root_entry_required');
 for(const path of [P.root,P.code,P.ledger,P.staging,P.bundles,P.state])
  trustedDirectory(path,{privateDirectory:![P.code,P.root].includes(path)});
 // The installed root-owned manifest is NOT a signature. It is a pinned
 // inventory for subsequent drift detection, written by authorized bootstrap.
 const installation=JSON.parse(read(P.installation));
 const fields=['schema','repository','sourceSha','environment','artifactSha256',
  'configurationSha256','nodeSha256','launcherHashes','toolHashes','approvedAt'];
 if(!exactKeys(installation,fields)||installation.schema!=='sabora-controller-installation/v2'||
   installation.repository!==SABORA_RELEASE_SCOPE.repository||
   installation.environment!==environment||!/^[a-f0-9]{40}$/.test(installation.sourceSha)||
   !HASH(installation.artifactSha256)||!HASH(installation.configurationSha256)||
   !HASH(installation.nodeSha256)||!Number.isFinite(Date.parse(installation.approvedAt))||
   Date.parse(installation.approvedAt)>Date.now())stop('v2_installation_manifest_invalid');
 const node=join(P.root,'bin/node');
 if(realpathSync(process.execPath)!==node||
  sha256(protectedBytes(node,{maxBytes:150*1024*1024}))!==installation.nodeSha256)
  stop('v2_interpreter_changed');
 if(!exactKeys(installation.launcherHashes,['root-entry','ssh-entry']))stop('v2_launcher_manifest');
 for(const [name,hash] of Object.entries(installation.launcherHashes))
  if(!HASH(hash)||sha256(read(join(P.root,'bin',name)))!==hash)stop('v2_launcher_changed');
 trustedDirectory(join(P.root,'docker-config'),{privateDirectory:true});
 trustedDirectory(join(P.root,'docker-config/cli-plugins'),{privateDirectory:true});
 if(!exactKeys(installation.toolHashes,Object.keys(CONTROLLER_TOOLS)))stop('v2_tools_manifest');
 for(const [name,path] of Object.entries(CONTROLLER_TOOLS)){
  const target=realpathSync(path);trustedDirectory(dirname(path));
  if(!HASH(installation.toolHashes[name])||
   sha256(protectedBytes(target,{maxBytes:150*1024*1024}))!==installation.toolHashes[name])
   stop('v2_tool_changed');
 }
 const artifact=JSON.parse(checkManifest(join(P.code,'artifact.json'),installation.artifactSha256));
 if(!exactKeys(artifact,['schema','repository','sourceSha','files'])||
  artifact.schema!=='sabora-controller-artifact/v1'||
  artifact.repository!==installation.repository||artifact.sourceSha!==installation.sourceSha||
  !artifact.files||typeof artifact.files!=='object'||Array.isArray(artifact.files)||
  Object.keys(artifact.files).length>90)stop('v2_artifact_invalid');
 const installed=[];
 const visit=dir=>{for(const name of readdirSync(dir)){
  const path=join(dir,name),st=lstatSync(path);
  if(st.isSymbolicLink())stop('v2_artifact_link');
  if(st.isDirectory()){trustedDirectory(path);visit(path);}
  else installed.push(path.slice(P.code.length+1));
 }};visit(P.code);
 if(installed.sort().join('|')!==['artifact.json',...Object.keys(artifact.files)].sort().join('|'))
  stop('v2_artifact_files');
 for(const [path,hash] of Object.entries(artifact.files)){
  if(!/^(scripts\/(ops|ci)\/sabora-release-[a-z0-9-]+\.mjs|deploy\/sabora-release-[a-z-]+\.(c|conf|json))$/.test(path)||
   !HASH(hash)||sha256(read(join(P.code,path)))!==hash)
   stop('v2_artifact_changed');
 }
 const config=JSON.parse(checkManifest(P.config,installation.configurationSha256));
 const required=['schema','environment','expected','compose','networkPolicy',
  'reservationSha256','runtimeEnvSha256','mountHashes','tls','alert','quotaBytes'];
 if(!exactKeys(config,required)||config.schema!=='sabora-controller-config/v2'||
  config.environment!==environment||
  !exactKeys(config.compose,['operational','web'])||
  !Object.values(config.compose).every(HASH)||
  !HASH(config.reservationSha256)||!HASH(config.runtimeEnvSha256)||
  !Number.isSafeInteger(config.quotaBytes)||config.quotaBytes<1611000000||
  config.quotaBytes>100*1024**3)stop('v2_config_invalid');
 const expected=['databaseIdentitySha256','migrationTreeSha256','appliedLedgerSha256',
  'databaseTlsIdentitySha256','networkPolicySha256','allocationReservationSha256'];
 if(!exactKeys(config.expected,expected)||!Object.values(config.expected).every(HASH)||
  config.expected.networkPolicySha256!==sha256(stableStringify(config.networkPolicy))||
  config.expected.allocationReservationSha256!==config.reservationSha256)
  stop('v2_expected_invalid');
 if(sha256(read(P.runtimeEnv))!==config.runtimeEnvSha256)stop('v2_runtime_env_changed');
 const reservation=JSON.parse(checkManifest(join(P.state,'allocation.json'),config.reservationSha256));
 if(reservation.schema!=='sabora-allocation-reservation/v1'||reservation.project!=='sabora'||
  reservation.host!==SABORA_RELEASE_SCOPE.host)stop('v2_reservation_invalid');
 // The source SHA and config digest are checked on every invocation. The
 // installation's origin is the separately authorized bootstrap operation.
 return Object.freeze({config,reservation,environment,sourceSha:installation.sourceSha,
  installationSchema:'sabora-controller-installation/v2'});
}
