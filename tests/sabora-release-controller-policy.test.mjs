import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMaterialDossiers,verifySignedDocument} from '../scripts/ops/sabora-release-evidence.mjs';
import {labAuthority,materialLabDossiers,labHash,signedLabDocument,LAB_ENVIRONMENT} from '../scripts/ci/sabora-release-lab-fixtures.mjs';
import {EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';
import {sha256} from '../scripts/ops/sabora-release-protected-store.mjs';
import {immutableComposeOverride,validateClosedCompose} from '../scripts/ops/sabora-release-compose-policy.mjs';
import {safeReleaseError} from '../scripts/ops/sabora-release-controller.mjs';
import {assertDistinctReleaseAuthorities,deriveInstallationSubject} from '../scripts/ops/sabora-release-installation.mjs';
import {assertOriginCertificateScope,validatePwaResponse} from '../scripts/ops/sabora-release-readiness.mjs';
import {releaseProcessStage,releaseProcessFailureKind} from '../scripts/ops/sabora-release-process.mjs';
test('material authority: synthetic evidence cannot pass production; authenticated wrong facts also fail',()=>{
 const keys=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,labAuthority()])),trust=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,keys[k].pem]));
 const expected=Object.fromEntries(['subjectSha256','databaseIdentitySha256','migrationTreeSha256','appliedLedgerSha256','databaseTlsIdentitySha256','networkPolicySha256','allocationReservationSha256','alertReceiverIdentitySha256'].map(k=>[k,labHash(k)]));
 const releaseSha='a'.repeat(40),documents=materialLabDossiers({sha:releaseSha,expected,keys});
 const receipt={releaseSha,operation:'deploy',evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,sha256(documents[k])]))};
 const input={receipt,documents,trust,expected,environment:LAB_ENVIRONMENT};
 assert.equal(verifyMaterialDossiers(input).authenticatedExternalClaims,true);
 assert.throws(()=>verifyMaterialDossiers({...input,environment:'production'}),/dossier_identity/);
 const cases=[['externalRestoreSha256',d=>d.facts.backupSchema='sabora-preinstall/v1'],
  ['externalRestoreSha256',d=>d.facts.replicas[1].storageIdentitySha256=d.facts.replicas[0].storageIdentitySha256],
  ['externalRestoreSha256',d=>d.facts.restoredInventorySha256=labHash('different')],
  ['sqlProviderGateSha256',d=>d.facts.appliedLedgerSha256=labHash('other-ledger')],
  ['sqlProviderGateSha256',d=>d.facts.checks.pop()],['ingressIsolationSha256',d=>d.facts.networkPolicySha256=labHash('other-policy')],
  ['egressEnforcementSha256',d=>d.facts.checks.pop()],['alertDeliverySha256',d=>d.facts.receivedDigest=labHash('other-alert')],
  ['reviewEvidenceSha256',d=>d.facts.reviewedReleaseSha='b'.repeat(40)],
  ['reviewEvidenceSha256',d=>d.facts.reviewerIdentitySha256=labHash('wrong-reviewer-key')],
  ['reviewEvidenceSha256',d=>d.facts.findings=[{id:'P1',resolution:'open',decisionSha256:labHash('decision')}]],
  ['reviewEvidenceSha256',d=>d.validUntil=new Date(Date.now()-5000).toISOString()]];
 for(const [gate,mutate] of cases){
  const doc=verifySignedDocument(documents[gate],trust[gate],'sabora-material-evidence/v2');mutate(doc);
  const bytes=signedLabDocument(doc,keys[gate]);
  assert.throws(()=>verifyMaterialDossiers({...input,documents:{...documents,[gate]:bytes},receipt:{...receipt,evidence:{...receipt.evidence,[gate]:sha256(bytes)}}}));
 }
 const review=verifySignedDocument(documents.reviewEvidenceSha256,trust.reviewEvidenceSha256,'sabora-material-evidence/v2');
 review.facts.reviewMode='internal-first-activation';review.facts.ownerDecisionSha256=labHash('owner-decision-first-activation');
 const internal=signedLabDocument(review,keys.reviewEvidenceSha256);
 const internalInput={...input,documents:{...documents,reviewEvidenceSha256:internal},
  receipt:{...receipt,evidence:{...receipt.evidence,reviewEvidenceSha256:sha256(internal)}}};
 assert.throws(()=>verifyMaterialDossiers(internalInput),/release_review_not_resolved/);
 assert.equal(verifyMaterialDossiers({...internalInput,firstActivation:true}).reviewMode,'internal-first-activation');
 assert.throws(()=>verifyMaterialDossiers({...internalInput,firstActivation:true,receipt:{...internalInput.receipt,operation:'rollback'}}),/release_review_not_resolved/);
 for(const decision of [null,review.facts.reportSha256]){
  const modified=structuredClone(review);modified.facts.ownerDecisionSha256=decision;
  const bytes=signedLabDocument(modified,keys.reviewEvidenceSha256);
  assert.throws(()=>verifyMaterialDossiers({...internalInput,firstActivation:true,documents:{...documents,reviewEvidenceSha256:bytes},
   receipt:{...receipt,evidence:{...receipt.evidence,reviewEvidenceSha256:sha256(bytes)}}}),/release_review_not_resolved/);
 }
 // A single retained replica is accepted only with an explicit signed
 // first-activation exception and a separate, actually asserted restore.
 const single=verifySignedDocument(documents.externalRestoreSha256,trust.externalRestoreSha256,'sabora-material-evidence/v2');
 const [external,vps]=single.facts.replicas;
 Object.assign(single.facts,{backupMode:'vps-only-first-activation',ownerDecisionSha256:labHash('single-owner-decision'),
  preinstallEvidenceSha256:labHash('preinstall-recovery'),testDataOnly:true,replicas:[vps],restoredFrom:'temporary-external',
  temporaryRestore:{environment:'isolated-postgres17-off-vps',storageIdentitySha256:external.storageIdentitySha256,
   ciphertextSha256:vps.ciphertextSha256,recoveryEvidenceSha256:labHash('temporary-pg17-restore'),transientDataRemoved:true}});
 const withRestore=(doc,base=input)=>{
  const bytes=signedLabDocument(doc,keys.externalRestoreSha256);
  return {...base,documents:{...base.documents,externalRestoreSha256:bytes},
   receipt:{...base.receipt,evidence:{...base.receipt.evidence,externalRestoreSha256:sha256(bytes)}}};
 };
 const singleInput=withRestore(single,internalInput);
 assert.equal(verifyMaterialDossiers({...singleInput,firstActivation:true}).backupMode,'vps-only-first-activation');
 assert.equal(verifyMaterialDossiers(input).backupMode,'dual-retained');
 assert.throws(()=>verifyMaterialDossiers(singleInput),/single_replica_first_activation_invalid/);
 assert.throws(()=>verifyMaterialDossiers({...singleInput,firstActivation:1}),/single_replica_first_activation_invalid/);
 assert.throws(()=>verifyMaterialDossiers({...singleInput,firstActivation:true,receipt:{...singleInput.receipt,operation:'rollback'}}),/single_replica_first_activation_invalid/);
 for(const mutate of [
  f=>delete f.backupMode,f=>f.backupMode='unknown',f=>f.testDataOnly=false,
  f=>f.ownerDecisionSha256=null,f=>f.preinstallEvidenceSha256=f.ownerDecisionSha256,
  f=>f.replicas=[],f=>f.replicas=[external],f=>f.replicas=[external,vps],
  f=>f.restoredFrom='external-offsite',f=>f.temporaryRestore.environment='vps',
  f=>f.temporaryRestore.transientDataRemoved=false,
  f=>f.temporaryRestore.storageIdentitySha256=vps.storageIdentitySha256,
  f=>f.temporaryRestore.ciphertextSha256=labHash('other-backup'),
  f=>f.temporaryRestore.recoveryEvidenceSha256=f.ownerDecisionSha256,
  f=>f.restoredInventorySha256=labHash('wrong-restored-inventory'),
  f=>f.custodians=[f.custodians[0],f.custodians[0]]
 ]){
  const modified=structuredClone(single);mutate(modified.facts);
  assert.throws(()=>verifyMaterialDossiers({...withRestore(modified,internalInput),firstActivation:true}),/restore|replica/);
 }
 const unsignedException={...singleInput,receipt:{...singleInput.receipt,evidence:{...singleInput.receipt.evidence,externalRestoreSha256:receipt.evidence.externalRestoreSha256}}};
 assert.throws(()=>verifyMaterialDossiers({...unsignedException,firstActivation:true}),/dossier_digest_mismatch/);
 const forged=JSON.parse(documents.reviewEvidenceSha256);forged.signature=Buffer.alloc(64).toString('base64');
 const bytes=Buffer.from(JSON.stringify(forged));assert.throws(()=>verifyMaterialDossiers({...input,
  documents:{...documents,reviewEvidenceSha256:bytes},receipt:{...receipt,evidence:{...receipt.evidence,reviewEvidenceSha256:sha256(bytes)}}}),/signature_invalid/);
});
test('root diagnostics redact arbitrary errors; immutable overlay has no mutable image tags or builds',()=>{
 assert.equal(safeReleaseError(Error('/run/secrets/db: password=never-log-this')),'sabora_controller_stop:internal_failure');
 const manifest={releaseSha:'a'.repeat(40),images:{api:{imageId:'sha256:'+'b'.repeat(64)},web:{imageId:'sha256:'+'c'.repeat(64)}}};
 const overlay=immutableComposeOverride(manifest);assert.match(overlay,/build: !reset null/);assert.match(overlay,/tmpfs: !override \[\/tmp, \/data, \/config\]/);
 assert.throws(()=>validateClosedCompose({name:'sabora',services:{},networks:{},secrets:{}},manifest),/compose_top_level/);
});

test('process failure diagnostics identify scoped phase without echoing raw Docker output',()=>{
 const marker='secret-raw-output-should-never-appear';
 const cases=[
  [['compose','--project-name','sabora','config','--format','json'],'docker_compose_config','yaml: invalid interpolation','compose_invalid'],
  [['compose','--project-name','sabora','up','--wait'],'docker_compose_up','container sabora-web-1 is unhealthy','healthcheck_failed'],
  [['image','load','--input','/private/'+marker],'docker_image_load','archive/tar: unexpected EOF','archive_load_failed'],
  [['image','inspect','private:'+marker],'docker_image_inspect','No such image: private','image_not_found'],
  [['container','inspect','sabora-web-1'],'docker_container_inspect','No such container: sabora-web-1','container_not_found'],
  [['network','inspect','sabora_ingress_filtered'],'docker_network_inspect','network not found','network_not_found'],
  [['exec','sabora-api-1','node','-e',marker],'docker_exec_ready','permission denied','permission_denied'],
  [['exec','sabora-sabora-egress-1','node','-e',marker],'docker_exec_alert','unexpected private output','exit_nonzero']
 ];
 for(const [args,stage,stderr,kind] of cases){
  assert.equal(releaseProcessStage('docker',args),stage);
  const reason=releaseProcessFailureKind(stderr+' '+marker);
  assert.equal(reason,kind);
  const rendered=safeReleaseError(Error('sabora_controller_stop:'+stage+'_failed_'+reason));
  assert.equal(rendered,'sabora_controller_stop:'+stage+'_failed_'+kind);
  assert.ok(!rendered.includes(marker));
 }
 assert.equal(releaseProcessFailureKind(marker),'exit_nonzero');
 assert.equal(releaseProcessStage(marker,[marker]),'unknown_tool');
});

test('installation binds all nine distinct authority keys and material configuration to the subject',()=>{
 const owner=labAuthority(),allocation=labAuthority(),alert=labAuthority();
 const evidenceKeys=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,labAuthority().pem]));
 const config={schema:'sabora-controller-config/v1',environment:LAB_ENVIRONMENT,evidenceKeys,
  allocationKey:allocation.pem,alertKey:alert.pem,expected:{subjectSha256:null},
  mountHashes:{manifest:labHash('manifest'),secrets:{'lab-secret':labHash('secret')}},
  runtimeEnvSha256:labHash('env'),tls:{certificateSha256:labHash('cert')}};
 assert.doesNotThrow(()=>assertDistinctReleaseAuthorities(config,owner.pem));
 for(const altered of [{...config,alertKey:evidenceKeys.reviewEvidenceSha256},
  {...config,allocationKey:owner.pem},{...config,alertKey:allocation.pem}]){
  assert.throws(()=>assertDistinctReleaseAuthorities(altered,owner.pem),/custodian_independence/);
 }
 const digest=deriveInstallationSubject(config);config.expected.subjectSha256=digest;
 assert.equal(deriveInstallationSubject(config),digest);
 for(const changed of [{...config,runtimeEnvSha256:labHash('other-env')},
  {...config,mountHashes:{...config.mountHashes,secrets:{'lab-secret':labHash('other-secret')}}},
  {...config,tls:{certificateSha256:labHash('different-cert')}}])
  assert.notEqual(deriveInstallationSubject(changed),digest);
});
test('exact origin certificate scope and PWA identity reject generic 200, swapped or stale bytes',()=>{
 const now=Date.UTC(2026,10,19),cert={subjectAltName:'DNS:sabora.allaiso.com, DNS:gestion-sabora.allaiso.com',
  validFrom:new Date(now-1000).toISOString(),validTo:new Date(now+8*86400000).toISOString()};
 assert.doesNotThrow(()=>assertOriginCertificateScope(cert,now));
 for(const changed of [{...cert,subjectAltName:cert.subjectAltName+', DNS:other.invalid'},
  {...cert,subjectAltName:'DNS:*.allaiso.com, DNS:gestion-sabora.allaiso.com'},
  {...cert,validTo:new Date(now+6*86400000).toISOString()}])
  assert.throws(()=>assertOriginCertificateScope(changed,now),/tls_san_or_validity/);
 const client=Buffer.from('<html><title>Sabora · Carta digital</title></html>');
 const wrong=Buffer.from('<html><title>Sabora · Gestión</title></html>');
 assert.doesNotThrow(()=>validatePwaResponse('client','index.html',client,sha256(client)));
 assert.throws(()=>validatePwaResponse('client','index.html',wrong,sha256(wrong)),/pwa_html_identity/);
 assert.throws(()=>validatePwaResponse('client','index.html',wrong,sha256(client)),/pwa_served_bytes_mismatch/);
 const manifest=Buffer.from(JSON.stringify({id:'/sabora-management-app',start_url:'/',scope:'/',display:'standalone'}));
 assert.throws(()=>validatePwaResponse('client','manifest.webmanifest',manifest,sha256(manifest)),/pwa_manifest_identity/);
 assert.doesNotThrow(()=>validatePwaResponse('management','manifest.webmanifest',manifest,sha256(manifest)));
});
