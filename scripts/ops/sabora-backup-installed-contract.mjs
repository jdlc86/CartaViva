// Candidate for a separately approved, time-bounded first real receipt.
// A signed preparation plan is NOT permission to receive data. Only the
// installation owner can issue a distinct activation for a measured host.
// Nothing in this module creates accounts, mounts, keys or opens a listener.
import {verifyBackupInstallationPlan} from './sabora-backup-installation-plan.mjs';
import {verifySignedDocument} from './sabora-release-evidence.mjs';
import {exactKeys,sha256} from './sabora-release-protected-store.mjs';
const stop=code=>{throw Error('sabora_backup_installed_contract_stop:'+code);};
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const positive=v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v);
const id=v=>typeof v==='string'&&/^SABORA-BACKUP-INSTALL-[A-Z0-9-]{8,64}$/.test(v);
export function verifyInstalledBackupActivation({planBytes,artifactBytes,activationBytes,ownerPublicKey,now=Date.now()}={}){
 const checked=verifyBackupInstallationPlan({planBytes,artifactBytes,ownerPublicKey,now});
 const plan=verifySignedDocument(planBytes,ownerPublicKey,'sabora-backup-installation-plan/v1');
 if(plan.environment!=='production-candidate')stop('production_plan_required');
 if(!Buffer.isBuffer(activationBytes)||activationBytes.length<1||activationBytes.length>262144)stop('activation_size');
 const a=verifySignedDocument(activationBytes,ownerPublicKey,'sabora-backup-receiver-activation/v1');
 if(!exactKeys(a,['schema','repository','project','environment','operation','sourceSha','artifactSha256',
  'planSha256','configurationSha256','installationId','hostIdentitySha256','uid','gid','device','guardInode',
  'independentReviewSha256','isolationEvidenceSha256','authorizedAt','validUntil'])||
  a.repository!=='jdlc86/CartaViva'||a.project!=='sabora'||a.environment!=='production'||
  a.operation!=='receive-encrypted-only'||a.sourceSha!==checked.sourceSha||
  a.artifactSha256!==checked.artifactSha256||a.planSha256!==checked.planSha256||
  a.configurationSha256!==checked.configurationSha256||!id(a.installationId)||
  ![a.hostIdentitySha256,a.independentReviewSha256,a.isolationEvidenceSha256].every(digest)||
  a.independentReviewSha256===a.isolationEvidenceSha256||
  !Number.isSafeInteger(a.uid)||a.uid<=0||a.uid===10001||
  !Number.isSafeInteger(a.gid)||a.gid<=0||a.gid===10001||
  !positive(a.device)||!positive(a.guardInode))stop('activation_scope');
 const from=Date.parse(a.authorizedAt),until=Date.parse(a.validUntil);
 if(!Number.isFinite(from)||!Number.isFinite(until)||from>now||until<=now||until<=from||
  from<Date.parse(plan.plannedAt)||until>Date.parse(plan.validUntil)||until-from>3600000)
  stop('activation_time');
 // This is an authenticated declaration by the owner, not proof that the
 // named filesystem, ACL, runtime or external review actually exists.
 // The receiver verifies material host state separately before accepting data.
 return Object.freeze({plan,activation:a,activationSha256:sha256(activationBytes),checked});
}
// Canonical SSH ED25519 public-key wire blob. Never hash comments, filenames
// or private key bytes as a replacement for the public key identity.
export function sshEd25519Sha256(publicKey){
 if(typeof publicKey!=='string'||!/^ssh-ed25519 [A-Za-z0-9+/]{68}$/.test(publicKey))stop('ssh_key_shape');
 const encoded=publicKey.slice('ssh-ed25519 '.length),blob=Buffer.from(encoded,'base64');
 if(blob.toString('base64')!==encoded||blob.length!==51||blob.readUInt32BE(0)!==11||
  blob.subarray(4,15).toString('ascii')!=='ssh-ed25519'||blob.readUInt32BE(15)!==32)stop('ssh_key_shape');
 return sha256(blob);
}
