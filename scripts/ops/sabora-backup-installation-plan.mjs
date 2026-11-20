// Offline preparation contract, not an installer or operational authority.
// Receipt cannot be used by the current lab receiver or rotation runtime.
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {exactKeys,sha256} from './sabora-release-protected-store.mjs';
import {authorityFingerprint,verifySignedDocument} from './sabora-release-evidence.mjs';
import {stableStringify} from '../ci/sabora-release-governor.mjs';

export const BACKUP_INSTALL_PATHS=Object.freeze({
 config:'/etc/sabora/backup',code:'/etc/sabora/backup/code',
 node:'/etc/sabora/backup/bin/node',shell:'/etc/sabora/backup/bin/receive',
 hostKey:'/etc/sabora/backup/host-ed25519',authorizedKeys:'/etc/sabora/backup/authorized_keys',
 volume:'/srv/sabora-backup',cache:'/srv/sabora-backup/cache',
 recovery:'/srv/sabora-backup/recovery',guard:'/srv/sabora-backup/.cache.rotation.guard',
 control:'/var/lib/sabora-backup-control',
 pidFile:'/run/sabora-backup/sshd.pid',account:'sabora-backup'
});
// The volume/cache layout is a design candidate: placing the cache below
// its separate mount confines the guard and cache; the recovery-control
// ledger belongs outside that filesystem. The private recovery directory
// within the volume remains reserved, not a trusted sequence store. This is
// a preparation proposal only. The production rotation route is NOT enabled.
export const BACKUP_PREPARATION_FILES=Object.freeze([
 'deploy/sabora-backup-lab-shell.c',
 'deploy/sabora-backup-installed-shell.c',
 'scripts/ops/sabora-backup-installed-contract.mjs',
 'scripts/ops/sabora-backup-installation-stager.mjs',
 'scripts/ops/sabora-backup-installed-receiver.mjs',
 'scripts/ops/sabora-backup-installed-entry.mjs',
 'scripts/ops/sabora-backup-installed-send.mjs',
 'scripts/ops/sabora-backup-governed-lab-entry.mjs',
 'scripts/ops/sabora-backup-recovery-fence.mjs',
 'scripts/ops/sabora-backup-recovery-checkpoint.mjs',
 'scripts/ops/sabora-backup-recovery-coordinator.mjs',
 'scripts/ci/sabora-release-governor.mjs',
 'scripts/ops/sabora-backup-installation-plan.mjs',
 'scripts/ops/sabora-encrypted-backup-bundle.mjs',
 'scripts/ops/sabora-ntfs-acl-verifier.mjs',
 'scripts/ops/sabora-postgres-snapshot.mjs',
 'scripts/ops/sabora-release-evidence.mjs',
 'scripts/ops/sabora-release-protected-store.mjs',
 'scripts/ops/sabora-vps-backup-rotation.mjs',
 'scripts/ops/sabora-vps-backup-transport.mjs',
 'scripts/ops/sabora-vps-backup-wire.mjs',
].sort());
const stop=code=>{throw Error('sabora_backup_install_plan_stop:'+code);};
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const sha=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const integer=(v,min)=>Number.isSafeInteger(v)&&v>=min;
const reservedPorts=new Set([22,80,443,8443]);
function address(v){
 // Numeric unicast addresses only. No wildcard, zones, DNS or CIDR
 // patterns are substituted into the proposed listener configuration.
 if(typeof v!=='string'||!isIP(v)||v.includes('%'))return false;
 if(isIP(v)===4){
  const [first]=v.split('.').map(Number);
  return first>0&&first<224;
 }
 // Restrict IPv6 to ordinary unicast (not mapped IPv4, multicast,
 // link-local or unspecified). Loopback is allowed for lab plans only.
 return v==='::1'||/^[23][0-9a-f]{3}:/i.test(v)||/^f[cd][0-9a-f]{2}:/i.test(v);
}
export function validateBackupPreparationManifest(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>262144)stop('artifact_size');
 let m;try{m=JSON.parse(bytes.toString('utf8'));}catch{stop('artifact_json');}
 if(!exactKeys(m,['schema','repository','project','sourceSha','purpose','files'])||
  m.schema!=='sabora-backup-preparation-artifact/v1'||m.repository!=='jdlc86/CartaViva'||m.project!=='sabora'||
  !sha(m.sourceSha)||m.purpose!=='offline-preparation-not-installer'||
  !exactKeys(m.files,BACKUP_PREPARATION_FILES)||!Object.values(m.files).every(hash))stop('artifact_manifest');
 return m;
}
export function verifyBackupInstallationPlan({planBytes,ownerPublicKey,artifactBytes,now=Date.now()}={}){
 if(!Buffer.isBuffer(planBytes)||planBytes.length<1||planBytes.length>262144)stop('plan_size');
 const manifest=validateBackupPreparationManifest(artifactBytes);
 const p=verifySignedDocument(planBytes,ownerPublicKey,'sabora-backup-installation-plan/v1');
 if(!exactKeys(p,['schema','repository','project','environment','sourceSha','artifactSha256',
  'plannedAt','validUntil','account','paths','transport','storage','authorities','runtime'])||
  p.repository!=='jdlc86/CartaViva'||p.project!=='sabora'||
  !['disposable-lab','production-candidate'].includes(p.environment)||
  p.sourceSha!==manifest.sourceSha||p.artifactSha256!==sha256(artifactBytes)||
  p.account!==BACKUP_INSTALL_PATHS.account||
  !exactKeys(p.paths,['config','volume','cache','recovery','guard','control'])||
  p.paths.config!==BACKUP_INSTALL_PATHS.config||p.paths.volume!==BACKUP_INSTALL_PATHS.volume||
  p.paths.cache!==BACKUP_INSTALL_PATHS.cache||p.paths.recovery!==BACKUP_INSTALL_PATHS.recovery||
  p.paths.guard!==BACKUP_INSTALL_PATHS.guard||p.paths.control!==BACKUP_INSTALL_PATHS.control)stop('plan_scope');
 const start=Date.parse(p.plannedAt),end=Date.parse(p.validUntil);
 if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||start>now||end<=now||end<=start||
  end-start>24*3600000)stop('plan_expired');
 const t=p.transport;
 if(!exactKeys(t,['listenAddress','port','clientAddress','hostKeySha256','clientKeySha256'])||
  !address(t.listenAddress)||!address(t.clientAddress)||!integer(t.port,1024)||t.port>65535||reservedPorts.has(t.port)||
  !hash(t.hostKeySha256)||!hash(t.clientKeySha256)||t.hostKeySha256===t.clientKeySha256||
  (p.environment==='production-candidate'&&[t.listenAddress,t.clientAddress].some(x=>x.startsWith('127.')||x==='::1')))
  stop('transport_scope');
 const s=p.storage;
 if(!exactKeys(s,['filesystem','filesystemUuid','filesystemBytes','quotaBytes','reserveBytes','maxBundleBytes',
  'metadataBudgetBytes','storageIdentitySha256','externalStorageIdentitySha256','systemIdentifier'])||
  s.filesystem!=='ext4'||!(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/).test(s.filesystemUuid)||
  /^0{8}(-0{4}){3}-0{12}$/.test(s.filesystemUuid)||
  !integer(s.filesystemBytes,1)||!integer(s.quotaBytes,1)||s.quotaBytes>s.filesystemBytes||
  !integer(s.reserveBytes,1048576)||!integer(s.metadataBudgetBytes,4*1024**2)||
  !integer(s.maxBundleBytes,1)||s.maxBundleBytes>4*1024**3+262144||
  !hash(s.storageIdentitySha256)||!hash(s.externalStorageIdentitySha256)||
  s.storageIdentitySha256===s.externalStorageIdentitySha256||!/^[0-9]{10,20}$/.test(s.systemIdentifier))
  stop('storage_scope');
 // Logical budget for the worst allowed admission: two complete bundles,
 // temporary promotion metadata, persistent guard/sequence and reserve.
 if(2n*BigInt(s.maxBundleBytes)+BigInt(s.metadataBudgetBytes)+BigInt(s.reserveBytes)>BigInt(s.quotaBytes))
  stop('two_generation_capacity');
 if(!exactKeys(p.authorities,['verificationPublicKey','recoveryPublicKey']))stop('authority_scope');
 const fingerprints=[ownerPublicKey,p.authorities.verificationPublicKey,p.authorities.recoveryPublicKey].map(authorityFingerprint);
 if(new Set(fingerprints).size!==3)stop('authority_alias');
 if(!exactKeys(p.runtime,['nodeSha256','shellSha256','sshdSha256','flockSha256'])||
  !Object.values(p.runtime).every(hash))stop('runtime_identity');
 // Plan digest and rendered configuration do not attest actual occupancy,
 // mount identity, effective ACLs, key ownership, binaries or firewall.
 const conf=[
  '# PREPARATION ONLY: entry point and account are not provisioned.',
  'ListenAddress '+t.listenAddress,'Port '+t.port,'HostKey '+BACKUP_INSTALL_PATHS.hostKey,
  'PidFile '+BACKUP_INSTALL_PATHS.pidFile,'AllowUsers '+BACKUP_INSTALL_PATHS.account+'@'+t.clientAddress,
  'AuthorizedKeysFile '+BACKUP_INSTALL_PATHS.authorizedKeys,'StrictModes yes',
  'AuthenticationMethods publickey','PubkeyAuthentication yes','PasswordAuthentication no',
  'KbdInteractiveAuthentication no','PermitRootLogin no','UsePAM no','PermitTTY no','DisableForwarding yes',
  'AllowTcpForwarding no','AllowAgentForwarding no','X11Forwarding no','PermitTunnel no',
  'PermitUserRC no','PermitUserEnvironment no','ForceCommand '+BACKUP_INSTALL_PATHS.shell,
  'MaxSessions 1','MaxAuthTries 2','LoginGraceTime 20',''
 ].join('\n');
 return Object.freeze({schema:'sabora-backup-installation-plan-result/v1',sourceSha:p.sourceSha,
  planSha256:sha256(stableStringify(p)),artifactSha256:p.artifactSha256,
  configurationSha256:createHash('sha256').update(conf).digest('hex'),sshdConfiguration:conf,
  operationalAuthorization:false,installed:false,receiverAvailable:false,
  status:'STOP_PENDING_PROVISIONING_AND_REVIEW'});
}
