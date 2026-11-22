import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSaboraOwnerBootstrapStageIssue,acceptSaboraOwnerBootstrapStageIssue}
  from '../scripts/ci/sabora-owner-bootstrap-stage-issue.mjs';

const SHA='85a811af7aa829f57d3bdd9a317c966ce2f07659';
const OLD='426960f0c6e645cd21575e0883e8a03638cc9e3a';
const CONTEXT={repository:'jdlc86/CartaViva',actor:'jdlc86'};
const event=()=>({action:'opened',repository:{full_name:'jdlc86/CartaViva',
  default_branch:'main',owner:{login:'jdlc86'}},sender:{login:'jdlc86'},
  issue:{number:81,state:'open',user:{login:'jdlc86'},
    title:'[sabora] bootstrap stage '+SHA,body:''}});
function api({current=SHA,issue=event().issue,fail=null}={}) {
  const calls=[];
  function act(name,result) {
    return args=>{calls.push({name,args});if(fail===name)throw Error('failed_'+name);
      return {data:structuredClone(result)};};
  }
  return {calls,rest:{
    issues:{get:act('get',issue),createComment:act('comment',{}),update:act('close',{})},
    repos:{getBranch:act('branch',{commit:{sha:current}})}
  }};
}
test('Bootstrap issue: exact owner, exact closed syntax and main SHA',()=>{
  assert.deepEqual(parseSaboraOwnerBootstrapStageIssue(event(),CONTEXT),
    {issueNumber:81,reviewedMainSha:SHA});
  const mutations=[
    x=>{x.action='edited';},
    x=>{x.repository.full_name='jdlc86/GestionIntegral_Rutaa';},
    x=>{x.repository.default_branch='other';},
    x=>{x.repository.owner.login='other';},
    x=>{x.sender.login='github-actions[bot]';},
    x=>{x.issue.user.login='other';},
    x=>{x.issue.state='closed';},
    x=>{x.issue.pull_request={};},
    x=>{x.issue.title='[sabora] release deploy '+SHA;},
    x=>{x.issue.title='[sabora] bootstrap plan '+SHA;},
    x=>{x.issue.title='[sabora] bootstrap stage '+OLD+';whoami';},
    x=>{x.issue.title='[sabora] bootstrap stage '+SHA.slice(0,8);},
    x=>{x.issue.body='shell';},
    x=>{x.issue.number=0;}
  ];
  for(const mutate of mutations){const x=event();mutate(x);
    assert.throws(()=>parseSaboraOwnerBootstrapStageIssue(x,CONTEXT),
      /sabora_bootstrap_issue_stop:/);}
  assert.throws(()=>parseSaboraOwnerBootstrapStageIssue(event(),
    {...CONTEXT,actor:'not-owner'}),/owner_actor_only/);
});
test('Bootstrap admission accepts only live Issue + exact main, closes before output',async()=>{
  const gh=api();
  const receipt=await acceptSaboraOwnerBootstrapStageIssue({
    event:event(),context:CONTEXT,github:gh});
  assert.equal(receipt.reviewedMainSha,SHA);
  assert.equal(receipt.stageExecuted,false);
  assert.deepEqual(gh.calls.map(x=>x.name),['get','branch','comment','close']);
  assert.match(gh.calls[2].args.body,/not executed/);
  assert.equal(gh.calls[3].args.state,'closed');
});
test('Bootstrap admission fail closed on stale SHA and modified or closed live Issue',async()=>{
  for(const gh of [
    api({current:OLD}), api({current:'invalid'}),
    api({issue:{...event().issue,state:'closed'}}),
    api({issue:{...event().issue,body:'changed'}}),
    api({issue:{...event().issue,title:'[sabora] bootstrap stage '+OLD}}),
    api({issue:{...event().issue,user:{login:'attacker'}}})
  ]) {
    await assert.rejects(acceptSaboraOwnerBootstrapStageIssue({
      event:event(),context:CONTEXT,github:gh}),/sabora_bootstrap_issue_stop:/);
    assert.ok(!gh.calls.some(x=>x.name==='comment'||x.name==='close'));
  }
  const failed=api({fail:'comment'});
  await assert.rejects(acceptSaboraOwnerBootstrapStageIssue({
    event:event(),context:CONTEXT,github:failed}),/failed_comment/);
  assert.ok(!failed.calls.some(x=>x.name==='close'));
});
test('Issue stage is a normal environment-bound job; verifier is reusable plan-only',()=>{
 const issue=readFileSync(new URL('../.github/workflows/sabora-owner-issue-deploy-request.yml',import.meta.url),'utf8');
 const direct=readFileSync(new URL('../.github/workflows/sabora-cloud-bootstrap-stage.yml',import.meta.url),'utf8');
 assert.match(issue,/types: \[opened\]/);
 assert.match(issue,/github.actor == github.repository_owner/);
 assert.match(issue,/bootstrap_issue_check:/);
 assert.match(issue,/core.setOutput\('stage_sha', receipt.reviewedMainSha\)/);
 const verifier=issue.slice(issue.indexOf('  bootstrap_verify:'),issue.indexOf('  bootstrap_stage:'));
 assert.match(verifier,/uses: \.\/\.github\/workflows\/sabora-cloud-bootstrap-stage.yml/);
 assert.match(verifier,/operation: plan/);
 assert.doesNotMatch(verifier,/environment:|secrets\.|secrets: inherit|ssh /);
 const stage=issue.slice(issue.indexOf('  bootstrap_stage:'));
 assert.match(stage,/needs: \[bootstrap_issue_check, bootstrap_verify\]/);
 assert.match(stage,/environment: sabora-bootstrap-stage/);
 assert.match(stage,/needs.bootstrap_verify.result == 'success'/);
 assert.match(stage,/github.actor == github.repository_owner/);
 assert.match(stage,/secrets.SABORA_BOOTSTRAP_SSH_KEY_B64/);
 assert.match(stage,/secrets.SABORA_BOOTSTRAP_KNOWN_HOSTS_B64/);
 assert.match(stage,/run: bash scripts\/ci\/sabora-bootstrap-stage-transport.sh/);
 assert.match(direct,/run: bash scripts\/ci\/sabora-bootstrap-stage-transport.sh/);
 assert.match(direct,/environment: sabora-bootstrap-stage/);
 assert.doesNotMatch(issue,/secrets: inherit|\bFLEETIA_KEY\b|jdlc86\/GestionIntegral_Rutaa/);
 const names=[...stage.matchAll(/secrets\.([A-Z][A-Z0-9_]+)/g)].map(x=>x[1]).sort();
 assert.deepEqual(names,['SABORA_BOOTSTRAP_KNOWN_HOSTS_B64','SABORA_BOOTSTRAP_SSH_KEY_B64']);
});
