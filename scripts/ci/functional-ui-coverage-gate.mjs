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
function baseManifest(root,sha){
 if(!/^[a-f0-9]{40}$/i.test(sha||''))return null;
 try{
  const raw=execFileSync('git',['show',sha+':'+COVERAGE_FILE],{cwd:root,encoding:'utf8'});
  return JSON.parse(raw);
 }catch{return null;} // initial rollout: base branch has no register
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.cwd(),prior=baseManifest(root,process.env.FUNCTIONAL_UI_BASE_SHA);
 let result;
 try{result=auditFunctionalUi(root,{prior,requireAll:process.argv.includes('--release')});}
 catch(e){process.stderr.write('FUNCTIONAL_UI_GATE_FAIL: '+e.message+'\n');process.exit(1);}
 for(const gap of result.gaps)process.stdout.write(
  'FUNCTIONAL_UI_PENDING '+gap.id+': '+gap.missing.join(' | ')+'\n');
 if(result.errors.length){
  process.stderr.write('FUNCTIONAL_UI_GATE_FAIL '+result.errors.join(' | ')+'\n');process.exitCode=1;
 }else process.stdout.write(
  'FUNCTIONAL_UI_GATE_PASS: candidate source/interaction evidence tracked; '+
  'pending functions remain NO-GO; no aesthetic or provider acceptance implied\n');
}
