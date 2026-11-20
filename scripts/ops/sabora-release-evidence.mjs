// Candidate authenticated dossier schemas. External claims remain attestations
// by separately provisioned custodians, not observations made by the driver.
import {createPublicKey,verify} from 'node:crypto';
import {EVIDENCE_KEYS,SABORA_RELEASE_SCOPE,stableStringify} from '../ci/sabora-release-governor.mjs';
import {sha256,exactKeys,releaseStop as stop} from './sabora-release-protected-store.mjs';
const HEX=/^[0-9a-f]{64}$/;
const digest=v=>typeof v==='string'&&HEX.test(v)&&!/^0+$/.test(v);
const same=(a,b)=>stableStringify(a)===stableStringify(b);
export function authorityFingerprint(pem){
 let key;try{key=createPublicKey(pem);}catch{stop('document_key_invalid');}
 if(key.asymmetricKeyType!=='ed25519')stop('authority_key_type');
 return sha256(key.export({format:'der',type:'spki'}));
}
export function verifySignedDocument(bytes,key,expectedSchema){
 let wrapper;
 try{wrapper=JSON.parse(bytes.toString('utf8'));}catch{stop('signed_document_invalid');}
 if(!exactKeys(wrapper,['payload','signature'])||wrapper.payload?.schema!==expectedSchema||
  typeof wrapper.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(wrapper.signature))stop('signed_document_shape');
 let publicKey;try{publicKey=createPublicKey(key);}catch{stop('document_key_invalid');}
 if(publicKey.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(stableStringify(wrapper.payload)),
  publicKey,Buffer.from(wrapper.signature,'base64')))stop('document_signature_invalid');
 return wrapper.payload;
}
export function verifyMaterialDossiers({receipt,documents,trust,expected,now=Date.now(),environment='production',firstActivation=false}){
 if(!same(Object.keys(documents).sort(),[...EVIDENCE_KEYS].sort())||
  !same(Object.keys(trust).sort(),[...EVIDENCE_KEYS].sort()))stop('dossier_set_incomplete');
 const parsed={},observationTimes={};
 for(const gate of EVIDENCE_KEYS){
  const bytes=documents[gate];
  if(!Buffer.isBuffer(bytes)||bytes.length>1048576||sha256(bytes)!==receipt.evidence[gate])stop('dossier_digest_mismatch');
  const doc=verifySignedDocument(bytes,trust[gate],'sabora-material-evidence/v2');
  if(!exactKeys(doc,['schema','repository','project','gate','releaseSha','environment','subjectSha256','observedAt','validUntil','facts'])||
   doc.repository!==SABORA_RELEASE_SCOPE.repository||doc.project!=='sabora'||doc.gate!==gate||
   doc.releaseSha!==receipt.releaseSha||doc.environment!==environment||
   doc.subjectSha256!==expected.subjectSha256||!digest(doc.subjectSha256))stop('dossier_identity_mismatch');
  const observed=Date.parse(doc.observedAt),expires=Date.parse(doc.validUntil);
  // Validity is declared/signed by the accountable custodian, never invented
  // by this verifier. Local live observations have a separate freshness gate.
  if(!Number.isFinite(observed)||!Number.isFinite(expires)||observed>now||expires<=now||expires<=observed)
   stop('dossier_expired_or_future');
  parsed[gate]=doc.facts;observationTimes[gate]=observed;
 }
 const restore=parsed.externalRestoreSha256;
 const deferred=restore?.backupMode==='deferred-first-test-activation';
 if(deferred){
  // A signed, explicit absence of backup/restore is not recovery evidence.
  // The distinct DBA authority must independently attest the initial state.
  if(firstActivation!==true||receipt.operation!=='deploy'||
   !exactKeys(restore,['backupMode','sourceIdentitySha256','migrationTreeSha256',
    'ownerDecisionSha256','initialPreflightSha256','testDataOnly','realUsersAllowed','backupPerformed','restorePerformed'])||
   restore.sourceIdentitySha256!==expected.databaseIdentitySha256||
   restore.migrationTreeSha256!==expected.migrationTreeSha256||
   restore.testDataOnly!==true||restore.realUsersAllowed!==false||
   restore.backupPerformed!==false||restore.restorePerformed!==false||
   !digest(restore.ownerDecisionSha256)||!digest(restore.initialPreflightSha256)||
   restore.ownerDecisionSha256===restore.initialPreflightSha256)
   stop('deferred_first_test_activation_invalid');
 }
 const commonRestoreKeys=['backupSchema','sourceIdentitySha256','migrationTreeSha256','inventorySha256','restoredInventorySha256','components','replicas','restoredFrom','custodians'];
 const single=restore?.backupMode==='vps-only-first-activation';
 if(!deferred){
 if(!exactKeys(restore,single?[...commonRestoreKeys,'backupMode','ownerDecisionSha256','preinstallEvidenceSha256','testDataOnly','temporaryRestore']:commonRestoreKeys)||
  restore.backupSchema!=='sabora-logical-backup/v2'||restore.sourceIdentitySha256!==expected.databaseIdentitySha256||
  restore.migrationTreeSha256!==expected.migrationTreeSha256||!digest(restore.inventorySha256)||
  restore.restoredInventorySha256!==restore.inventorySha256||
  !exactKeys(restore.components,['roles-memberships','schema','data','inventory'])||
  !Object.values(restore.components).every(digest)||!Array.isArray(restore.replicas)||
  !Array.isArray(restore.custodians)||restore.custodians.length!==2||new Set(restore.custodians).size!==2||
  !restore.custodians.every(digest))stop('external_restore_not_applicable');
 const copies=restore.replicas;
 const validCopy=c=>exactKeys(c,['kind','storageIdentitySha256','ciphertextSha256'])&&
  digest(c.storageIdentitySha256)&&digest(c.ciphertextSha256);
 if(single){
  // Explicit owner-bound exception, never infer it from a missing copy.
  // Still requires actual off-host PG17 recovery and separate key custody.
  const temp=restore.temporaryRestore;
  if(firstActivation!==true||receipt.operation!=='deploy'||restore.testDataOnly!==true||
   !digest(restore.ownerDecisionSha256)||!digest(restore.preinstallEvidenceSha256)||
   restore.ownerDecisionSha256===restore.preinstallEvidenceSha256||
   copies.length!==1||!validCopy(copies[0])||copies[0].kind!=='vps-encrypted-cache'||
   restore.restoredFrom!=='temporary-external'||
   !exactKeys(temp,['environment','storageIdentitySha256','ciphertextSha256','recoveryEvidenceSha256','transientDataRemoved'])||
   temp.environment!=='isolated-postgres17-off-vps'||temp.transientDataRemoved!==true||
   !digest(temp.storageIdentitySha256)||temp.storageIdentitySha256===copies[0].storageIdentitySha256||
   temp.ciphertextSha256!==copies[0].ciphertextSha256||
   !digest(temp.recoveryEvidenceSha256)||
   new Set([restore.ownerDecisionSha256,restore.preinstallEvidenceSha256,temp.recoveryEvidenceSha256]).size!==3)
   stop('single_replica_first_activation_invalid');
 }else if(copies.length!==2||restore.restoredFrom!=='external-offsite'||
  !copies.every(validCopy)||copies[0].kind!=='external-offsite'||copies[1].kind!=='vps-encrypted-cache'||
  copies[0].storageIdentitySha256===copies[1].storageIdentitySha256||
  copies[0].ciphertextSha256!==copies[1].ciphertextSha256)stop('dual_replica_proof_invalid');
 }
 const sql=parsed.sqlProviderGateSha256;
 const sqlKeys=['sourceIdentitySha256','postgresMajor','migrationTreeSha256','appliedLedgerSha256','rolesAclSha256','tlsIdentitySha256','checks'];
 if(!exactKeys(sql,deferred?[...sqlKeys,'initialPreflight','migrationStartedAt','migrationCompletedAt','migrationStatus']:sqlKeys)||
  sql.sourceIdentitySha256!==expected.databaseIdentitySha256||sql.postgresMajor!==17||
  sql.migrationTreeSha256!==expected.migrationTreeSha256||sql.appliedLedgerSha256!==expected.appliedLedgerSha256||
  !digest(sql.rolesAclSha256)||sql.tlsIdentitySha256!==expected.databaseTlsIdentitySha256||
  !same(sql.checks,['cv005-admin-only','runtime-no-owner-membership','force-rls','runtime-negative-access','hmac-identity','tls-verify-full']))
  stop('sql_provider_dossier_invalid');
 if(deferred){
  // Preserve the actual signed pre-SQL statement, not only an unverified hash.
  // Canonical wrapper bytes give both authorities the same digest.
  if(!exactKeys(sql.initialPreflight,['payload','signature']))stop('initial_preflight_shape');
  const bytes=Buffer.from(stableStringify(sql.initialPreflight));
  if(sha256(bytes)!==restore.initialPreflightSha256)stop('initial_preflight_digest_mismatch');
  const pre=verifySignedDocument(bytes,trust.sqlProviderGateSha256,'sabora-initial-empty-preflight/v1');
  if(!exactKeys(pre,['schema','repository','project','environment','releaseSha','sourceIdentitySha256',
    'migrationTreeSha256','tlsIdentitySha256','postgresMajor','ownerDecisionSha256','catalogSha256',
    'initialState','checks','observedAt','validUntil'])||
   pre.repository!==SABORA_RELEASE_SCOPE.repository||pre.project!=='sabora'||pre.environment!==environment||
   pre.releaseSha!==receipt.releaseSha||pre.sourceIdentitySha256!==expected.databaseIdentitySha256||
   pre.migrationTreeSha256!==expected.migrationTreeSha256||pre.tlsIdentitySha256!==expected.databaseTlsIdentitySha256||
   pre.postgresMajor!==17||pre.ownerDecisionSha256!==restore.ownerDecisionSha256||
   !digest(pre.catalogSha256)||new Set([pre.catalogSha256,restore.ownerDecisionSha256,restore.initialPreflightSha256]).size!==3||
   pre.initialState!=='empty-sabora-scope'||
   !same(pre.checks,['sabora-schemas-absent','sabora-roles-and-memberships-absent','sabora-prefixed-objects-absent',
    'sabora-ledger-absent','pgcrypto-in-extensions','tls-verify-full']))
   stop('initial_preflight_not_empty_or_applicable');
  const observed=Date.parse(pre.observedAt),expires=Date.parse(pre.validUntil),
   started=Date.parse(sql.migrationStartedAt),completed=Date.parse(sql.migrationCompletedAt);
  if(![observed,expires,started,completed].every(Number.isFinite)||
   expires<=observed||expires-observed>24*3600000||observed>=started||started>=expires||
   completed<started||completed>observationTimes.sqlProviderGateSha256||
   observationTimes.sqlProviderGateSha256>observationTimes.externalRestoreSha256||
   sql.migrationStatus!=='complete-no-partial-failure')
   stop('initial_preflight_or_migration_chronology_invalid');
 }
 for(const [gate,kind,checks] of [
  ['ingressIsolationSha256','ingress',['approved-source-allowed','direct-origin-denied','wrong-port-denied','ipv6-denied','reverse-denied']],
  ['egressEnforcementSha256','egress',['approved-destination-allowed','foreign-destination-denied','wrong-port-denied','ipv6-denied','reverse-denied']]]){
  const net=parsed[gate];
  if(!exactKeys(net,['networkPolicySha256','allocationReservationSha256','checks','networkName'])||
   net.networkPolicySha256!==expected.networkPolicySha256||
   net.allocationReservationSha256!==expected.allocationReservationSha256||
   net.networkName!==(kind==='ingress'?'sabora_ingress_filtered':'sabora_egress_filtered')||!same(net.checks,checks))
   stop('network_dossier_invalid');
 }
 const alert=parsed.alertDeliverySha256;
 if(!exactKeys(alert,['receiverIdentitySha256','correlation','sentDigest','receivedDigest'])||
  alert.receiverIdentitySha256!==expected.alertReceiverIdentitySha256||!digest(alert.correlation)||
  !digest(alert.sentDigest)||alert.sentDigest!==alert.receivedDigest)stop('alert_dossier_invalid');
 const review=parsed.reviewEvidenceSha256;
 if(!exactKeys(review,['reviewedReleaseSha','reportSha256','reviewerIdentitySha256','findings','scope','reviewMode','ownerDecisionSha256'])||
  review.reviewedReleaseSha!==receipt.releaseSha||!digest(review.reportSha256)||
  review.reviewerIdentitySha256!==authorityFingerprint(trust.reviewEvidenceSha256)||
  review.scope!=='sabora-release-and-runtime'||!['independent','internal-first-activation'].includes(review.reviewMode)||
  (review.reviewMode==='independent'?review.ownerDecisionSha256!==null:
   (!firstActivation||receipt.operation!=='deploy'||!digest(review.ownerDecisionSha256)||review.ownerDecisionSha256===review.reportSha256))||
  !Array.isArray(review.findings)||
  new Set(review.findings.map(f=>f?.id)).size!==review.findings.length||
  review.findings.some(f=>!exactKeys(f,['id','resolution','decisionSha256'])||
   typeof f.id!=='string'||!f.id||!['closed','owner-accepted'].includes(f.resolution)||!digest(f.decisionSha256)))
  stop('release_review_not_resolved');
 return {documents:parsed,authenticatedExternalClaims:true,locallyObserved:false,reviewMode:review.reviewMode,backupMode:deferred?'deferred-first-test-activation':single?'vps-only-first-activation':'dual-retained',restoreAttested:!deferred};
}
