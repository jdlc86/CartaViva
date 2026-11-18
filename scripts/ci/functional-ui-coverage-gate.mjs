#!/usr/bin/env node
/**
 * Functional-first UI gate. This is a traceability/surface guard, NOT a claim
 * that source markers prove behaviour or that the aesthetic design is approved.
 * PG17/Fastify/Chromium integration remains independently mandatory per milestone.
 */
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const COVERAGE_FILE='docs/design/FUNCTIONAL_UI_COVERAGE.json';
export const REQUIRED_IDS=Object.freeze([
 'CV-007-catalogo','H6-caja-y-terceros','H6-checkout',
 'CV-014-comunicaciones-anuncios','CV-014-reservas-anticipadas',
 'CV-014-llamada-camarero'
]);
const STATUSES=new Set(['PENDIENTE','CANDIDATO_TECNICO','FUNCIONALMENTE_VALIDADO']);
const CODE_ROOTS={
 client:'apps/client/',management:'apps/management/',
};
function fileSafe(path){
 return typeof path==='string'&&path.length>0&&/^[a-zA-Z0-9_./-]+$/.test(path)&&
  !path.split('/').includes('..')&&!path.startsWith('/');
}
export function inspectFunctionalUi({manifest,read,prior=null,requireAll=false}){
 const errors=[],gaps=[],ids=new Set(),rows=manifest?.capabilities;
 if(manifest?.schemaVersion!==1||manifest?.stage!=='FUNCIONAL_PRIMERO'||!Array.isArray(rows))
  return {errors:['functional_ui_manifest_invalid'],gaps:[]};
 for(const row of rows){
  if(!row||typeof row.id!=='string'||ids.has(row.id)){errors.push('duplicate_or_invalid_capability');continue;}
  ids.add(row.id);
  if(!STATUSES.has(row.status))errors.push('invalid_capability_status:'+row.id);
  if(!Array.isArray(row.surfaces)||!row.surfaces.length||
    row.surfaces.some(x=>!Object.hasOwn(CODE_ROOTS,x)))errors.push('invalid_surfaces:'+row.id);
  const old=prior?.capabilities?.find(x=>x.id===row.id);
  if(old&&old.status!=='PENDIENTE'&&row.status==='PENDIENTE')
   errors.push('unapproved_status_downgrade:'+row.id);
  if(row.status==='PENDIENTE'){
   if(!Array.isArray(row.blockers)||row.blockers.length===0)
    errors.push('pending_without_reason:'+row.id);
   gaps.push({id:row.id,missing:row.blockers||[]});
   if(requireAll)errors.push('functional_ui_not_ready:'+row.id);
   continue;
  }
  if(!Array.isArray(row.ui)||!Array.isArray(row.api)||!Array.isArray(row.evidence))
   {errors.push('capability_coverage_incomplete:'+row.id);continue;}
  for(const surface of row.surfaces){
   if(!row.ui.some(e=>e.surface===surface&&e.path?.startsWith(CODE_ROOTS[surface])))
    errors.push('missing_visible_ui_entrypoint:'+row.id+':'+surface);
  }
  if(!row.api.some(e=>e.path?.startsWith('apps/api/')))
   errors.push('missing_server_boundary:'+row.id);
  const kinds=new Set(row.evidence.map(e=>e.kind));
  for(const required of ['browser-client','postgres17']){
   if(!kinds.has(required))errors.push('missing_integration_layer:'+row.id+':'+required);
  }
  if(row.status==='FUNCIONALMENTE_VALIDADO'&&row.surfaces.includes('management')&&
   !kinds.has('browser-management'))
   errors.push('missing_management_e2e:'+row.id);
  if(row.status==='FUNCIONALMENTE_VALIDADO'&&!row.acceptanceEvidence)
   errors.push('unattributed_integrated_acceptance:'+row.id);
  for(const group of ['ui','api','evidence'])for(const entry of row[group]){
   if(!fileSafe(entry.path)||typeof entry.marker!=='string'||entry.marker.length<3){
    errors.push('unsafe_or_missing_evidence_reference:'+row.id+':'+group);continue;
   }
   if(group==='ui'&&!Object.values(CODE_ROOTS).some(prefix=>entry.path.startsWith(prefix)))
    errors.push('ui_must_be_product_code:'+row.id+':'+entry.path);
   if(group==='evidence'&&!/^(?:apps\/(?:client|management)\/e2e\/|scripts\/ci\/|tests\/)/.test(entry.path))
    errors.push('test_must_be_integrated_source:'+row.id+':'+entry.path);
   const code=read(entry.path);
   if(typeof code!=='string'||!code.includes(entry.marker))
    errors.push('missing_real_source_or_scenario:'+row.id+':'+entry.path);
  }
  if(row.id==='CV-014-comunicaciones-anuncios'){
   const client=read('apps/client/src/App.tsx')||'';
   if(/className="announcement-region"[^>]*\shidden\s*\/>/.test(client))
    errors.push('announcements_still_hidden_in_client');
  }
 }
 for(const id of REQUIRED_IDS)if(!ids.has(id))errors.push('required_capability_removed:'+id);
 if(prior)for(const old of prior.capabilities||[])
  if(!ids.has(old.id))errors.push('tracked_capability_deleted:'+old.id);
 return {errors:[...new Set(errors)],gaps};
}
function load(root,path){
 const file=join(root,path);
 return existsSync(file)?readFileSync(file,'utf8'):null;
}
export function auditFunctionalUi(root,{prior=null,requireAll=false,overrides={}}={}){
 const content=load(root,COVERAGE_FILE),manifest=content?JSON.parse(content):null;
 return inspectFunctionalUi({
  manifest,prior,requireAll,
  read:path=>Object.hasOwn(overrides,path)?overrides[path]:fileSafe(path)?load(root,path):null
 });
}

/**
 * Mandatory for governed push-main evidence: a missing/unreachable predecessor
 * must NEVER be treated as the initial rollout or as successful regression proof.
 * PR/legacy callers retain the explicit non-governed compatibility mode.
 */
/**
 * Governing release evidence must reject a semantically incomplete previous
 * inventory; ancestry and valid JSON alone do not prove non-regression.
 * This check is intentionally limited to --require-base, preserving legacy CI.
 */
function validGovernedPriorManifest(prior){
 if(prior?.schemaVersion!==1||prior.stage!=='FUNCIONAL_PRIMERO'||
   !Array.isArray(prior.capabilities)||prior.capabilities.length===0)return false;
 const ids=new Set();
 const validEntry=e=>e&&typeof e==='object'&&!Array.isArray(e)&&
  fileSafe(e.path)&&typeof e.marker==='string'&&e.marker.length>=3;
 for(const row of prior.capabilities){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    typeof row.id!=='string'||!row.id.length||row.id.trim()!==row.id||
    ids.has(row.id)||!STATUSES.has(row.status)||
    !Array.isArray(row.surfaces)||!row.surfaces.length||
    row.surfaces.some(surface=>!Object.hasOwn(CODE_ROOTS,surface))||
    new Set(row.surfaces).size!==row.surfaces.length)return false;
  ids.add(row.id);
  if(row.status==='PENDIENTE'){
   if(!Array.isArray(row.blockers)||!row.blockers.length||
     row.blockers.some(reason=>typeof reason!=='string'||!reason.trim()))return false;
   continue;
  }
  if(!Array.isArray(row.ui)||!row.ui.length||
    !Array.isArray(row.api)||!row.api.length||
    !Array.isArray(row.evidence)||!row.evidence.length||
    ![...row.ui,...row.api,...row.evidence].every(validEntry))return false;
  if(row.surfaces.some(surface=>!row.ui.some(e=>
    e.surface===surface&&e.path.startsWith(CODE_ROOTS[surface]))))return false;
  if(!row.api.some(e=>e.path.startsWith('apps/api/')))return false;
  if(row.ui.some(e=>!Object.values(CODE_ROOTS).some(prefix=>e.path.startsWith(prefix)))||
    row.evidence.some(e=>!/^(?:apps\/(?:client|management)\/e2e\/|scripts\/ci\/|tests\/)/.test(e.path)))return false;
  const kinds=new Set(row.evidence.map(e=>e.kind));
  if(!kinds.has('browser-client')||!kinds.has('postgres17')||
    (row.status==='FUNCIONALMENTE_VALIDADO'&&row.surfaces.includes('management')&&
     !kinds.has('browser-management'))||
    (row.status==='FUNCIONALMENTE_VALIDADO'&&!row.acceptanceEvidence))return false;
 }
 return REQUIRED_IDS.every(id=>ids.has(id));
}

export function loadGovernedBaseManifest(root,baseSha,headSha){
 const reject=reason=>{throw Error('governed_functional_ui_'+reason);};
 if(typeof baseSha!=='string'||!/^[0-9a-f]{40}$/.test(baseSha)||/^0{40}$/.test(baseSha))
  reject('base_sha_invalid');
 if(typeof headSha!=='string'||!/^[0-9a-f]{40}$/.test(headSha)||/^0{40}$/.test(headSha))
  reject('head_sha_invalid');
 // Keep historical file content intact; trim only textual Git metadata.
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',
  stdio:['ignore','pipe','ignore']});
 let actual;
 try{actual=git(['rev-parse','HEAD']).trim();}catch{reject('head_unavailable');}
 if(actual!==headSha)reject('head_mismatch');
 if(baseSha===headSha)reject('base_not_previous');
 try{git(['cat-file','-e',baseSha+'^{commit}']);}
 catch{reject('base_commit_unavailable');}
 try{git(['merge-base','--is-ancestor',baseSha,headSha]);}
 catch{reject('base_not_ancestor');}
 let raw;
 try{raw=git(['show',baseSha+':'+COVERAGE_FILE]);}
 catch{reject('base_manifest_unavailable');}
 let prior;
 try{prior=JSON.parse(raw);}catch{reject('base_manifest_invalid');}
 if(prior?.schemaVersion!==1||prior.stage!=='FUNCIONAL_PRIMERO'||
   !Array.isArray(prior.capabilities))reject('base_manifest_invalid');
 if(!validGovernedPriorManifest(prior))reject('base_manifest_incomplete');
 // Traceability must hold in the *historical* commit, not just in the
 // manifest's claimed paths or in the current checkout. Reuse exactly the
 // same source-marker/surface guard on that tree; do not reimplement it.
 const historicalFiles=new Map();
 const readHistorical=path=>{
  if(!fileSafe(path))return null;
  if(!historicalFiles.has(path)){
   let source=null;
   try{source=git(['show',baseSha+':'+path]);}
   catch{/* Absent/unreadable prior path is a closed gate, not a bootstrap. */}
   historicalFiles.set(path,source);
  }
  return historicalFiles.get(path);
 };
 const historical=inspectFunctionalUi({manifest:prior,read:readHistorical});
 if(historical.errors.length)reject('base_manifest_incomplete');
 return prior;
}

function baseManifest(root,sha){
 if(!/^[a-f0-9]{40}$/i.test(sha||''))return null;
 try{
  const raw=execFileSync('git',['show',sha+':'+COVERAGE_FILE],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  return JSON.parse(raw);
 }catch{return null;} // initial rollout: base branch has no register
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.cwd();
 let result;
 try{
  const prior=process.argv.includes('--require-base')?
   loadGovernedBaseManifest(root,process.env.FUNCTIONAL_UI_BASE_SHA,process.env.GITHUB_SHA):
   baseManifest(root,process.env.FUNCTIONAL_UI_BASE_SHA);
  result=auditFunctionalUi(root,{prior,requireAll:process.argv.includes('--release')});
 }catch(e){process.stderr.write('FUNCTIONAL_UI_GATE_FAIL: '+e.message+'\n');process.exit(1);}
 for(const gap of result.gaps)process.stdout.write(
  'FUNCTIONAL_UI_PENDING '+gap.id+': '+gap.missing.join(' | ')+'\n');
 if(result.errors.length){
  process.stderr.write('FUNCTIONAL_UI_GATE_FAIL '+result.errors.join(' | ')+'\n');process.exitCode=1;
 }else process.stdout.write(
  'FUNCTIONAL_UI_GATE_PASS: candidate source/interaction evidence tracked; '+
  'pending functions remain NO-GO; no aesthetic or provider acceptance implied\n');
}
