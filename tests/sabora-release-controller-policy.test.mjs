import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMaterialDossiers,verifySignedDocument} from '../scripts/ops/sabora-release-evidence.mjs';
import {labAuthority,materialLabDossiers,labHash,signedLabDocument,LAB_ENVIRONMENT} from '../scripts/ci/sabora-release-lab-fixtures.mjs';
import {EVIDENCE_KEYS,stableStringify} from '../scripts/ci/sabora-release-governor.mjs';
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

test('deferred recovery: only initial test deploy with distinct signed pre-SQL empty-state evidence',()=>{
 const now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
 const keys=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,labAuthority()]));
 const trust=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,keys[k].pem]));
 const expected=Object.fromEntries(['subjectSha256','databaseIdentitySha256','migrationTreeSha256','appliedLedgerSha256','databaseTlsIdentitySha256','networkPolicySha256','allocationReservationSha256','alertReceiverIdentitySha256'].map(k=>[k,labHash(k)]));
 const releaseSha='d'.repeat(40),original=materialLabDossiers({sha:releaseSha,expected,keys,now});
 const get=k=>verifySignedDocument(original[k],trust[k],'sabora-material-evidence/v2');
 const pre={schema:'sabora-initial-empty-preflight/v1',repository:'jdlc86/CartaViva',project:'sabora',
  environment:LAB_ENVIRONMENT,releaseSha,sourceIdentitySha256:expected.databaseIdentitySha256,
  migrationTreeSha256:expected.migrationTreeSha256,tlsIdentitySha256:expected.databaseTlsIdentitySha256,
  postgresMajor:17,ownerDecisionSha256:labHash('owner-deferral'),catalogSha256:labHash('observed-empty-catalog'),
  initialState:'empty-sabora-scope',checks:['sabora-schemas-absent','sabora-roles-and-memberships-absent',
   'sabora-prefixed-objects-absent','sabora-ledger-absent','pgcrypto-in-extensions','tls-verify-full'],
  observedAt:iso(-60000),validUntil:iso(60000)};
 const deferral=get('externalRestoreSha256'),sql=get('sqlProviderGateSha256');
 deferral.facts={backupMode:'deferred-first-test-activation',sourceIdentitySha256:expected.databaseIdentitySha256,
  migrationTreeSha256:expected.migrationTreeSha256,ownerDecisionSha256:pre.ownerDecisionSha256,
  initialPreflightSha256:null,testDataOnly:true,realUsersAllowed:false,backupPerformed:false,restorePerformed:false};
 Object.assign(sql.facts,{initialPreflight:null,migrationStartedAt:iso(-50000),migrationCompletedAt:iso(-2000),
  migrationStatus:'complete-no-partial-failure'});
 const make=({changePre,changeSql,changeDeferral,preKey=keys.sqlProviderGateSha256}={})=>{
  const p=structuredClone(pre),s=structuredClone(sql),d=structuredClone(deferral);
  changePre?.(p);s.facts.initialPreflight=JSON.parse(signedLabDocument(p,preKey));
  d.facts.initialPreflightSha256=sha256(Buffer.from(stableStringify(s.facts.initialPreflight)));
  changeSql?.(s);changeDeferral?.(d);
  const documents={...original,sqlProviderGateSha256:signedLabDocument(s,keys.sqlProviderGateSha256),
   externalRestoreSha256:signedLabDocument(d,keys.externalRestoreSha256)};
  return {receipt:{releaseSha,operation:'deploy',evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,sha256(documents[k])]))},
   documents,trust,expected,environment:LAB_ENVIRONMENT,now,firstActivation:true};
 };
 const input=make(),accepted=verifyMaterialDossiers(input);
 assert.equal(accepted.backupMode,'deferred-first-test-activation');
 assert.equal(accepted.restoreAttested,false);
 assert.equal(accepted.locallyObserved,false);
 assert.throws(()=>verifyMaterialDossiers({...input,firstActivation:false}),/deferred_first_test/);
 assert.throws(()=>verifyMaterialDossiers({...input,firstActivation:1}),/deferred_first_test/);
 assert.throws(()=>verifyMaterialDossiers({...input,receipt:{...input.receipt,operation:'rollback'}}),/deferred_first_test/);
 assert.throws(()=>verifyMaterialDossiers({...input,environment:'production'}),/dossier_identity/);
 for(const changeDeferral of [d=>delete d.facts.backupMode,d=>d.facts.realUsersAllowed=true,
  d=>d.facts.testDataOnly=false,d=>d.facts.backupPerformed=true,d=>d.facts.restorePerformed=true,
  d=>d.facts.ownerDecisionSha256=null,d=>d.facts.sourceIdentitySha256=labHash('foreign'),
  d=>d.facts.initialPreflightSha256=labHash('wrong-preflight'),d=>d.facts.replicas=[]])
  assert.throws(()=>verifyMaterialDossiers(make({changeDeferral})));
 for(const changePre of [p=>p.initialState='partial-install',p=>p.checks.pop(),
  p=>p.environment='production',p=>p.releaseSha='e'.repeat(40),p=>p.project='other',
  p=>p.sourceIdentitySha256=labHash('other-source'),p=>p.migrationTreeSha256=labHash('other-tree'),
  p=>p.tlsIdentitySha256=labHash('other-tls'),p=>p.ownerDecisionSha256=labHash('other-decision'),
  p=>p.catalogSha256='0'.repeat(64),p=>p.postgresMajor=16,p=>p.observedAt=iso(-40000),
  p=>p.validUntil=iso(-50001),p=>p.validUntil=iso(2*86400000)])
  assert.throws(()=>verifyMaterialDossiers(make({changePre})));
 for(const changeSql of [s=>delete s.facts.initialPreflight,s=>s.facts.migrationStatus='partial',
  s=>s.facts.migrationStartedAt=iso(-60000),s=>s.facts.migrationCompletedAt=iso(-60001),
  s=>s.facts.migrationCompletedAt=iso(1000),s=>s.facts.checks.pop(),
  s=>s.facts.appliedLedgerSha256=labHash('wrong-ledger')])
  assert.throws(()=>verifyMaterialDossiers(make({changeSql})));
 assert.throws(()=>verifyMaterialDossiers(make({preKey:keys.externalRestoreSha256})),/document_signature_invalid/);
 assert.throws(()=>verifyMaterialDossiers({...input,receipt:{...input.receipt,evidence:{...input.receipt.evidence,
  externalRestoreSha256:sha256(original.externalRestoreSha256)}}}),/dossier_digest_mismatch/);
 // Ordinary SQL shape and ordinary restore remain necessary together; a
 // deferral cannot be smuggled into a later dual-retained operation.
 const ordinary=make(),documents={...ordinary.documents,externalRestoreSha256:original.externalRestoreSha256};
 assert.throws(()=>verifyMaterialDossiers({...ordinary,documents,receipt:{...ordinary.receipt,evidence:{...ordinary.receipt.evidence,
  externalRestoreSha256:sha256(documents.externalRestoreSha256)}}}),/sql_provider_dossier_invalid/);
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
