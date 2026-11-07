import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gate,STAMP_UI,STAMP_POLICY,classify} from '../scripts/ci/visual-contract-gate.mjs';
const repo='jdlc86/CartaViva',token='test';
const command=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const put=(root,path,content)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),content);};
function init(approved){
 const root=mkdtempSync(join(tmpdir(),'cv-visual-integrated-'));
 command(root,'init','-q','-b','main');
 command(root,'config','user.email','integration@example.invalid');
 command(root,'config','user.name','Integration');
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(128,7)]);
 if(approved)put(root,'docs/design/baselines/client-390.png',png);
 const entry=approved?{
  status:'APPROVED_EXACT_BASELINE',path:'docs/design/baselines/client-390.png',
  sha256:createHash('sha256').update(png).digest('hex'),
  approvalUrl:'https://github.com/jdlc86/CartaViva/issues/100#issuecomment-123',
  approvedBy:'jdlc86',approvedAt:'2026-11-07'
 }:{status:'PENDING_EXACT_BASELINE'};
 put(root,'docs/design/APPROVAL_REGISTER.json',JSON.stringify({schemaVersion:1,screens:{'client-home':entry}}));
 put(root,'apps/client/src/App.tsx',"export const title='old';\n");
 put(root,'README.md','ordinary docs');
 command(root,'add','.');command(root,'commit','-qm','base');
 return {root,base:command(root,'rev-parse','HEAD'),remove:()=>rmSync(root,{recursive:true,force:true})};
}
function commit(f,path,content){
 put(f.root,path,content);command(f.root,'add','.');command(f.root,'commit','-qm','pr candidate');
 return command(f.root,'rev-parse','HEAD');
}
function evidence(comment,head,{client=true,author='jdlc86',artifact=true}={}){
 return async url=>{
  if(url.includes('/actions/runs?'))return {ok:true,json:async()=>({workflow_runs:client?[{name:'Sabora client browser conformance',id:12,head_sha:head,status:'completed',conclusion:'success'}]:[]})};
  if(url.includes('/actions/runs/12/artifacts'))return {ok:true,json:async()=>({artifacts:artifact?[{name:'sabora-client-browser-conformance',expired:false,size_in_bytes:200000}]:[]})};
  return {ok:true,json:async()=>[{user:{login:author,type:'User'},author_association:'OWNER',body:comment}]};
 };
}
function evaluate(f,head,fetcher){return gate({root:f.root,base:f.base,head,repo,pr:100,token,fetcher});}
test('integrated actual Git branch diff denies visual changes without approved PNG on base',async()=>{
 const f=init(false);
 try{
  const head=commit(f,'apps/client/src/App.tsx',"export const title='new';\n");
  const result=await evaluate(f,head,evidence(STAMP_UI+' '+head+' client-home',head));
  assert(result.violations.includes('exact_approved_baseline_missing:client-home'));
  assert.deepEqual(result.screens,['client-home']);
 }finally{f.remove();}
});
test('integrated valid base image + same-head Chromium artifact + owner approval passes',async()=>{
 const f=init(true);
 try{
  const head=commit(f,'apps/client/src/App.tsx',"export const title='new';\n");
  const result=await evaluate(f,head,evidence(STAMP_UI+' '+head+' client-home',head));
  assert.deepEqual(result.violations,[]);
  const stale=await evaluate(f,head,evidence(STAMP_UI+' '+f.base+' client-home',head));
  assert(stale.violations.some(x=>x.startsWith('owner_exact_head_approval_missing')));
  const missing=await evaluate(f,head,evidence(STAMP_UI+' '+head+' client-home',head,{client:false}));
  assert(missing.violations.includes('same_sha_browser_not_successful:client-home'));
  const screenshot=await evaluate(f,head,evidence(STAMP_UI+' '+head+' client-home',head,{artifact:false}));
  assert(screenshot.violations.includes('same_sha_screenshot_artifact_missing:client-home'));
 }finally{f.remove();}
});
test('self-declared PNG in UI PR is rejected even if owner comment is present',async()=>{
 const f=init(false);
 try{
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(128,8)]);
  put(f.root,'docs/design/baselines/client-390.png',png);
  const entry={
   status:'APPROVED_EXACT_BASELINE',path:'docs/design/baselines/client-390.png',
   sha256:createHash('sha256').update(png).digest('hex'),
   approvalUrl:'https://github.com/jdlc86/CartaViva/issues/100#issuecomment-124',
   approvedBy:'jdlc86',approvedAt:'2026-11-07'
  };
  put(f.root,'docs/design/APPROVAL_REGISTER.json',JSON.stringify({schemaVersion:1,screens:{'client-home':entry}}));
  const head=commit(f,'apps/client/src/App.tsx',"export const title='new';\n");
  const result=await evaluate(f,head,evidence(STAMP_UI+' '+head+' client-home',head));
  assert(result.violations.includes('baseline_changed_inside_same_ui_pr'));
  assert(result.violations.includes('exact_approved_baseline_missing:client-home'));
 }finally{f.remove();}
});
test('policy-only change requires audited owner comment, other docs remain unblocked',async()=>{
 const f=init(false);
 try{
  const head=commit(f,'docs/design/VISUAL_CONTROL_GATE.md','new governance');
  const denied=await evaluate(f,head,evidence('no approval',head));
  assert(denied.violations.some(x=>x.startsWith('owner_exact_head_approval_missing')));
  const permitted=await evaluate(f,head,evidence(STAMP_POLICY+' '+head,head));
  assert.deepEqual(permitted.violations,[]);
 }finally{f.remove();}
 const g=init(false);
 try{
  const head=commit(g,'docs/tracking/README.md','tracking only');
  const permitted=await evaluate(g,head,async()=>{throw Error('should not contact GitHub');});
  assert.deepEqual(permitted.violations,[]);
 }finally{g.remove();}
});
test('shared UI changes require proof for both PWA surfaces',()=>{
 const out=classify(['packages/ui/components/Icon.tsx','AGENTS.md']);
 assert.deepEqual(out.screens,['client-home','management-shell']);
 assert.equal(out.governance,true);
});
