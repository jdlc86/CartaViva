import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditFunctionalUi,inspectFunctionalUi,loadGovernedBaseManifest,COVERAGE_FILE}
 from '../scripts/ci/functional-ui-coverage-gate.mjs';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(join(root,COVERAGE_FILE),'utf8'));
const realRead=path=>{try{return readFileSync(join(root,path),'utf8');}catch{return null;}};

test('integral functional coverage: candidate interfaces and scenarios exist, CV-014 gaps are not misreported as complete',()=>{
 const report=auditFunctionalUi(root);
 assert.deepEqual(report.errors,[]);
 assert(report.gaps.some(x=>x.id==='CV-014-reservas-anticipadas'));
 assert(report.gaps.some(x=>x.id==='H1-identidad-personal'));
 assert.equal(manifest.capabilities.find(x=>x.id==='CV-014-llamada-camarero').status,
  'CANDIDATO_TECNICO');
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

test('final acceptance cannot silently pass while reservations and other unapproved requirements remain pending',()=>{
 const report=auditFunctionalUi(root,{requireAll:true});
 assert(report.errors.includes('functional_ui_not_ready:CV-014-reservas-anticipadas'));
 assert(report.errors.includes('functional_ui_not_ready:H1-identidad-personal'));
 assert(!report.errors.includes('functional_ui_not_ready:CV-014-llamada-camarero'));
 assert(!report.errors.includes('functional_ui_not_ready:CV-014-comunicaciones-anuncios'));
 // Candidate code is not accepted product, not a deployment authorization:
 // release remains gated by unresolved reservations and visual acceptance.
 assert(report.errors.length>0);
});

test('governed main UI gate rejects zero/missing/divergent ancestry and real status downgrades',()=>{
 const fixture=mkdtempSync(join(tmpdir(),'sabora-ui-main-'));
 const git=(...args)=>execFileSync('git',args,{cwd:fixture,encoding:'utf8',
  stdio:['ignore','pipe','pipe']}).trim();
 const commit=message=>{
  git('add','.');
  git('-c','user.name=Sabora CI','-c','user.email=sabora-test@example.invalid',
   '-c','commit.gpgsign=false','commit','-m',message);
  return git('rev-parse','HEAD');
 };
 const file=(path,content)=>{
  const absolute=join(fixture,path);
  mkdirSync(dirname(absolute),{recursive:true});
  writeFileSync(absolute,content,'utf8');
 };
 const manifestFile=()=>file(COVERAGE_FILE,JSON.stringify(manifest,null,2)+'\n');
 const cli=fileURLToPath(new URL('../scripts/ci/functional-ui-coverage-gate.mjs',import.meta.url));
 const run=(base,head)=>spawnSync(process.execPath,[cli,'--require-base'],{
  cwd:fixture,encoding:'utf8',env:{...process.env,
   FUNCTIONAL_UI_BASE_SHA:base,GITHUB_SHA:head}
 });
 try{
  git('init','-b','main');
  git('config','core.autocrlf','false');
  manifestFile();
  const markers=new Map();
  for(const row of manifest.capabilities)if(row.status!=='PENDIENTE')
   for(const group of ['ui','api','evidence'])
    for(const entry of row[group]||[]){
     if(!markers.has(entry.path))markers.set(entry.path,new Set());
     markers.get(entry.path).add(entry.marker);
    }
  for(const [path,strings] of markers)
   file(path,[...strings].join('\n')+'\n');
  const base=commit('base UI contract');
  file('fixture-update.txt','harmless change\n');
  const head=commit('main successor with unchanged UI');
  const valid=run(base,head);
  assert.equal(valid.status,0,valid.stderr);
  assert.match(valid.stdout,/FUNCTIONAL_UI_GATE_PASS/);
  const zero=run('0'.repeat(40),head);
  assert.notEqual(zero.status,0);
  assert.match(zero.stderr,/governed_functional_ui_base_sha_invalid/);
  const missing=run('f'.repeat(40),head);
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/governed_functional_ui_base_commit_unavailable/);
  const wrongHead=run(base,'f'.repeat(40));
  assert.notEqual(wrongHead.status,0);
  assert.match(wrongHead.stderr,/governed_functional_ui_head_mismatch/);
  git('checkout','-b','unrelated',base);
  file('diverged.txt','different history\n');
  const divergent=commit('commit outside current history');
  git('checkout','main');
  const notAncestor=run(divergent,head);
  assert.notEqual(notAncestor.status,0);
  assert.match(notAncestor.stderr,/governed_functional_ui_base_not_ancestor/);
  assert.equal(loadGovernedBaseManifest(fixture,base,head).schemaVersion,1);

  // PR69-R2-QA-01: significant LF at the end of a historical blob is
  // part of the marker; metadata trimming must not alter file content.
  git('checkout','-b','valid-historical-lf',base);
  const whitespaceManifest=structuredClone(manifest);
  const whitespaceEntry=whitespaceManifest.capabilities
   .find(x=>x.id==='CV-007-catalogo').evidence.find(x=>x.kind==='postgres17');
  const originalMarker=whitespaceEntry.marker;
  whitespaceEntry.marker=originalMarker+'\n';
  const historicalSource=[...markers.get(whitespaceEntry.path)]
   .filter(marker=>marker!==originalMarker).concat(originalMarker).join('\n')+'\n';
  // Ensure this fixture really distinguishes raw blob reads from trim().
  assert(historicalSource.endsWith(whitespaceEntry.marker));
  assert(!historicalSource.trim().includes(whitespaceEntry.marker));
  file(whitespaceEntry.path,historicalSource);
  file(COVERAGE_FILE,JSON.stringify(whitespaceManifest,null,2)+'\n');
  const whitespaceBase=commit('valid historical evidence with significant final LF');
  file('fixture-update.txt','valid successor preserves historical LF\n');
  const whitespaceHead=commit('successor preserves LF-sensitive evidence');
  assert.deepEqual(auditFunctionalUi(fixture).errors,[]);
  const whitespaceResult=run(whitespaceBase,whitespaceHead);
  assert.equal(whitespaceResult.status,0,whitespaceResult.stderr);
  assert.match(whitespaceResult.stdout,/FUNCTIONAL_UI_GATE_PASS/);
  git('checkout','main');

  // Codex PR69-P2-01-R1 proved that a partial but ancestral Git manifest
  // could bypass downgrade comparison; preserve the single disposable Git test.
  const rejectPrior=(name,change)=>{
   git('checkout','-b','adversarial-'+name,base);
   file(COVERAGE_FILE,JSON.stringify(change(structuredClone(manifest)),null,2)+'\n');
   const malformedBase=commit('bad prior '+name);
   manifestFile();
   const repairedHead=commit('restore full inventory '+name);
   const result=run(malformedBase,repairedHead);
   assert.notEqual(result.status,0,'should reject '+name+' predecessor');
   assert.match(result.stderr,/governed_functional_ui_base_manifest_incomplete/,
    'missing fail-closed signal for '+name);
   git('checkout','main');
  };
  rejectPrior('partial',prior=>{
   prior.capabilities=[prior.capabilities.find(x=>x.id==='CV-007-catalogo')];return prior;
  });
  rejectPrior('duplicate',prior=>{
   prior.capabilities.push(structuredClone(prior.capabilities[0]));return prior;
  });
  rejectPrior('bad-status',prior=>{
   prior.capabilities[0].status='UNKNOWN';return prior;
  });
  rejectPrior('blank-id',prior=>{
   prior.capabilities[0].id=' ';return prior;
  });
  rejectPrior('missing-evidence',prior=>{
   prior.capabilities[0].evidence=[];return prior;
  });
  rejectPrior('missing-reason',prior=>{
   prior.capabilities.find(x=>x.status==='PENDIENTE').blockers=[];return prior;
  });
  rejectPrior('null-row',prior=>{
   prior.capabilities[0]=null;return prior;
  });
  // Codex R2 PoC: valid ancestral manifest but its evidence marker never
  // existed in that commit's source tree. The successor repairs the JSON.
  rejectPrior('missing-marker',prior=>{
   prior.capabilities[0].evidence[0].marker=
    '__marker_absent_from_base_commit__';return prior;
  });
  // Full baseline references must exist at base SHA, even when the head has
  // both the files and markers. Removing the historical file must be fatal.
  git('checkout','-b','adversarial-missing-file',base);
  const missingPath=manifest.capabilities[0].evidence[0].path;
  git('rm','--',missingPath);
  const missingFileBase=commit('bad prior missing source file');
  file(missingPath,[...markers.get(missingPath)].join('\n')+'\n');
  const restoredFileHead=commit('restore missing historical evidence file');
  const missingFileResult=run(missingFileBase,restoredFileHead);
  assert.notEqual(missingFileResult.status,0);
  assert.match(missingFileResult.stderr,
   /governed_functional_ui_base_manifest_incomplete/);
  git('checkout','main');
  const downgraded=structuredClone(manifest);
  const catalog=downgraded.capabilities.find(x=>x.id==='CV-007-catalogo');
  catalog.status='PENDIENTE';
  catalog.blockers=['regression fixture'];
  file(COVERAGE_FILE,JSON.stringify(downgraded,null,2)+'\n');
  const degradedHead=commit('regress catalog status');
  const degraded=run(head,degradedHead);
  assert.notEqual(degraded.status,0);
  assert.match(degraded.stderr,/unapproved_status_downgrade:CV-007-catalogo/);
  // The strict mode must not rewrite the historical/opt-in acceptance gate.
  assert.deepEqual(inspectFunctionalUi({manifest,read:realRead}).errors,[]);
 }finally{rmSync(fixture,{recursive:true,force:true});}
});

