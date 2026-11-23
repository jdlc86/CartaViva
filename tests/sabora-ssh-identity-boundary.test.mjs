import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertSaboraReleaseSshBoundary} from '../scripts/ci/sabora-ssh-identity-boundary.mjs';

const workflow=readFileSync(new URL('../.github/workflows/sabora-governed-deploy.yml',import.meta.url),'utf8');

test('Sabora SSH workflow is manually authorized, pinned and isolated from Fleetia',()=>{
 const result=assertSaboraReleaseSshBoundary(workflow);
 assert.equal(result.staticContractPass,true);
 assert.equal(result.actualSshConnectionValidated,false);
 assert.equal(result.controllerInstalled,false);
 assert.equal(result.bootstrapTransferAuthorized,false);
});

test('Sabora SSH boundary rejects cross-project credentials, administrative SSH and pin bypass',()=>{
 const bad=[
  ['other project key', s=>s.replace('secrets.SABORA_SSH_KEY_B64','secrets.FLEETIA_SSH_KEY_B64')],
  ['admin SSH',s=>s.replace('sabora-release@146.59.145.64','ubuntu@146.59.145.64')],
  ['host pin disabled',s=>s.replace('StrictHostKeyChecking=yes','StrictHostKeyChecking=no')],
  ['host pin removed',s=>s.replace('UserKnownHostsFile="$known"','UserKnownHostsFile=/dev/null')],
  ['generic scp',s=>s.replace('set -euo pipefail\n          umask 077','set -euo pipefail\n          scp /tmp/file elsewhere\n          umask 077')],
  ['other repository',s=>s.replace("github.repository == 'jdlc86/CartaViva'","github.repository == 'example/other'")],
  ['not main',s=>s.replace("github.ref == 'refs/heads/main'","github.ref == 'refs/heads/dev'")],
  ['wrong environment',s=>s.replace('environment: sabora-live','environment: other')],
  ['missing installation gate',s=>s.replace(/SABORA_RELEASE_AGENT_READY:.*\n/,'SABORA_RELEASE_AGENT_READY: ready\n')],
  ['missing owner approval gate',s=>s.replace('sabora-release-authorization-v2.mjs create','sabora-release-authorization-v2.mjs skip-create')],
  ['missing CI gate',s=>s.replaceAll('sabora-release-governor.mjs check-ci','sabora-release-governor.mjs skip-ci')],
  ['bootstrap operation injected',s=>s.replace('options: [plan, deploy, rollback]','options: [plan, deploy, rollback, bootstrap]')],
  ['arbitrary SSH protocol',s=>s.replace('sabora-release-v2 $RELEASE_OPERATION','bash $RELEASE_OPERATION')],
  ['wrong Issue proof',s=>s.replace('github.rest.issues.get({owner,repo,issue_number:Number(source)})','github.rest.issues.list({owner,repo})')],
  ['no issue owner verification',s=>s.replace('data.user?.login!==owner','false')],
  ['no owner GitHub check',s=>s.replace("github.actor == 'jdlc86'","github.actor == 'anyone'")],
  ['legacy signing secret',s=>s.replace('secrets.SABORA_SSH_KEY_B64','secrets.SABORA_APPROVAL_SIG_B64')],
  ['self-hosted runner',s=>s.replace('runs-on: ubuntu-24.04','runs-on: self-hosted')],
  ['SSH used in plan',s=>s.replace('node scripts/ci/sabora-release-governor.mjs plan','ssh -F /dev/null arbitrary && node scripts/ci/sabora-release-governor.mjs plan')],
  ['unreviewed workflow trigger',s=>s.replace('  workflow_dispatch:\n','  push:\n  workflow_dispatch:\n')]
 ];
 for(const [name,change] of bad){
  const changed=change(workflow);
  assert.notEqual(changed,workflow,'fixture mutation for '+name);
  assert.throws(()=>assertSaboraReleaseSshBoundary(changed),/sabora_ssh_boundary_stop:/,name);
 }
});
