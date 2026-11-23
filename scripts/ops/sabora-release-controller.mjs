// Only the fixed installed entry executes this module with root privileges.
// Receipt objects are NEVER an input to its public transport boundary.
import {existsSync} from 'node:fs';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {parseForcedReleaseCommand,verifyHostEnvelope} from './sabora-release-host-agent.mjs';
import {parseForcedReleaseCommandV2,verifyHostRunEnvelopeV2} from './sabora-release-host-authorization-v2.mjs';
import {receiveReleaseBundle} from './sabora-release-receiver.mjs';
import {executeScopedSaboraRelease} from './sabora-release-actuator.mjs';
import {CONTROLLER_PATHS as P} from './sabora-release-installation.mjs';
import {createRealReleaseDriver,checkStorageQuota} from './sabora-release-driver.mjs';
import {createReleaseLedger} from './sabora-release-ledger.mjs';
import {acquireReleaseLock,exactKeys,releaseStop as stop} from './sabora-release-protected-store.mjs';

export async function runReleaseController({source,installation}){
 if(process.geteuid?.()!==0||!installation)stop('privileged_installation_required');
 const v2=installation.installationSchema==='sabora-controller-installation/v2';
 const release=acquireReleaseLock(P.state),ledger=createReleaseLedger(P.ledger);
 let consumed=false,timer;
 try{
  ledger.assertReconciled();checkStorageQuota(installation.config);
  // One SSH command line is inserted by the fixed unprivileged launcher.
  // Capture original wire header without accepting paths or executable argv.
  const iterator=source[Symbol.asyncIterator]();let buffered=Buffer.alloc(0);
  const line=async limit=>{
   while(buffered.indexOf(10)<0){
    if(buffered.length>limit)stop('transport_line_limit');
    const next=await iterator.next();if(next.done||!Buffer.isBuffer(next.value))stop('transport_eof');
    buffered=Buffer.concat([buffered,next.value]);
   }
   const end=buffered.indexOf(10);if(end>limit)stop('transport_line_limit');
   const value=buffered.subarray(0,end).toString('utf8');buffered=buffered.subarray(end+1);return value;
  };
  timer=setTimeout(()=>source.destroy(Error('sabora_controller_stop:ingestion_timeout')),120000);
  const command=await line(300),parsed=v2?parseForcedReleaseCommandV2(command):parseForcedReleaseCommand(command);
  if(existsSync(join(P.ledger,parsed.authorizationId+'.json')))stop('authorization_replay');
  const headerLine=await line(49152);let header;
  try{header=JSON.parse(headerLine);}catch{stop('invalid_wire_header');}
  const required=v2?(parsed.operation==='deploy'?['protocol','approvalB64','manifestB64']:['protocol','approvalB64']):
    (parsed.operation==='deploy'?['protocol','approvalB64','signatureB64','manifestB64']:['protocol','approvalB64','signatureB64']);
  const version=v2?'v2':'v1';
  if(!exactKeys(header,required)||header.protocol!==(parsed.operation==='deploy'?'sabora-release-wire/':'sabora-rollback-wire/')+version)
   stop('wire_protocol');
  const original=JSON.stringify(v2?{approvalB64:header.approvalB64}:
   {approvalB64:header.approvalB64,signatureB64:header.signatureB64});
  let priorClock=Date.now();
  const revalidate=()=>{
   const now=Date.now();if(now<priorClock-1000)stop('clock_regressed');priorClock=now;
   const candidate=v2?verifyHostRunEnvelopeV2(command,original,now):
    verifyHostEnvelope(command,original,installation.publicKey,now);
   if(!v2||parsed.operation==='deploy')return candidate;
   // V2 rollback target is read from immutable host history, never supplied
   // by the SSH client. This history is reconciled under the release lock.
   const history=ledger.assertReconciled();
   const target=history.versions.find(entry=>entry.releaseSha===candidate.releaseSha&&entry.status==='healthy');
   if(!target||!/^[a-f0-9]{64}$/.test(target.bundleManifestSha256))stop('rollback_target_not_retained');
   return Object.freeze({...candidate,bundleManifestSha256:target.bundleManifestSha256});
  };
  const receipt=revalidate();
  const driver=createRealReleaseDriver({installation,ledger,receipt,revalidate});
  // Reject absent/foreign dossiers before accepting a large binary payload.
  // They are re-read again at admission and immediately before consumption.
  await driver.verifyEvidence();
  async function* replay(){yield Buffer.from(headerLine+'\n');if(buffered.length)yield buffered;
   for(;;){const next=await iterator.next();if(next.done)break;yield next.value;}}
  let stage;
  if(parsed.operation==='deploy')stage=await receiveReleaseBundle(Readable.from(replay()),{
   command,publicKey:installation.publicKey,stageRoot:P.staging,now:Date.now(),protocolVersion:v2?2:1});
  else{
   if(buffered.length)stop('rollback_trailing_input');
   const end=await iterator.next();if(!end.done)stop('rollback_trailing_input');
  }
  clearTimeout(timer);revalidate();
  const consume=driver.registerAuthorization;
  driver.registerAuthorization=async(...args)=>{consumed=true;return consume(...args);};
  const result=await executeScopedSaboraRelease({receipt,stage,
   stageRoot:parsed.operation==='deploy'?P.staging:P.bundles,driver,operation:parsed.operation});
  return {schema:'sabora-controller-result/v1',releaseSha:result.releaseSha,operation:result.operation,
   authorizationId:receipt.authorizationId,state:'healthy',durablyRecorded:true,
   environment:installation.environment,operationalAcceptance:false};
 }catch(error){
  if(consumed){try{ledger.fail(safeReleaseError(error));}catch{/* immutable consumption/lock still prevent replay */}}
  throw error;
 }finally{clearTimeout(timer);release();}
}
export function safeReleaseError(error){
 const value=String(error?.message??'');
 // Arbitrary filesystem/process/network errors may contain paths or secrets.
 return /^sabora_[a-z_]+_stop:[a-z0-9_:-]+$/.test(value)?value.slice(0,200):'sabora_controller_stop:internal_failure';
}
