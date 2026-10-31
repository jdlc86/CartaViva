// Deterministic repair brief. No credentials, network, writes outside given output.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

export function extractH6Failures(log,{maxItems=30}={}){
 const clean=String(log).replace(/\x1b\[[0-9;]*m/g,'');
 const lines=clean.split(/\r?\n/);
 const findings=[];
 for(let i=0;i<lines.length&&findings.length<maxItems;i++){
  const line=lines[i];
  if(/^not ok \d+ - /.test(line)){
   const title=line.replace(/^not ok \d+ - /,'').slice(0,240);
   const details=lines.slice(i+1,i+45);
   const location=details.find(x=>/^\s*location: /.test(x))?.trim().slice(10)??null;
   const error=details.find(x=>/^\s*error: /.test(x))?.trim().slice(7)??null;
   findings.push({kind:'tap',title,location,error});
  }else if(/(?:^|\s)(?:ERROR:|##\[error\]|fatal:|migration_preflight_failed:)/.test(line)){
   findings.push({kind:'runner',message:line.trim().slice(0,280)});
  }
 }
 return findings;
}

export function createH6DiagnosticReport({runId,commit,block,exitCode,log}){
 const findings=extractH6Failures(log);
 const safe=(value,max)=>String(value??'').replace(/[\r\n\0]/g,' ').slice(0,max);
 return {
  schemaVersion:1,runId:safe(runId,60),commit:safe(commit,60),
  block:safe(block,40),exitCode:Number(exitCode),
  status:Number(exitCode)===0?'pass':'fail',
  findings,unclassifiedFailure:Number(exitCode)!==0&&findings.length===0,
  repairPolicy:{
   maxAttempts:3,scope:'jdlc86/CartaViva',branchOnly:true,
   requirePassingCi:true,allowMerge:false,allowDeploy:false,
   allowOperationalDatabase:false,allowSharedVps:false,
   automaticCodeModification:false,
  },
 };
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const [,,logPath,outputPath,runId,commit,block,code]=process.argv;
 if(!logPath||!outputPath||!block||!/^\d+$/.test(code??'')){
  process.stderr.write('Usage: node h6-failure-diagnostics.mjs <log> <json> <run> <commit> <block> <exit>\n');
  process.exitCode=2;
 }else{
  const report=createH6DiagnosticReport({runId,commit,block,exitCode:Number(code),
   log:readFileSync(logPath,'utf8')});
  writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  process.stdout.write('[H6] diagnostic report saved\n');
 }
}
