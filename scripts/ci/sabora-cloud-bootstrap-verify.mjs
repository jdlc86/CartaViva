import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const BOOTSTRAP=Object.freeze({
 repository:'jdlc86/CartaViva',sourceSha:'426960f0c6e645cd21575e0883e8a03638cc9e3a',
 artifactId:14662749824,artifactRunId:44808053978,artifactSize:8792,
 archiveSha256:'a94c3d09ca371fe2cf021c9fe38bf4694e0c85af9b3c01092eddc6abda6faf5c',
 entries:Object.freeze({
  'root-entry':'0715d57ec87674ef71c36534ecae66195c8a387834772278e0ba6f56a5e0e2f5',
  'ssh-entry':'a9028d71545387af18625c0851e3f486aa95f98992fa04e458bbc1ad16a7b8f0'
 }),
 allowed:Object.freeze(['SHA256SUMS','preparation.txt','root-entry','root-entry.elf-version-info.txt','ssh-entry','ssh-entry.elf-version-info.txt'])
});
function stop(reason){throw Error('sabora_cloud_bootstrap_stop:'+reason);}
const sha=x=>createHash('sha256').update(x).digest('hex');
export function verifyBootstrapArchive(path,policy=BOOTSTRAP){
 const file=resolve(path);
 const stat=lstatSync(file,{throwIfNoEntry:false});
 if(!stat||!stat.isFile()||stat.isSymbolicLink())stop('archive_type');
 if(stat.size!==policy.artifactSize||stat.size>256*1024)stop('archive_digest');
 const bytes=readFileSync(file);
 if(bytes.length!==policy.artifactSize||sha(bytes)!==policy.archiveSha256)stop('archive_digest');
 let filenames;
 try{
  filenames=execFileSync('unzip',['-Z','-1',file],{encoding:'utf8',maxBuffer:32*1024}).trim().split('\n');
  execFileSync('unzip',['-tqq',file],{stdio:'pipe',maxBuffer:32*1024});
 }catch{stop('zip_integrity');}
 if(JSON.stringify(filenames.sort())!==JSON.stringify([...policy.allowed].sort()))stop('archive_entries');
 for(const [name,digest] of Object.entries(policy.entries)){
  const data=execFileSync('unzip',['-p',file,name],{maxBuffer:128*1024});
  if(data.length>128*1024||sha(data)!==digest||!data.subarray(0,4).equals(Buffer.from([0x7f,69,76,70])))
   stop('elf_digest_or_magic:'+name);
 }
 const preparation=execFileSync('unzip',['-p',file,'preparation.txt'],{encoding:'utf8',maxBuffer:16*1024});
 if(!preparation.includes('sourceSha='+policy.sourceSha))stop('source_sha');
 return Object.freeze({schema:'sabora-bootstrap-archive/v1',artifactId:policy.artifactId,
  sourceSha:policy.sourceSha,sha256:policy.archiveSha256,stagingOnly:true,installed:false});
}
export function assertCloudBootstrapWorkflow(source){
 if(typeof source!=='string'||source.length>32*1024)stop('workflow_type');
 const require=(pattern,reason)=>{if(!pattern.test(source))stop('workflow_'+reason);};
 require(/^on:\n  workflow_dispatch:/m,'trigger');
 if(/^\s{2}(?:push|schedule|pull_request|issues|repository_dispatch):/m.test(source))stop('workflow_unsafe_trigger');
 require(/^  workflow_call:\n    inputs:/m,'reusable_call');
 require(/github\.repository == 'jdlc86\/CartaViva'/,'identity_repo');
 require(/github\.ref == 'refs\/heads\/main'/,'identity_ref');
 require(/github\.actor == 'jdlc86'/,'identity_actor');
 require(/github\.event_name == 'workflow_dispatch'/,'direct_owner_dispatch');
 require(/github\.event_name == 'issues'/,'issue_owner_dispatch');
 require(/github\.event\.action == 'opened'/,'issue_opened');
 require(/github\.event\.issue\.user\.login == 'jdlc86'/,'issue_owner');
 require(/github\.event\.issue\.title == format\('\[sabora\] bootstrap stage \{0\}', inputs\.reviewed_main_sha\)/,'exact_stage_issue');
 require(/github\.event\.issue\.body == '' \|\| github\.event\.issue\.body == null/,'empty_issue_body');
 require(/case "\$\{BOOTSTRAP_OPERATION\}" in plan\|stage/,'only_plan_or_stage');
 require(/options: \[plan, stage\]/,'operations');
 require(/environment: sabora-bootstrap-stage/,'environment');
 require(/if: inputs\.operation == 'stage'/,'stage_only');
 require(/permissions:\n  contents: read\n  actions: read/,'permissions');
 require(/secrets\.SABORA_BOOTSTRAP_SSH_KEY_B64/,'ssh_secret');
 require(/secrets\.SABORA_BOOTSTRAP_KNOWN_HOSTS_B64/,'host_secret');
 require(/-o StrictHostKeyChecking=yes/,'host_pin');
 require(/-o HostKeyAlgorithms=ssh-ed25519/,'host_algorithm');
 require(/vars\.SABORA_BOOTSTRAP_HOST_ED25519_FINGERPRINT/,'approved_fingerprint');
 require(/vars\.SABORA_BOOTSTRAP_CLIENT_ED25519_FINGERPRINT/,'approved_client_fingerprint');
 require(/ssh-keygen -y -P '' -f "\$key"/,'unencrypted_ed25519');
 require(/-o UserKnownHostsFile="\$known"/,'known_file');
 require(/-o BatchMode=yes/,'noninteractive');
 require(/-F \/dev\/null -T/,'config_isolation');
 require(/sabora-bootstrap@146\.59\.145\.64/,'target');
 require(/sabora-bootstrap-stage-v1 426960f0c6e645cd21575e0883e8a03638cc9e3a/,'protocol');
 require(/sabora-cloud-bootstrap-verify\.mjs/,'digest_gate');
 const referenced=[...source.matchAll(/secrets\.([A-Z][A-Z0-9_]+)/g)].map(x=>x[1]);
 if(JSON.stringify([...new Set(referenced)].sort())!==JSON.stringify([
  'SABORA_BOOTSTRAP_KNOWN_HOSTS_B64','SABORA_BOOTSTRAP_SSH_KEY_B64']))stop('workflow_other_secrets');
 const executable=source.split('\n').filter(line=>!/^[ \t]*#/.test(line)).join('\n');
 if(/\b(?:sshpass|scp|sftp|rsync|sudo|docker|fleetia|FLEETIA|self-hosted)\b|StrictHostKeyChecking=no|(?:ubuntu|root)@146\.59\.145\.64/i.test(executable))stop('workflow_forbidden');
 const verify=source.match(/\n  verify:\n([\s\S]*?)\n  stage:\n/);
 if(!verify||/\bssh -F\b|secrets\./.test(verify[1]))stop('workflow_plan_side_effect');
 return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,arg]=process.argv.slice(2);
  if(mode==='archive'&&arg)console.log(JSON.stringify(verifyBootstrapArchive(arg)));
  else if(mode==='workflow'){
   assertCloudBootstrapWorkflow(readFileSync(arg??'.github/workflows/sabora-cloud-bootstrap-stage.yml','utf8'));
   console.log('SABORA_BOOTSTRAP_WORKFLOW_STATIC_PASS');
  }else stop('usage');
 }catch(e){console.error(String(e?.message||e));process.exitCode=1;}
}
