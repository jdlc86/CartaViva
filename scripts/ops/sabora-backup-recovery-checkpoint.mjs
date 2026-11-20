// Offline verification of an independently held recovery checkpoint.
// This module does not contact a custodian, issue a challenge, advance the
// external ledger or authorize a recovery. A fresh challenge must come
// from the live coordinator; a restored local nonce is not sufficient.
import {exactKeys,sha256} from './sabora-release-protected-store.mjs';
import {verifySignedDocument,authorityFingerprint} from './sabora-release-evidence.mjs';
import {stableStringify} from '../ci/sabora-release-governor.mjs';
const stop=code=>{throw Error('sabora_backup_checkpoint_stop:'+code);};
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const seq=v=>Number.isSafeInteger(v)&&v>=0&&v<Number.MAX_SAFE_INTEGER;
const identityFields=['installationId','hostIdentitySha256','storageIdentitySha256',
 'externalStorageIdentitySha256','controlStorageIdentitySha256','recoveryAuthoritySha256'];
function identity(expected){
 if(!exactKeys(expected,identityFields)||
  !/^SABORA-BACKUP-INSTALL-[A-Z0-9-]{8,64}$/.test(expected.installationId??'')||
  !identityFields.slice(1).every(k=>digest(expected[k]))||
  new Set([expected.storageIdentitySha256,expected.externalStorageIdentitySha256,
   expected.controlStorageIdentitySha256]).size!==3)stop('identity');
}
export function validateRecoveryControlRecord(record,expected){
 identity(expected);
 if(!exactKeys(record,['schema','repository','project','environment',...identityFields,
  'sequence','authorizationSha256','lockSha256'])||
  record.schema!=='sabora-backup-control-record/v1'||record.repository!=='jdlc86/CartaViva'||
  record.project!=='sabora'||record.environment!=='production'||
  identityFields.some(k=>record[k]!==expected[k])||!seq(record.sequence)||
  (record.sequence===0?(record.authorizationSha256!==null||record.lockSha256!==null):
   (!digest(record.authorizationSha256)||!digest(record.lockSha256))))stop('record');
}
export function verifyExternalRecoveryCheckpoint({record,expected,challenge,checkpointBytes,
 checkpointPublicKey,ownerPublicKey,recoveryPublicKey,verificationPublicKey,now=Date.now()}={}){
 identity(expected);
 validateRecoveryControlRecord(record,expected);
 if(!digest(challenge)||!Buffer.isBuffer(checkpointBytes)||checkpointBytes.length<1||
  checkpointBytes.length>16384)stop('checkpoint_input');
 const fingerprints=[checkpointPublicKey,ownerPublicKey,recoveryPublicKey,verificationPublicKey].map(authorityFingerprint);
 if(new Set(fingerprints).size!==4||fingerprints[2]!==expected.recoveryAuthoritySha256)stop('authority_alias');
 const p=verifySignedDocument(checkpointBytes,checkpointPublicKey,'sabora-backup-external-checkpoint/v1');
 if(!exactKeys(p,['schema','repository','project','environment',...identityFields,'challenge',
  'sequence','authorizationSha256','lockSha256','recordSha256','observedAt','validUntil'])||
  p.repository!=='jdlc86/CartaViva'||p.project!=='sabora'||p.environment!=='production'||
  identityFields.some(k=>p[k]!==expected[k])||p.challenge!==challenge||!seq(p.sequence))
  stop('checkpoint_scope');
 const from=Date.parse(p.observedAt),until=Date.parse(p.validUntil);
 if(!Number.isFinite(now)||!Number.isFinite(from)||!Number.isFinite(until)||from>now||
  until<=now||until<=from||until-from>120000)stop('checkpoint_time');
 if(p.sequence!==record.sequence)stop(p.sequence>record.sequence?'local_rollback_or_loss':'external_checkpoint_stale');
 if(p.authorizationSha256!==record.authorizationSha256||p.lockSha256!==record.lockSha256||
  p.recordSha256!==sha256(Buffer.from(stableStringify(record))))stop('checkpoint_record_mismatch');
 return Object.freeze({schema:'sabora-backup-checkpoint-comparison/v1',sequence:record.sequence,
  checkpointSha256:sha256(checkpointBytes),matches:true,externalAdvancePerformed:false,
  recoveryAuthorized:false,operationalAuthorization:false});
}
