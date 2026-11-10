#!/usr/bin/env node
/**
 * Sabora: a visual change is not accepted on the basis of a lab prototype,
 * an unapproved image, or screenshots from an unrelated revision.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const REGISTER='docs/design/APPROVAL_REGISTER.json';
export const OWNER='jdlc86';
export const STAMP_UI='SABORA-VISUAL-APPROVED';
export const STAMP_POLICY='SABORA-VISUAL-GATE-APPROVED';
const shaPattern=/^[a-f0-9]{40}$/i;
const pngMagic=Buffer.from('89504e470d0a1a0a','hex');
const sh=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'buffer',maxBuffer:30000000});

export function changedFiles(root,base,head){
 if(!shaPattern.test(base)||!shaPattern.test(head))throw Error('immutable base/head SHA required');
 return sh(root,'diff','--no-renames','--name-only','--diff-filter=ACDMRT','-z',base+'...'+head)
  .toString('utf8').split('\0').filter(Boolean);
}
export function classify(files){
 const screens=new Set();let governance=false;
 for(const file of files){
  if(/^apps\/client\/(?:src\/|public\/|index\.html$)/.test(file))screens.add('client-home');
  if(/^apps\/management\/(?:src\/|public\/|index\.html$)/.test(file))screens.add('management-shell');
  if(/^packages\/ui\//.test(file)){screens.add('client-home');screens.add('management-shell');}
  if(file==='AGENTS.md'||file==='docs/DESIGN_SYSTEM_CONTRACT.md'||
    file==='docs/design/APPROVAL_REGISTER.json'||file==='docs/design/APPROVAL_REGISTER.md'||
    file==='docs/design/VISUAL_CONTROL_GATE.md'||file==='.github/PULL_REQUEST_TEMPLATE.md'||
    file==='.github/workflows/visual-contract-gate.yml'||
    file==='scripts/ci/visual-contract-gate.mjs'||file==='tests/visual-contract-gate.test.mjs'||
    /^docs\/design\/(?:screens|references|brand|baselines)\//.test(file))governance=true;
 }
 return {screens:[...screens].sort(),governance};
}
function baseFile(root,base,path){
 if(!shaPattern.test(base)||!/^[-a-zA-Z0-9_./]+$/.test(path)||path.includes('..'))throw Error('invalid path/ref');
 return sh(root,'show',base+':'+path);
}
export function checkBaselines(root,base,screens){
 let register;
 try{register=JSON.parse(baseFile(root,base,REGISTER).toString());}
 catch{return ['approved_register_missing_on_base'];}
 if(register?.schemaVersion!==1||!register.screens||Array.isArray(register.screens))
  return ['approved_register_schema_invalid'];
 const violations=[];
 for(const screen of screens){
  const entry=register.screens[screen];
  if(entry?.status!=='APPROVED_EXACT_BASELINE'){
   violations.push('exact_approved_baseline_missing:'+screen);continue;
  }
  if(!/^docs\/design\/baselines\/[a-z0-9/_-]+\.png$/.test(entry.path||'')||
    !/^[a-f0-9]{64}$/.test(entry.sha256||'')||
    entry.approvedBy!==OWNER||!/^\d{4}-\d\d-\d\d$/.test(entry.approvedAt||'')||
    !/^https:\/\/github\.com\/jdlc86\/CartaViva\/(?:issues|pull)\/\d+(?:#issuecomment-\d+)?$/.test(entry.approvalUrl||'')){
   violations.push('invalid_baseline_metadata:'+screen);continue;
  }
  let bytes;
  try{bytes=baseFile(root,base,entry.path);}
  catch{violations.push('baseline_not_in_base:'+screen);continue;}
  if(bytes.length<100||!bytes.subarray(0,8).equals(pngMagic)){
   violations.push('baseline_not_png:'+screen);continue;
  }
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)
   violations.push('baseline_hash_changed:'+screen);
 }
 return violations;
}
async function api({repo,path,token,fetcher,apiBase}){
 const url=(apiBase||'https://api.github.com')+'/repos/'+repo+'/'+path;
 const response=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
 if(!response.ok)throw Error('GitHub metadata unavailable: '+response.status);
 return response.json();
}
export async function checkOwner({repo,pr,head,screens,governance,token,fetcher=fetch,apiBase}){
 if(repo!=='jdlc86/CartaViva'||!Number.isSafeInteger(pr)||pr<1||!shaPattern.test(head)||!token)
  return ['github_owner_check_context_missing'];
 const purpose=screens.length?STAMP_UI:STAMP_POLICY;
 const exact=purpose+' '+head+(screens.length?' '+screens.join(','):'');
 for(let page=1;page<=10;page++){
  let comments;
  try{comments=await api({repo,path:'issues/'+pr+'/comments?per_page=100&page='+page,
   token,fetcher,apiBase});}
  catch{return ['owner_comment_unverifiable'];}
  if(!Array.isArray(comments))return ['owner_comment_invalid'];
  if(comments.some(c=>c?.user?.login===OWNER&&c?.user?.type!=='Bot'&&
   c?.author_association==='OWNER'&&c?.body?.trim()===exact))return [];
  if(comments.length<100)break;
 }
 return ['owner_exact_head_approval_missing:'+purpose];
}
export async function checkBrowser({repo,head,screens,token,fetcher=fetch,apiBase}){
 if(!screens.length)return [];
 const specs={
  'client-home':['Sabora client browser conformance','sabora-client-browser-conformance'],
  'management-shell':['Sabora management browser visual smoke','sabora-management-visual-smoke']
 };
 let runs;
 try{
  const data=await api({repo,path:'actions/runs?head_sha='+head+'&per_page=100',token,fetcher,apiBase});
  runs=data.workflow_runs;
 }catch{return ['same_sha_browser_runs_unverifiable'];}
 if(!Array.isArray(runs))return ['same_sha_browser_runs_invalid'];
 const problems=[];
 for(const screen of screens){
  const [name,artifact]=specs[screen];
  const good=runs.filter(x=>x.name===name&&x.head_sha===head&&x.status==='completed'&&x.conclusion==='success');
  if(!good.length){problems.push('same_sha_browser_not_successful:'+screen);continue;}
  let found=false;
  for(const run of good){
   try{
    const data=await api({repo,path:'actions/runs/'+run.id+'/artifacts',token,fetcher,apiBase});
    if(data.artifacts?.some(x=>x.name===artifact&&!x.expired&&x.size_in_bytes>10000)){
     found=true;break;
    }
   }catch{/* no success on missing data */}
  }
  if(!found)problems.push('same_sha_screenshot_artifact_missing:'+screen);
 }
 return problems;
}
export async function gate({root,base,head,repo,pr,token,fetcher=fetch,apiBase}){
 const files=changedFiles(root,base,head),{screens,governance}=classify(files);
 const violations=[];
 if(screens.length){
  if(files.some(x=>x===REGISTER||x.startsWith('docs/design/baselines/')))
   violations.push('baseline_changed_inside_same_ui_pr');
  violations.push(...checkBaselines(root,base,screens));
  violations.push(...await checkBrowser({repo,head,screens,token,fetcher,apiBase}));
 }
 if(screens.length||governance)
  violations.push(...await checkOwner({repo,pr,head,screens,governance,token,fetcher,apiBase}));
 return {files,screens,governance,violations};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const base=process.env.VISUAL_BASE_SHA,head=process.env.VISUAL_HEAD_SHA;
 const repo=process.env.GITHUB_REPOSITORY,pr=Number(process.env.VISUAL_PR_NUMBER);
 if(!base||!head||!repo||!process.env.GITHUB_TOKEN||!Number.isSafeInteger(pr)){
  process.stderr.write('VISUAL GATE FAIL: mandatory PR SHA and GitHub token missing\n');
  process.exitCode=1;
 }else try{
  const result=await gate({root:process.cwd(),base,head,repo,pr,token:process.env.GITHUB_TOKEN});
  process.stdout.write('Visual gate scope: '+result.screens.join(',')+'; governance='+result.governance+'\n');
  if(result.violations.length){
   process.stderr.write('VISUAL GATE FAIL: '+result.violations.join(' | ')+'\n');process.exitCode=1;
  }else process.stdout.write('VISUAL GATE PASS (not an independent aesthetic or product acceptance)\n');
 }catch(e){process.stderr.write('VISUAL GATE FAIL: '+e.message+'\n');process.exitCode=1;}
}
