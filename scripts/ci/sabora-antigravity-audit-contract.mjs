// Contract gateway for user-owned, read-only Antigravity audits of Sabora.
// Mirrors SaboraAuditRequest v1.0 and audit_report_schema.json supplied by
// the owner's Windows orchestrator; it NEVER invokes Antigravity or GitHub.
export const AUDIT_REPOSITORY='jdlc86/CartaViva';
export const AUDIT_REQUEST_LABEL='audit-request';
export const AUDIT_COMPLETE_LABEL='audit-completed';
export const AUDIT_REQUEST_AUTHOR='jdlc86';
export const AUDIT_TYPES=Object.freeze([
 'security_review','architecture_consistency','release_readiness','targeted_paths_audit']);
export const AUDIT_VERDICTS=Object.freeze(['GO','GO_WITH_WARNINGS','NO-GO']);
const SEVERITIES=new Set(['CRITICAL','HIGH','MEDIUM','LOW','INFO']);
const PATH=/^[A-Za-z0-9_.\-/]+$/;
const SHA=/^[0-9a-fA-F]{7,40}$/;
const FULL_SHA=/^[0-9a-fA-F]{40}$/;
const LINE=/^L[1-9][0-9]*(?:-L?[1-9][0-9]*)?$/;
const own=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype;
const reject=code=>{throw Error('sabora_antigravity_contract_stop:'+code);};
function onlyFields(value,required,optional=[]){
 return own(value)&&required.every(key=>Object.hasOwn(value,key))&&
  Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
}
function pathAllowed(value){
 return typeof value==='string'&&value.length>0&&value.length<=256&&PATH.test(value)&&
  !value.startsWith('/')&&!value.startsWith('.')&&
  !value.includes('..')&&!value.includes('//')&&
  !value.split('/').some(x=>x==='.git'||x===''||x==='.');
}
const unique=values=>new Set(values).size===values.length;
export function validateAntigravityAuditRequest(value,{requireFullSha=false}={}){
 if(!onlyFields(value,['schema_version','repository','commit_sha','audit_type','target_paths'],
   ['focus_questions'])||value.schema_version!=='1.0'||
   value.repository!==AUDIT_REPOSITORY||
   !((requireFullSha?FULL_SHA:SHA).test(value.commit_sha)||(!requireFullSha&&value.commit_sha==='HEAD'))||
   !AUDIT_TYPES.includes(value.audit_type)||
   !Array.isArray(value.target_paths)||value.target_paths.length<1||
   value.target_paths.length>25||!value.target_paths.every(pathAllowed)||
   !unique(value.target_paths))reject('invalid_audit_request');
 const questions=value.focus_questions??[];
 if(!Array.isArray(questions)||questions.length>10||
  !questions.every(q=>typeof q==='string'&&q.trim()===q&&q.length>0&&q.length<=300))
  reject('invalid_focus_questions');
 return Object.freeze({...value,target_paths:Object.freeze([...value.target_paths]),
  ...(value.focus_questions===undefined?{}:{focus_questions:Object.freeze([...questions])})});
}
export function renderAntigravityAuditIssue(value){
 const request=validateAntigravityAuditRequest(value,{requireFullSha:true});
 return 'Solicitud de auditoría independiente de solo lectura para Antigravity.\n\n'+
  '```json\n'+JSON.stringify(request,null,2)+'\n```\n\n'+
  'Solo inspección del SHA exacto. Sin cambios de archivos, comandos, merge ni despliegue.\n';
}
export function extractAntigravityJsonBlock(body){
 if(typeof body!=='string'||body.length>100000)reject('invalid_body');
 const blocks=[...body.matchAll(/```json[ \t]*\r?\n([\s\\S]*?)\r?\n```/g)];
 if(blocks.length!==1||blocks[0][1].length>50000)reject('missing_or_ambiguous_json_block');
 try{return JSON.parse(blocks[0][1]);}catch{reject('invalid_json_block');}
}
export function validateAntigravityAuditIssue(issue){
 const labels=issue?.labels?.map(l=>typeof l==='string'?l:l?.name);
 if(issue?.user?.login!==AUDIT_REQUEST_AUTHOR||
  !Array.isArray(labels)||!labels.includes(AUDIT_REQUEST_LABEL)||
  labels.includes(AUDIT_COMPLETE_LABEL))
  reject('untrusted_issue_origin_or_labels');
 return validateAntigravityAuditRequest(extractAntigravityJsonBlock(issue.body),
  {requireFullSha:true});
}
export function validateAntigravityAuditReport(value,request){
 const sent=validateAntigravityAuditRequest(request,{requireFullSha:true});
 if(!onlyFields(value,['repository','audited_commit_sha','audit_type','verdict',
  'executive_summary','inspected_files','findings','questions_answered'])||
   value.repository!==AUDIT_REPOSITORY||
   value.audited_commit_sha!==sent.commit_sha||
   value.audit_type!==sent.audit_type||
   !AUDIT_VERDICTS.includes(value.verdict)||
   typeof value.executive_summary!=='string'||value.executive_summary.length<1||
   value.executive_summary.length>20000||
   !Array.isArray(value.inspected_files)||value.inspected_files.length<1||
   value.inspected_files.length>200||!value.inspected_files.every(pathAllowed)||
   !Array.isArray(value.findings)||value.findings.length>200||
   !Array.isArray(value.questions_answered)||value.questions_answered.length>20)
  reject('invalid_or_wrong_sha_audit_report');
 if(!value.findings.every(f=>onlyFields(f,[
  'id','severity','file_path','line_reference','title','evidence','recommendation'])&&
   typeof f.id==='string'&&f.id.length>0&&f.id.length<=80&&
   SEVERITIES.has(f.severity)&&pathAllowed(f.file_path)&&LINE.test(f.line_reference)&&
   ['title','evidence','recommendation'].every(k=>typeof f[k]==='string'&&f[k].length>0&&f[k].length<=10000))||
  !value.questions_answered.every(q=>onlyFields(q,['question','answer'])&&
    typeof q.question==='string'&&q.question.length>0&&q.question.length<=300&&
    typeof q.answer==='string'&&q.answer.length>0&&q.answer.length<=20000))
   reject('invalid_audit_report_content');
 return Object.freeze({...value,inspected_files:Object.freeze([...value.inspected_files]),
  findings:Object.freeze([...value.findings]),
  questions_answered:Object.freeze([...value.questions_answered])});
}
export function validateAntigravityIssueComment(comment,request){
 // Validation of the JSON envelope does NOT authenticate the agent process,
 // the Windows machine, or assertions made in prose outside the JSON block.
 const value=extractAntigravityJsonBlock(comment?.body);
 return validateAntigravityAuditReport(value,request);
}
