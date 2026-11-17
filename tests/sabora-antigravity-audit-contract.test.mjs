import test from 'node:test';
import assert from 'node:assert/strict';
import {
 validateAntigravityAuditRequest,renderAntigravityAuditIssue,
 extractAntigravityJsonBlock,validateAntigravityAuditIssue,
 validateAntigravityAuditReport,validateAntigravityIssueComment
} from '../scripts/ci/sabora-antigravity-audit-contract.mjs';

const sha='a'.repeat(40);
const request={schema_version:'1.0',repository:'jdlc86/CartaViva',commit_sha:sha,
 audit_type:'targeted_paths_audit',target_paths:['AGENTS.md','apps/api/src/h6-stripe-webhook.mjs'],
 focus_questions:['¿Coincide el importe con la deuda persistida?']};
const issue={user:{login:'jdlc86'},labels:[{name:'audit-request'}],
 body:renderAntigravityAuditIssue(request)};
test('Antigravity v1 dispatch renders one bounded literal JSON block, exact author and label',()=>{
 assert.deepEqual(validateAntigravityAuditIssue(issue),request);
 assert.deepEqual(extractAntigravityJsonBlock(issue.body),request);
 assert.equal(issue.body.match(/```json/g).length,1);
});
test('Antigravity v1 permits documented HEAD/short sha only for parsing, not dispatch',()=>{
 assert.equal(validateAntigravityAuditRequest({...request,commit_sha:'HEAD'}).commit_sha,'HEAD');
 assert.throws(()=>renderAntigravityAuditIssue({...request,commit_sha:'HEAD'}),/invalid_audit_request/);
 assert.throws(()=>renderAntigravityAuditIssue({...request,commit_sha:'abcdef1'}),/invalid_audit_request/);
});
test('Antigravity refuses wrong repository, author, absent label, completed label or partial target scope',()=>{
 for(const bad of [
  {...issue,user:{login:'attacker'}},
  {...issue,labels:[]},
  {...issue,labels:[{name:'audit-completed'}]},
  {...issue,body:issue.body.replace('jdlc86/CartaViva','other/CartaViva')},
  {...issue,body:issue.body.replace(sha,'HEAD')}
 ])assert.throws(()=>validateAntigravityAuditIssue(bad),/sabora_antigravity_contract_stop/);
});
test('Antigravity rejects paths, extra fields, oversized prompts and duplicate blocks',()=>{
 for(const path of ['../Fleetia','/root/.ssh','C:/Windows','apps/../evil','.git/config',
  'apps//client','apps\\\\client','apps/client?token=secret']){
  assert.throws(()=>validateAntigravityAuditRequest({...request,target_paths:[path]}),/invalid_audit_request/);
 }
 assert.throws(()=>validateAntigravityAuditRequest({...request,action:'deploy'}),/invalid_audit_request/);
 assert.throws(()=>validateAntigravityAuditRequest({...request,focus_questions:['x'.repeat(301)]}),/invalid_focus_questions/);
 assert.throws(()=>extractAntigravityJsonBlock(issue.body+'\n'+issue.body),/missing_or_ambiguous_json_block/);
});
const report={repository:'jdlc86/CartaViva',audited_commit_sha:sha,audit_type:'targeted_paths_audit',
 verdict:'NO-GO',executive_summary:'Falta validar el caso negativo con PostgreSQL',
 inspected_files:request.target_paths,findings:[{id:'SEC-001',severity:'HIGH',
 file_path:'apps/api/src/h6-stripe-webhook.mjs',line_reference:'L11-L20',
 title:'Invariante pendiente',evidence:'La rama acepta un estado sin test',
 recommendation:'Añadir una prueba de regresión verificable'}],
 questions_answered:[{question:request.focus_questions[0],answer:'No queda acreditado'}]};
test('Antigravity report is correlated by exact SHA/type and scoped fields',()=>{
 assert.deepEqual(validateAntigravityAuditReport(report,request),report);
 assert.deepEqual(validateAntigravityIssueComment({user:{login:'jdlc86'},
  body:'Sección 5\n\n```json\n'+JSON.stringify(report)+'\n```'},request),report);
 assert.throws(()=>validateAntigravityIssueComment({user:{login:'attacker'},
  body:'```json\n'+JSON.stringify(report)+'\n```'},request),
  /untrusted_audit_comment_author/);
 assert.throws(()=>renderAntigravityAuditIssue({...request,commit_sha:sha.toUpperCase()}),
  /invalid_audit_request/);
 for(const change of [{audited_commit_sha:'b'.repeat(40)}, {audit_type:'release_readiness'},
  {secret:'hidden'},{verdict:'APPROVE'}]){
  assert.throws(()=>validateAntigravityAuditReport({...report,...change},request),
   /sabora_antigravity_contract_stop/);
 }
 assert.throws(()=>validateAntigravityAuditReport({
  ...report,findings:[{...report.findings[0],file_path:'../../Fleetia'}]},request),
  /invalid_audit_report_content/);
});
test('Antigravity comment without a structured result cannot be treated as an approval',()=>{
 assert.throws(()=>validateAntigravityIssueComment({body:'GO, everything works'},request),
  /missing_or_ambiguous_json_block/);
});
