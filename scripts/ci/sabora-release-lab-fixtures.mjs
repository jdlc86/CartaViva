// Synthetic external authorities ONLY for the disposable lab. Not packaged in
// the installable controller. Production rejects the signed environment label.
import {generateKeyPairSync,sign,createPublicKey} from 'node:crypto';
import {EVIDENCE_KEYS,stableStringify} from './sabora-release-governor.mjs';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
export const LAB_ENVIRONMENT='disposable-lab';
export function labAuthority(){const pair=generateKeyPairSync('ed25519');return {
 ...pair,pem:pair.publicKey.export({type:'spki',format:'pem'}).toString()};}
export function signedLabDocument(payload,key){return Buffer.from(JSON.stringify({payload,
 signature:sign(null,Buffer.from(stableStringify(payload)),key.privateKey).toString('base64')})+'\n');}
export const labHash=value=>sha256('EXPLICIT-SYNTHETIC-LAB-ONLY:'+value);
export const keyIdentity=pem=>sha256(createPublicKey(pem).export({format:'der',type:'spki'}));
export function materialLabDossiers({sha,expected,keys,now=Date.now()}){
 const facts={
  externalRestoreSha256:{backupSchema:'sabora-logical-backup/v2',sourceIdentitySha256:expected.databaseIdentitySha256,
   migrationTreeSha256:expected.migrationTreeSha256,inventorySha256:labHash('inventory'),restoredInventorySha256:labHash('inventory'),
   components:Object.fromEntries(['roles-memberships','schema','data','inventory'].map(n=>[n,labHash(n)])),
   replicas:['external-offsite','vps-encrypted-cache'].map(kind=>({kind,storageIdentitySha256:labHash(kind),ciphertextSha256:labHash('ciphertext')})),
   restoredFrom:'external-offsite',custodians:[labHash('custodian1'),labHash('custodian2')]},
  sqlProviderGateSha256:{sourceIdentitySha256:expected.databaseIdentitySha256,postgresMajor:17,migrationTreeSha256:expected.migrationTreeSha256,
   appliedLedgerSha256:expected.appliedLedgerSha256,rolesAclSha256:labHash('acl'),tlsIdentitySha256:expected.databaseTlsIdentitySha256,
   checks:['cv005-admin-only','runtime-no-owner-membership','force-rls','runtime-negative-access','hmac-identity','tls-verify-full']},
  ingressIsolationSha256:{networkPolicySha256:expected.networkPolicySha256,allocationReservationSha256:expected.allocationReservationSha256,
   checks:['approved-source-allowed','direct-origin-denied','wrong-port-denied','ipv6-denied','reverse-denied'],networkName:'sabora_ingress_filtered'},
  egressEnforcementSha256:{networkPolicySha256:expected.networkPolicySha256,allocationReservationSha256:expected.allocationReservationSha256,
   checks:['approved-destination-allowed','foreign-destination-denied','wrong-port-denied','ipv6-denied','reverse-denied'],networkName:'sabora_egress_filtered'},
  alertDeliverySha256:{receiverIdentitySha256:expected.alertReceiverIdentitySha256,correlation:labHash('prior-correlation'),
   sentDigest:labHash('prior-event'),receivedDigest:labHash('prior-event')},
  independentReviewSha256:{reviewedReleaseSha:sha,reportSha256:labHash('synthetic-review'),reviewerIdentitySha256:labHash('synthetic-reviewer'),
   findings:[],scope:'sabora-release-and-runtime'}
 };
 return Object.fromEntries(EVIDENCE_KEYS.map(gate=>[gate,signedLabDocument({schema:'sabora-material-evidence/v2',
  repository:'jdlc86/CartaViva',project:'sabora',gate,releaseSha:sha,environment:LAB_ENVIRONMENT,
  subjectSha256:expected.subjectSha256,observedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+3600000).toISOString(),facts:facts[gate]},keys[gate])]));
}
