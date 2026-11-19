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
export function verifyMaterialDossiers({receipt,documents,trust,expected,now=Date.now(),environment='production'}){
 if(!same(Object.keys(documents).sort(),[...EVIDENCE_KEYS].sort())||
  !same(Object.keys(trust).sort(),[...EVIDENCE_KEYS].sort()))stop('dossier_set_incomplete');
 const parsed={};
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
  parsed[gate]=doc.facts;
 }
 const restore=parsed.externalRestoreSha256;
 if(!exactKeys(restore,['backupSchema','sourceIdentitySha256','migrationTreeSha256','inventorySha256','restoredInventorySha256','components','replicas','restoredFrom','custodians'])||
  restore.backupSchema!=='sabora-logical-backup/v2'||restore.sourceIdentitySha256!==expected.databaseIdentitySha256||
  restore.migrationTreeSha256!==expected.migrationTreeSha256||!digest(restore.inventorySha256)||
  restore.restoredInventorySha256!==restore.inventorySha256||
  !exactKeys(restore.components,['roles-memberships','schema','data','inventory'])||
  !Object.values(restore.components).every(digest)||
  !Array.isArray(restore.replicas)||restore.replicas.length!==2||restore.restoredFrom!=='external-offsite'||
  !Array.isArray(restore.custodians)||restore.custodians.length!==2||new Set(restore.custodians).size!==2||
  !restore.custodians.every(digest))stop('external_restore_not_applicable');
 const copies=restore.replicas;
 if(copies[0].kind!=='external-offsite'||copies[1].kind!=='vps-encrypted-cache'||
  copies.some(c=>!exactKeys(c,['kind','storageIdentitySha256','ciphertextSha256'])||
   !digest(c.storageIdentitySha256)||!digest(c.ciphertextSha256))||
  copies[0].storageIdentitySha256===copies[1].storageIdentitySha256||
  copies[0].ciphertextSha256!==copies[1].ciphertextSha256)stop('dual_replica_proof_invalid');
 const sql=parsed.sqlProviderGateSha256;
 if(!exactKeys(sql,['sourceIdentitySha256','postgresMajor','migrationTreeSha256','appliedLedgerSha256','rolesAclSha256','tlsIdentitySha256','checks'])||
  sql.sourceIdentitySha256!==expected.databaseIdentitySha256||sql.postgresMajor!==17||
  sql.migrationTreeSha256!==expected.migrationTreeSha256||sql.appliedLedgerSha256!==expected.appliedLedgerSha256||
  !digest(sql.rolesAclSha256)||sql.tlsIdentitySha256!==expected.databaseTlsIdentitySha256||
  !same(sql.checks,['cv005-admin-only','runtime-no-owner-membership','force-rls','runtime-negative-access','hmac-identity','tls-verify-full']))
  stop('sql_provider_dossier_invalid');
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
 const review=parsed.independentReviewSha256;
 if(!exactKeys(review,['reviewedReleaseSha','reportSha256','reviewerIdentitySha256','findings','scope'])||
  review.reviewedReleaseSha!==receipt.releaseSha||!digest(review.reportSha256)||
  review.reviewerIdentitySha256!==authorityFingerprint(trust.independentReviewSha256)||
  review.scope!=='sabora-release-and-runtime'||!Array.isArray(review.findings)||
  new Set(review.findings.map(f=>f?.id)).size!==review.findings.length||
  review.findings.some(f=>!exactKeys(f,['id','resolution','decisionSha256'])||
   typeof f.id!=='string'||!f.id||!['closed','owner-accepted'].includes(f.resolution)||!digest(f.decisionSha256)))
  stop('independent_review_not_resolved');
 return {documents:parsed,authenticatedExternalClaims:true,locallyObserved:false};
}
