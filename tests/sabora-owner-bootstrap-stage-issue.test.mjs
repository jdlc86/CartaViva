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
test('Issue event runs existing stage workflow as reusable without bypassing guards',()=>{
  const issue=readFileSync(new URL('../.github/workflows/sabora-owner-issue-deploy-request.yml',import.meta.url),'utf8');
  const stage=readFileSync(new URL('../.github/workflows/sabora-cloud-bootstrap-stage.yml',import.meta.url),'utf8');
  assert.match(issue,/types: \[opened\]/);
  assert.match(issue,/github.actor == github.repository_owner/);
  assert.match(issue,/bootstrap_issue_check:/);
  assert.match(issue,/core.setOutput\('stage_sha', receipt.reviewedMainSha\)/);
  assert.match(issue,/needs.bootstrap_issue_check.result == 'success'/);
  assert.match(issue,/uses: \.\/\.github\/workflows\/sabora-cloud-bootstrap-stage.yml/);
  assert.match(issue,/operation: stage/);
  assert.doesNotMatch(issue,/bootstrap_stage:[\s\S]*?secrets: inherit/);
  const callerStage=issue.slice(issue.indexOf('  bootstrap_stage:'));
  assert.match(callerStage,/secrets:\n      SABORA_BOOTSTRAP_SSH_KEY_B64: \$\{\{ secrets\.SABORA_BOOTSTRAP_SSH_KEY_B64 \}\}\n      SABORA_BOOTSTRAP_KNOWN_HOSTS_B64: \$\{\{ secrets\.SABORA_BOOTSTRAP_KNOWN_HOSTS_B64 \}\}/);
  assert.doesNotMatch(callerStage,/secrets: inherit/);
  assert.doesNotMatch(callerStage,/FLEETIA_|service_role|SABORA_APPROVAL_/);
  assert.match(stage,/    secrets:\n      SABORA_BOOTSTRAP_SSH_KEY_B64:\n        required: true\n      SABORA_BOOTSTRAP_KNOWN_HOSTS_B64:\n        required: true\npermissions:/);
  assert.match(stage,/SABORA_BOOTSTRAP_STAGE_SECRETS_UNAVAILABLE/);
  assert.match(stage,/workflow_call:/);
  assert.match(stage,/github.actor == 'jdlc86'/);
  assert.match(stage,/github.event_name == 'issues'/);
  assert.match(stage,/github.event.issue.title == format\('\[sabora\] bootstrap stage \{0\}', inputs.reviewed_main_sha\)/);
  assert.match(stage,/case "\$\{BOOTSTRAP_OPERATION\}" in plan\|stage/);
  assert.match(stage,/node scripts\/ci\/sabora-release-governor.mjs check-ci plan "\$GITHUB_SHA"/);
  assert.match(stage,/StrictHostKeyChecking=yes/);
  assert.match(stage,/environment: sabora-bootstrap-stage/);
  assert.doesNotMatch(issue,/\bFLEETIA_KEY\b|jdlc86\/GestionIntegral_Rutaa/);
});
