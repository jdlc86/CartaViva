// One-time Sabora bootstrap stage via OWNER issue, not a release deploy.
const REPO = 'jdlc86/CartaViva';
const SHA = /^[0-9a-f]{40}$/;
const TITLE = /^\[sabora\] bootstrap stage ([0-9a-f]{40})$/;
function stop(reason) { throw new Error('sabora_bootstrap_issue_stop:' + reason); }
function record(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function emptyBody(x) { return x == null || (typeof x === 'string' && x.trim() === ''); }

export function parseSaboraOwnerBootstrapStageIssue(event, context) {
  if (!record(event) || !record(context) || event.action !== 'opened') stop('opened_only');
  if (context.repository !== REPO || event.repository?.full_name !== REPO ||
      event.repository?.owner?.login !== 'jdlc86' || event.repository?.default_branch !== 'main')
    stop('wrong_repository');
  if (context.actor !== 'jdlc86' || event.sender?.login !== 'jdlc86')
    stop('owner_actor_only');
  const issue = event.issue;
  if (!record(issue) || issue.pull_request || issue.user?.login !== 'jdlc86' ||
      issue.state !== 'open' || !Number.isSafeInteger(issue.number) || issue.number < 1)
    stop('owner_issue_only');
  if (typeof issue.title !== 'string' || issue.title.length > 160 || !emptyBody(issue.body))
    stop('invalid_issue_content');
  const match = TITLE.exec(issue.title);
  if (!match) stop('closed_stage_command_only');
  return Object.freeze({issueNumber: issue.number, reviewedMainSha: match[1]});
}

// This is the only Issue admission point for stage. It has no SSH credentials.
// On success, a separate reusable workflow rechecks main, CI, the immutable
// ZIP, environmental secrets and host PIN before any restricted SSH.
export async function acceptSaboraOwnerBootstrapStageIssue({event, context, github}) {
  const request = parseSaboraOwnerBootstrapStageIssue(event, context);
  if (!github?.rest?.issues?.get || !github?.rest?.repos?.getBranch ||
      !github?.rest?.issues?.createComment || !github?.rest?.issues?.update)
    stop('github_api_missing');
  const owner = 'jdlc86', repo = 'CartaViva', issue_number = request.issueNumber;
  const live = (await github.rest.issues.get({owner, repo, issue_number}))?.data;
  if (!record(live) || live.number !== issue_number || live.state !== 'open' ||
      live.pull_request || live.user?.login !== 'jdlc86' ||
      live.title !== event.issue.title || !emptyBody(live.body))
    stop('issue_changed_or_closed');
  const current = (await github.rest.repos.getBranch({owner, repo, branch:'main'}))?.data?.commit?.sha;
  if (typeof current !== 'string' || !SHA.test(current) ||
      current !== request.reviewedMainSha)
    stop('not_exact_current_main');
  // Comment + CLOSE before emitting the SHA. Any failure rejects the next job.
  // The closed Issue means request accepted, NEVER that the ZIP was received.
  await github.rest.issues.createComment({
    owner, repo, issue_number,
    body: 'Sabora bootstrap stage request ACCEPTED, not executed. Exact current main SHA: `' +
      current + '`. A protected reusable workflow will independently check CI, ' +
      'artifact digest, dedicated SSH identity, server PIN and quarantine receipt. ' +
      'No controller installation, SQL, network change, deployment or Fleetia action is authorized.'
  });
  await github.rest.issues.update({owner, repo, issue_number, state:'closed'});
  return Object.freeze({reviewedMainSha:current, issueNumber:issue_number,
    requestAccepted:true, stageExecuted:false});
}
