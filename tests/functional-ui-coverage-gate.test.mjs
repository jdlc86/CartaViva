import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {auditFunctionalUi,inspectFunctionalUi,COVERAGE_FILE}
 from '../scripts/ci/functional-ui-coverage-gate.mjs';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(join(root,COVERAGE_FILE),'utf8'));
const realRead=path=>{try{return readFileSync(join(root,path),'utf8');}catch{return null;}};

test('integral functional coverage: candidate interfaces and scenarios exist, CV-014 gaps are not misreported as complete',()=>{
 const report=auditFunctionalUi(root);
 assert.deepEqual(report.errors,[]);
 assert.equal(report.gaps.length,2);
 assert(!report.gaps.some(x=>x.id==='CV-014-comunicaciones-anuncios'));
 assert(manifest.capabilities.find(x=>x.id==='CV-014-comunicaciones-anuncios').status==='CANDIDATO_TECNICO');
});

test('promoting announcements requires visible client UI, management UI, server boundary and real integration proof',()=>{
 const candidate=structuredClone(manifest);
 const row=candidate.capabilities.find(x=>x.id==='CV-014-comunicaciones-anuncios');
 row.status='CANDIDATO_TECNICO';row.ui=[];row.api=[];row.evidence=[];
 const missing=inspectFunctionalUi({manifest:candidate,read:realRead});
 assert(missing.errors.includes('missing_visible_ui_entrypoint:CV-014-comunicaciones-anuncios:client'));
 assert(missing.errors.includes('missing_visible_ui_entrypoint:CV-014-comunicaciones-anuncios:management'));
 assert(missing.errors.includes('missing_server_boundary:CV-014-comunicaciones-anuncios'));
 assert(missing.errors.includes('missing_integration_layer:CV-014-comunicaciones-anuncios:postgres17'));
 assert(!missing.errors.includes('announcements_still_hidden_in_client'));
 assert(realRead('apps/client/src/App.tsx').includes('<CommunicationsBar'));
 const forbidden=inspectFunctionalUi({manifest:candidate,
  read:path=>path==='apps/client/src/App.tsx'?
   '<div className="announcement-region" aria-label="Anuncios vigentes" hidden/>':realRead(path)});
 assert(forbidden.errors.includes('announcements_still_hidden_in_client'));
});

test('regression: a candidate losing its button/entrypoint or scenario is rejected, and a tracked capability cannot disappear',()=>{
 const altered=inspectFunctionalUi({manifest,read:path=>path==='apps/client/src/App.tsx'?
  '/* deliberately missing UI controls */':realRead(path)});
 assert(altered.errors.some(x=>x.includes('missing_real_source_or_scenario:H6-caja-y-terceros')));
 const removed=structuredClone(manifest);removed.capabilities.pop();
 const checked=inspectFunctionalUi({manifest:removed,read:realRead,prior:manifest});
 assert(checked.errors.some(x=>x.startsWith('tracked_capability_deleted:')));
 const downgraded=structuredClone(manifest);
 downgraded.capabilities.find(x=>x.id==='CV-007-catalogo').status='PENDIENTE';
 const down=inspectFunctionalUi({manifest:downgraded,read:realRead,prior:manifest});
 assert(down.errors.includes('unapproved_status_downgrade:CV-007-catalogo'));
});

test('final acceptance cannot silently pass while announcements, reservations or waiter call are pending',()=>{
 const report=auditFunctionalUi(root,{requireAll:true});
 for(const id of ['CV-014-reservas-anticipadas','CV-014-llamada-camarero'])
  assert(report.errors.includes('functional_ui_not_ready:'+id));
 assert(!report.errors.includes('functional_ui_not_ready:CV-014-comunicaciones-anuncios'));
});
