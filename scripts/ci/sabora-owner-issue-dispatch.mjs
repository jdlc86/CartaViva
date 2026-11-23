// Sabora: Fleetia-style owner Issue -> governed workflow_dispatch bridge.
// This module NEVER executes SSH, Docker, SQL or a controller upgrade.
// The target workflow independently verifies CI, consent, installation and host.
const REPOSITORY = 'jdlc86/CartaViva';
const WORKFLOW = 'sabora-governed-deploy.yml';
const MAIN = 'main';
const REQUEST = /^\[sabora\] release (plan|deploy|rollback) ([0-9a-f]{40})$/;

function stop(reason) { throw new Error('sabora_issue_dispatch_stop:' + reason); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function parseSaboraOwnerReleaseIssue(event, context) {
  if (!isRecord(event) || !isRecord(context)) stop('invalid_event');
  if (event.action !== 'opened') stop('opened_only');
  if (context.repository !== REPOSITORY || event.repository?.full_name !== REPOSITORY ||
      event.repository?.owner?.login !== 'jdlc86' || event.repository?.default_branch !== MAIN)
    stop('wrong_repository');
  if (context.actor !== 'jdlc86' || event.sender?.login !== 'jdlc86')
    stop('untrusted_sender');
  const issue = event.issue;
  if (!isRecord(issue) || issue.pull_request || issue.user?.login !== 'jdlc86')
    stop('owner_issue_only');
  if (issue.state !== 'open' || !Number.isSafeInteger(issue.number) || issue.number < 1)
    stop('invalid_issue');
  if (typeof issue.title !== 'string' || issue.title.length > 160)
    stop('invalid_title');
  const match = REQUEST.exec(issue.title);
  if (!match) stop('invalid_closed_command');
  if (issue.body != null && (typeof issue.body !== 'string' || issue.body.trim() !== ''))
    stop('body_must_be_empty');
  return Object.freeze({
    schema: 'sabora-owner-issue-release-request/v1',
    issueNumber: issue.number,
    operation: match[1],
    releaseSha: match[2],
    repository: REPOSITORY,
    dispatchWorkflow: WORKFLOW,
    branch: MAIN
  });
}

export async function dispatchSaboraOwnerReleaseIssue({event, context, github}) {
  const request = parseSaboraOwnerReleaseIssue(event, context);
  if (!github?.rest?.repos?.getBranch || !github?.rest?.actions?.createWorkflowDispatch ||
      !github?.rest?.issues?.get || !github?.rest?.issues?.createComment ||
      !github?.rest?.issues?.update)
    stop('github_api_unavailable');
  const owner = 'jdlc86';
  const repo = 'CartaViva';
  // A queued event does not prove that the request is still active. An owner
  // can close or edit it before this job starts; stale snapshots MUST stop.
  // This also rejects a replayed event after the Issue was already closed.
  const liveResponse = await github.rest.issues.get({
    owner, repo, issue_number: request.issueNumber
  });
  const live = liveResponse?.data;
  if (!isRecord(live) || live.number !== request.issueNumber ||
      live.state !== 'open' || live.pull_request ||
      live.user?.login !== 'jdlc86' ||
      live.title !== event.issue.title ||
      (live.body != null &&
       (typeof live.body !== 'string' || live.body.trim() !== '')))
    stop('issue_changed_or_closed');
  // GH Actions may be queued while main changes. The target workflow rechecks
  // the exact main SHA, ancestry, full integrated CI and owner-run authorization V2.
  const branch = await github.rest.repos.getBranch({owner, repo, branch: MAIN});
  const mainSha = branch?.data?.commit?.sha;
  if (typeof mainSha !== 'string' || !/^[0-9a-f]{40}$/.test(mainSha))
    stop('untrusted_main_sha');
  if (request.operation === 'deploy' && request.releaseSha !== mainSha)
    stop('deploy_not_exact_main');
  // No application or controller action here. Even after successful dispatch,
  // this is only a REQUEST; authorization occurs later in the protected workflow.
  await github.rest.actions.createWorkflowDispatch({
    owner, repo, workflow_id: WORKFLOW, ref: MAIN,
    inputs: {operation: request.operation, release_sha: request.releaseSha,
      source_issue_number: String(request.issueNumber)}
  });
  await github.rest.issues.createComment({
    owner, repo, issue_number: request.issueNumber,
    body: [
      'Sabora governed workflow REQUESTED via GitHub Actions.',
      'Operation: `' + request.operation + '`; SHA: `' + request.releaseSha + '`.',
      'Main SHA at preflight: `' + mainSha + '`.',
      'This is **dispatch acknowledgment only**, not deployment, installation,',
      'owner authorization, VPS contact, successful checks or acceptance.',
      'The protected workflow MUST independently fail closed unless all gates pass.',
      'See Actions: `.github/workflows/' + WORKFLOW + '`.'
    ].join(' ')
  });
  await github.rest.issues.update({owner, repo, issue_number: request.issueNumber, state: 'closed'});
  return Object.freeze({schema: 'sabora-owner-issue-dispatch-receipt/v1',
    issueNumber: request.issueNumber, operation: request.operation,
    releaseSha: request.releaseSha, dispatchAccepted: true,
    deploymentValidated: false, controllerUpdated: false});
}
