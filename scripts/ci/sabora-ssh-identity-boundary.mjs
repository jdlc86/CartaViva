// Static defense in depth: V2 owner GitHub Issue/manual -> exact SHA ->
// environment -> dedicated forced-command SSH. NOT evidence of live setup.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const REQUIRED_SECRETS=Object.freeze(['SABORA_SSH_KEY_B64','SABORA_SSH_KNOWN_HOSTS_B64']);
function stop(reason){throw new Error('sabora_ssh_boundary_stop:'+reason);}
function requireMatch(value,pattern,reason){if(!pattern.test(value))stop(reason);}
export function assertSaboraReleaseSshBoundary(workflow){
 if(typeof workflow!=='string'||workflow.length>128*1024)stop('workflow_invalid');
 const header=workflow.split('\npermissions:')[0];
 requireMatch(header,/^on:\n  workflow_dispatch:/m,'manual_or_owner_issue_only');
 if(/^\s{2}(?:push|pull_request|issues|schedule|workflow_call|repository_dispatch):/m.test(header))
  stop('unexpected_trigger');
 requireMatch(header,/options: \[plan, deploy, rollback\]/,'operation_scope');
 requireMatch(header,/source_issue_number:/,'issue_scope_required');
 requireMatch(workflow,/github\.repository == 'jdlc86\/CartaViva' && github\.ref == 'refs\/heads\/main'/,'repository_scope');
 requireMatch(workflow,/github\.actor == 'jdlc86'/,'manual_owner_check');
 requireMatch(workflow,/github\.actor == 'github-actions\[bot\]'/,'issue_dispatch_actor_check');
 requireMatch(workflow,/github\.rest\.issues\.get\(\{owner,repo,issue_number:Number\(source\)\}\)/,'live_owner_issue_check');
 requireMatch(workflow,/data\.user\?\.login!==owner/,'original_issue_owner');
 requireMatch(workflow,/core\.setOutput\('owner_verified',owner\)/,'owner_proof_to_execute');
 requireMatch(workflow,/environment: sabora-live/,'environment_scope');
 requireMatch(workflow,/^permissions:\n  contents: read\n  actions: read\n  checks: read/m,'readonly_github_token');
 if(/\bself-hosted\b/i.test(workflow))stop('untrusted_runner');
 requireMatch(workflow,/SABORA_RELEASE_AGENT_READY:\s*\$\{\{ vars\.SABORA_RELEASE_AGENT_READY \}\}/,'installation_gate');
 requireMatch(workflow,/test "\$SABORA_RELEASE_AGENT_READY" = explicitly-provisioned-v2/,'installed_v2_only');
 requireMatch(workflow,/SABORA_OWNER_VERIFIED:\s*\$\{\{ needs\.verify\.outputs\.owner_verified \}\}/,'authenticated_owner_output');
 requireMatch(workflow,/SABORA_SOURCE_ISSUE_NUMBER:\s*\$\{\{ needs\.verify\.outputs\.source_issue_number \}\}/,'one_use_source_issue');
 requireMatch(workflow,/sabora-release-authorization-v2\.mjs create/,'v2_authorization');
 requireMatch(workflow,/sabora-release-governor\.mjs check-ci "\$RELEASE_OPERATION" "\$RELEASE_SHA"/,'exact_ci_gate');
 const referenced=[...workflow.matchAll(/\$\{\{\s*secrets\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map(m=>m[1]);
 if(JSON.stringify([...new Set(referenced)].sort())!==JSON.stringify([...REQUIRED_SECRETS].sort()))stop('exclusive_ssh_secrets');
 if(/fleetia|GestionIntegral_Rutaa|FLEETIA|(?:ubuntu|root)@146\.59\.145\.64/i.test(workflow))
  stop('cross_project_or_admin_identity');
 if(/SABORA_APPROVAL_(?:JSON|SIG)_B64|SABORA_APPROVER_PUBLIC_KEY_B64/.test(workflow))
  stop('legacy_signer_must_be_absent');
 const executable=workflow.split('\n').filter(line=>!/^[ \t]*#/.test(line)).join('\n');
 if(/\b(?:sshpass|scp|sftp|rsync)\b|\bdocker\s+(?:compose|run|exec|ps|start|stop|restart|load|pull|push|build)\b/i.test(executable))
  stop('arbitrary_transfer_or_actuation');
 requireMatch(workflow,/\| ssh -F \/dev\/null -T -o BatchMode=yes -o IdentitiesOnly=yes/,'fixed_ssh_client');
 requireMatch(workflow,/-o StrictHostKeyChecking=yes -o UserKnownHostsFile="\$known"/,'host_key_pin');
 requireMatch(workflow,/-i "\$key" -p 22 sabora-release@146\.59\.145\.64/,'exclusive_ssh_identity');
 requireMatch(workflow,/"sabora-release-v2 \$RELEASE_OPERATION \$RELEASE_SHA \$AUTHORIZATION_ID \$AUTHORIZATION_HASH \$GITHUB_RUN_ID"/,'forced_command_protocol');
 const match=workflow.match(/\n  verify:\n([\s\S]*?)\n  execute:\n/);
 if(!match||/\|\s*ssh\s|ssh -F|scp\s|sftp\s/.test(match[1]))stop('remote_plan');
 if(!/if: inputs\.operation == 'deploy' \|\| inputs\.operation == 'rollback'/.test(workflow))
  stop('execution_operation_scope');
 return Object.freeze({schema:'sabora-github-ssh-identity-boundary/v2',
  staticContractPass:true,actualSshConnectionValidated:false,
  controllerInstalled:false,bootstrapTransferAuthorized:false});
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 try{process.stdout.write(JSON.stringify(assertSaboraReleaseSshBoundary(
  readFileSync(resolve('.github/workflows/sabora-governed-deploy.yml'),'utf8')))+'\n');}
 catch(error){process.stderr.write(String(error.message)+'\n');process.exitCode=1;}
}
