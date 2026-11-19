import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMaterialDossiers,verifySignedDocument} from '../scripts/ops/sabora-release-evidence.mjs';
import {labAuthority,materialLabDossiers,labHash,signedLabDocument,LAB_ENVIRONMENT} from '../scripts/ci/sabora-release-lab-fixtures.mjs';
import {EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';
import {sha256} from '../scripts/ops/sabora-release-protected-store.mjs';
import {immutableComposeOverride,validateClosedCompose} from '../scripts/ops/sabora-release-compose-policy.mjs';
import {safeReleaseError} from '../scripts/ops/sabora-release-controller.mjs';
test('material authority: synthetic evidence cannot pass production; authenticated wrong facts also fail',()=>{
 const keys=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,labAuthority()])),trust=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,keys[k].pem]));
 const expected=Object.fromEntries(['subjectSha256','databaseIdentitySha256','migrationTreeSha256','appliedLedgerSha256','databaseTlsIdentitySha256','networkPolicySha256','allocationReservationSha256','alertReceiverIdentitySha256'].map(k=>[k,labHash(k)]));
 const releaseSha='a'.repeat(40),documents=materialLabDossiers({sha:releaseSha,expected,keys});
 const receipt={releaseSha,evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,sha256(documents[k])]))};
 const input={receipt,documents,trust,expected,environment:LAB_ENVIRONMENT};
 assert.equal(verifyMaterialDossiers(input).authenticatedExternalClaims,true);
 assert.throws(()=>verifyMaterialDossiers({...input,environment:'production'}),/dossier_identity/);
 const cases=[['externalRestoreSha256',d=>d.facts.backupSchema='sabora-preinstall/v1'],
  ['externalRestoreSha256',d=>d.facts.replicas[1].storageIdentitySha256=d.facts.replicas[0].storageIdentitySha256],
  ['externalRestoreSha256',d=>d.facts.restoredInventorySha256=labHash('different')],
  ['sqlProviderGateSha256',d=>d.facts.appliedLedgerSha256=labHash('other-ledger')],
  ['sqlProviderGateSha256',d=>d.facts.checks.pop()],['ingressIsolationSha256',d=>d.facts.networkPolicySha256=labHash('other-policy')],
  ['egressEnforcementSha256',d=>d.facts.checks.pop()],['alertDeliverySha256',d=>d.facts.receivedDigest=labHash('other-alert')],
  ['independentReviewSha256',d=>d.facts.reviewedReleaseSha='b'.repeat(40)],
  ['independentReviewSha256',d=>d.facts.findings=[{id:'P1',resolution:'open',decisionSha256:labHash('decision')}]],
  ['independentReviewSha256',d=>d.validUntil=new Date(Date.now()-5000).toISOString()]];
 for(const [gate,mutate] of cases){
  const doc=verifySignedDocument(documents[gate],trust[gate],'sabora-material-evidence/v2');mutate(doc);
  const bytes=signedLabDocument(doc,keys[gate]);
  assert.throws(()=>verifyMaterialDossiers({...input,documents:{...documents,[gate]:bytes},receipt:{...receipt,evidence:{...receipt.evidence,[gate]:sha256(bytes)}}}));
 }
 const forged=JSON.parse(documents.independentReviewSha256);forged.signature=Buffer.alloc(64).toString('base64');
 const bytes=Buffer.from(JSON.stringify(forged));assert.throws(()=>verifyMaterialDossiers({...input,
  documents:{...documents,independentReviewSha256:bytes},receipt:{...receipt,evidence:{...receipt.evidence,independentReviewSha256:sha256(bytes)}}}),/signature_invalid/);
});
test('root diagnostics redact arbitrary errors; immutable overlay has no mutable image tags or builds',()=>{
 assert.equal(safeReleaseError(Error('/run/secrets/db: password=never-log-this')),'sabora_controller_stop:internal_failure');
 const manifest={releaseSha:'a'.repeat(40),images:{api:{imageId:'sha256:'+'b'.repeat(64)},web:{imageId:'sha256:'+'c'.repeat(64)}}};
 const overlay=immutableComposeOverride(manifest);assert.match(overlay,/build: !reset null/);assert.match(overlay,/tmpfs: !override \[\/tmp, \/data, \/config\]/);
 assert.throws(()=>validateClosedCompose({name:'sabora',services:{},networks:{},secrets:{}},manifest),/compose_top_level/);
});
